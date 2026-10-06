import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { requestNvidia } from '../_shared/nvidia-client.js';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const reply = (data: unknown, status: number) => new Response(JSON.stringify(data), { headers, status });
  if (req.method !== 'POST') return reply({ error: 'Method Not Allowed' }, 405);
  try {
    const body = await req.json();
    const action = body.action || 'chat';
    const apiKey = body.apiKey || Deno.env.get('NVIDIA_API_KEY');
    if (!apiKey) return reply({ error: 'NVIDIA_API_KEY_MISSING' }, 400);
    if (!['chat', 'models'].includes(action)) return reply({ error: 'Invalid action' }, 400);
    if (action === 'chat' && (!Array.isArray(body.messages) || !body.messages.length)) return reply({ error: 'Messages are required' }, 400);
    const result = await requestNvidia(action, body, apiKey);
    return reply(result.data, result.status);
  } catch {
    return reply({ error: 'NVIDIA_CONNECTION_FAILED' }, 502);
  }
});

