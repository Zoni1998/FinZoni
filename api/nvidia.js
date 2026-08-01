export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const requestData = req.body;
    const action = requestData.action || 'chat';
    const apiKey = requestData.apiKey;

    if (!apiKey) {
      return res.status(400).json({ error: 'NVIDIA API Key is missing.' });
    }

    if (action === 'models') {
      const response = await fetch('https://integrate.api.nvidia.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        }
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } 
    else if (action === 'chat') {
      const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          model: requestData.model || 'meta/llama-3.1-8b-instruct',
          messages: requestData.messages,
          temperature: requestData.temperature || 0.7,
          top_p: requestData.top_p || 1,
          max_tokens: requestData.max_tokens || 1024,
        }),
      });

      const data = await response.json();
      return res.status(response.status).json(data);
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
