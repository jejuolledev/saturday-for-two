// Hosted endpoint (Vercel Node function). The Qloo key lives only in the server environment.
import { handlePlan } from '../lib/handler.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; res.setHeader('allow', 'POST'); return res.end('POST only'); }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  res.statusCode = 200;
  res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  await handlePlan({ body, ip, write: (o) => res.write(JSON.stringify(o) + '\n'), end: () => res.end() });
}
