import { requestNvidia } from './_nvidia-client.js';

export const maxDuration = 60;
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const body = req.body || {};
  const action = body.action || 'chat';
  const apiKey = body.apiKey || process.env.NVIDIA_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'NVIDIA_API_KEY_MISSING' });
  if (!['chat', 'models'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  if (action === 'chat' && (!Array.isArray(body.messages) || !body.messages.length)) return res.status(400).json({ error: 'Messages are required' });
  try {
    const result = await requestNvidia(action, body, apiKey);
    return res.status(result.status).json(result.data);
  } catch {
    return res.status(502).json({ error: 'NVIDIA_CONNECTION_FAILED' });
  }
}

