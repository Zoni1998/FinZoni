import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const requestData = await req.json();
    const action = requestData.action || 'chat'; // 'models' or 'chat'
    
    // Use the API key provided in the request payload, fallback to environment variable
    const apiKey = requestData.apiKey || Deno.env.get('NVIDIA_API_KEY');
    
    if (!apiKey) {
      throw new Error('NVIDIA API Key is missing. Provide it in the frontend or set NVIDIA_API_KEY environment variable.');
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
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: response.status,
      });
    } 
    else if (action === 'chat') {
      // Validate request schema to prevent exfiltration / abuse
      if (!requestData.messages || !Array.isArray(requestData.messages)) {
        throw new Error('Invalid request format: "messages" array is required');
      }

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

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: response.status,
      });
    } else {
      throw new Error(`Invalid action: ${action}`);
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
