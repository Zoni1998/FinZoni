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
      
      const fallbackModels = [
        requestData.model || 'meta/llama-3.1-8b-instruct',
        'meta/llama-3.1-70b-instruct',
        'meta/llama-3.1-405b-instruct',
        'mistralai/mixtral-8x22b-instruct-v0.1'
      ];

      let lastResponse = null;
      let lastData = null;

      for (const model of fallbackModels) {
        lastResponse = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: requestData.messages,
            temperature: requestData.temperature || 0.7,
            top_p: requestData.top_p || 1,
            max_tokens: requestData.max_tokens || 1024,
          }),
        });

        // Parse response data safely
        try {
           lastData = await lastResponse.json();
        } catch(e) {
           lastData = { error: 'Failed to parse JSON response from NVIDIA API' };
        }

        // If success or a non-overloaded error, return immediately
        if (lastResponse.status !== 529 && lastResponse.status !== 429) {
          return res.status(lastResponse.status).json(lastData);
        }
        // Otherwise (if 529 or 429), the loop continues and tries the next model
      }

      // If all fallbacks failed, return the last error
      return res.status(lastResponse.status).json(lastData);
      
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
