import { syncJobs } from '../lib/sync.js';
import { listSites, listAllItems, listAllLiveItems, getCollection } from '../lib/webflow.js';

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

  const url = new URL(req.url || '/', 'http://localhost');
  const debug = url.searchParams.get('debug');

  if (debug === 'sites') {
    try {
      const data = await listSites();
      const sites = (data?.sites || []).map((s) => ({
        id: s.id,
        displayName: s.displayName,
        shortName: s.shortName,
        customDomains: (s.customDomains || []).map((d) => d.url),
        previewUrl: s.previewUrl,
      }));
      return res.status(200).json({ ok: true, sites });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  if (debug === 'items' || debug === 'items-live') {
    const collectionId = process.env.WEBFLOW_COLLECTION_ID;
    try {
      const [collection, staged, live] = await Promise.all([
        getCollection(collectionId),
        listAllItems(collectionId),
        listAllLiveItems(collectionId),
      ]);
      const slugField = 'slug';
      const summarize = (items) => items.map((it) => ({
        id: it.id,
        slug: it?.fieldData?.[slugField] || null,
        name: it?.fieldData?.name || null,
        isArchived: it.isArchived === true,
        isDraft: it.isDraft === true,
        lastPublished: it.lastPublished || null,
        lastUpdated: it.lastUpdated || null,
      }));
      return res.status(200).json({
        ok: true,
        collection: { id: collection?.id, displayName: collection?.displayName, fieldCount: collection?.fields?.length },
        stagedCount: staged.length,
        liveCount: live.length,
        staged: summarize(staged),
        live: summarize(live),
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  const collectionId = process.env.WEBFLOW_COLLECTION_ID;
  const siteId = process.env.WEBFLOW_SITE_ID;
  const startedAt = new Date().toISOString();

  try {
    const stats = await syncJobs({ collectionId, siteId });
    const finishedAt = new Date().toISOString();
    const ok = stats.errors.length === 0;
    return res.status(ok ? 200 : 207).json({ ok, startedAt, finishedAt, stats });
  } catch (err) {
    console.error('sync-jobs failed', err);
    return res.status(500).json({ ok: false, error: err.message, startedAt });
  }
}
