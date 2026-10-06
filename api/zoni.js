import { handleRequest } from './_zoni-core.mjs';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const result = await handleRequest(req);
  return res.status(result.status).json(result.body);
}
