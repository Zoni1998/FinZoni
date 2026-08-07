export default async function handler(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
    return res.status(200).end();
  }

  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const requestData = req.body || {};
  const action = requestData.action || 'chat';
  const apiKey = requestData.apiKey;

  if (!apiKey) {
    return res.status(400).json({ error: 'NVIDIA API Key is missing.' });
  }

  try {
    if (action === 'models') {
      const response = await fetch('https://integrate.api.nvidia.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        }
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } else if (action === 'chat') {
      const payload = {
        model: requestData.model || 'meta/llama-3.1-8b-instruct',
        messages: requestData.messages,
        temperature: requestData.temperature ?? 0.7,
        top_p: requestData.top_p ?? 1,
        max_tokens: requestData.max_tokens || 1024,
      };
      if (Array.isArray(requestData.tools) && requestData.tools.length > 0) {
        payload.tools = requestData.tools;
        payload.tool_choice = requestData.tool_choice || 'auto';
      }
      if (requestData.response_format) payload.response_format = requestData.response_format;

      const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
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
