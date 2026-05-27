export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
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
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image } },
            { type: 'text', text: 'This is a wine bottle label. Extract the wine information and respond ONLY with a JSON object (no markdown, no backticks) with these exact keys: name, producer, grape, vintage, region, country, type (one of: White, Red, Rosé, Sparkling, Dessert, Orange), price (empty string if not visible), notes (1 short sentence of typical tasting notes for this wine style). If a field is not visible use empty string.' }
          ]
        }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const info = JSON.parse(text.replace(/```json|```/g, '').trim());
    res.status(200).json(info);
  } catch (e) {
    res.status(500).json({ error: 'Could not analyze label' });
  }
}
