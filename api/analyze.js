const SUPABASE_URL = 'https://yoisoqpywoticivriivo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WIs6Z_HN4WUSQdCAAQHRVg_A5BhMYVI';
const hits = new Map();

// Only signed-in MyCellar users may use the label reader (protects your Anthropic credits).
async function getUser(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

function rateLimited(id, max = 60, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  const recent = (hits.get(id) || []).filter(t => now - t < windowMs);
  recent.push(now);
  hits.set(id, recent);
  return recent.length > max;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    if (rateLimited(user.id)) return res.status(429).json({ error: 'Too many requests — try again in a bit.' });

    const { image, mediaType } = req.body;
    if (!image) return res.status(400).json({ error: 'No image provided' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: image
              }
            },
            {
              type: 'text',
              text: `This is a wine bottle label. Extract the wine information and respond ONLY with a JSON object (no markdown, no backticks, no extra text) with these exact keys:
- name: the wine name
- producer: the producer or winery name
- grape: the grape variety or varieties
- vintage: the year
- region: the wine region
- country: the country of origin
- type: must be exactly one of: White, Red, Rosé, Sparkling, Dessert, Orange
- price: estimate the typical retail price range in USD based on the producer, region and wine style (e.g. "$15-20" or "$30-40"). Always provide a price estimate even if not on the label.
- notes: 1 short sentence of typical tasting notes for this specific wine style and region

Return only the JSON object, nothing else.`
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic error:', errText);
      return res.status(500).json({ error: 'Anthropic API error', detail: errText });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in:', cleaned);
      return res.status(500).json({ error: 'Could not parse wine info' });
    }

    const info = JSON.parse(jsonMatch[0]);
    return res.status(200).json(info);

  } catch (e) {
    console.error('Handler error:', e);
    return res.status(500).json({ error: e.message || 'Unknown error' });
  }
}
