import { syncJobs } from '../lib/sync.js';

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  // Vercel Cron sends this header automatically when CRON_SECRET is set.
  const auth = req.headers?.authorization || req.headers?.Authorization;
  if (auth === `Bearer ${secret}`) return true;

  // Allow manual triggers via ?secret=... or x-cron-secret header.
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.searchParams.get('secret') === secret) return true;
  if (req.headers?.['x-cron-secret'] === secret) return true;

  return false;
}

export default async function handler(req, res) {
  if (req.method && req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const collectionId = process.env.WEBFLOW_COLLECTION_ID;
  const startedAt = new Date().toISOString();

  try {
    const stats = await syncJobs({ collectionId });
    const finishedAt = new Date().toISOString();
    const ok = stats.errors.length === 0;
    return res.status(ok ? 200 : 207).json({ ok, startedAt, finishedAt, stats });
  } catch (err) {
    console.error('sync-jobs failed', err);
    return res.status(500).json({ ok: false, error: err.message, startedAt });
  }
}
