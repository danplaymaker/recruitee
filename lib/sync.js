import { fetchOffers } from './recruitee.js';
import { listAllItems, createItem, updateItem } from './webflow.js';
import { slugify } from './normalize.js';

// Webflow field slugs. If the collection uses different slugs, change them here.
const FIELDS = {
  name: 'name',
  slug: 'slug',
  recruiteeId: 'recruitee-id',
  location: 'location',
  department: 'department',
  jobUrl: 'job-url',
  isActive: 'is-active',
  lastSeenAt: 'last-seen-at',
  syncedAt: 'synced-at',
};

function buildFieldData(offer, { isActive, now }) {
  const fieldData = {
    [FIELDS.name]: offer.name,
    [FIELDS.slug]: slugify(`${offer.name}-${offer.recruiteeId}`),
    [FIELDS.recruiteeId]: offer.recruiteeId,
    [FIELDS.location]: offer.location,
    [FIELDS.department]: offer.department,
    [FIELDS.jobUrl]: offer.jobUrl,
    [FIELDS.isActive]: isActive,
    [FIELDS.syncedAt]: now,
  };
  if (isActive) fieldData[FIELDS.lastSeenAt] = now;
  return fieldData;
}

function indexByRecruiteeId(items) {
  const map = new Map();
  for (const item of items) {
    const rid = item?.fieldData?.[FIELDS.recruiteeId];
    if (rid) map.set(String(rid), item);
  }
  return map;
}

export async function syncJobs({ collectionId, logger = console } = {}) {
  if (!collectionId) throw new Error('Missing WEBFLOW_COLLECTION_ID');

  const now = new Date().toISOString();
  const stats = { fetched: 0, created: 0, updated: 0, deactivated: 0, errors: [] };

  const [offers, existingItems] = await Promise.all([
    fetchOffers(),
    listAllItems(collectionId),
  ]);

  stats.fetched = offers.length;
  const existingByRid = indexByRecruiteeId(existingItems);
  const seenRids = new Set();

  for (const offer of offers) {
    seenRids.add(offer.recruiteeId);
    const fieldData = buildFieldData(offer, { isActive: true, now });
    const existing = existingByRid.get(offer.recruiteeId);
    try {
      if (existing) {
        await updateItem(collectionId, existing.id, fieldData);
        stats.updated += 1;
      } else {
        await createItem(collectionId, fieldData);
        stats.created += 1;
      }
    } catch (err) {
      stats.errors.push({ recruiteeId: offer.recruiteeId, op: existing ? 'update' : 'create', message: err.message });
      logger.error(`Sync error for ${offer.recruiteeId}: ${err.message}`);
    }
  }

  for (const [rid, item] of existingByRid) {
    if (seenRids.has(rid)) continue;
    if (item?.fieldData?.[FIELDS.isActive] === false) continue;
    try {
      await updateItem(collectionId, item.id, {
        [FIELDS.isActive]: false,
        [FIELDS.syncedAt]: now,
      });
      stats.deactivated += 1;
    } catch (err) {
      stats.errors.push({ recruiteeId: rid, op: 'deactivate', message: err.message });
      logger.error(`Deactivate error for ${rid}: ${err.message}`);
    }
  }

  return stats;
}
