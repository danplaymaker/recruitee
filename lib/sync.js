import { fetchOffers } from './recruitee.js';
import { listAllItems, createItem, updateItem } from './webflow.js';
import { slugify } from './normalize.js';

// Webflow field slugs for the Jobs collection.
// If your collection uses different slugs, change them here.
const FIELDS = {
  name: 'name',
  slug: 'slug',
  link: 'link',
  department: 'department',
  brand: 'brand',
};

function offerSlug(offer) {
  return offer.slug || slugify(`${offer.name}-${offer.recruiteeId}`);
}

function buildFieldData(offer, { brand }) {
  return {
    [FIELDS.name]: offer.name,
    [FIELDS.slug]: offerSlug(offer),
    [FIELDS.link]: offer.jobUrl,
    [FIELDS.department]: offer.department,
    [FIELDS.brand]: brand,
  };
}

function indexBySlug(items) {
  const map = new Map();
  for (const item of items) {
    const slug = item?.fieldData?.[FIELDS.slug];
    if (slug) map.set(String(slug), item);
  }
  return map;
}

export async function syncJobs({ collectionId, brand = '', logger = console } = {}) {
  if (!collectionId) throw new Error('Missing WEBFLOW_COLLECTION_ID');

  const stats = { fetched: 0, created: 0, updated: 0, reactivated: 0, archived: 0, errors: [] };

  const [offers, existingItems] = await Promise.all([
    fetchOffers(),
    listAllItems(collectionId),
  ]);

  stats.fetched = offers.length;
  const existingBySlug = indexBySlug(existingItems);
  const seenSlugs = new Set();

  for (const offer of offers) {
    const slug = offerSlug(offer);
    seenSlugs.add(slug);
    const fieldData = buildFieldData(offer, { brand });
    const existing = existingBySlug.get(slug);
    try {
      if (existing) {
        await updateItem(collectionId, existing.id, fieldData, { isArchived: false });
        stats.updated += 1;
        if (existing.isArchived) stats.reactivated += 1;
      } else {
        await createItem(collectionId, fieldData);
        stats.created += 1;
      }
    } catch (err) {
      stats.errors.push({ slug, op: existing ? 'update' : 'create', message: err.message });
      logger.error(`Sync error for ${slug}: ${err.message}`);
    }
  }

  // Archive Webflow items no longer present in Recruitee (reversible, not a delete).
  for (const [slug, item] of existingBySlug) {
    if (seenSlugs.has(slug)) continue;
    if (item.isArchived) continue;
    try {
      await updateItem(collectionId, item.id, {}, { isArchived: true });
      stats.archived += 1;
    } catch (err) {
      stats.errors.push({ slug, op: 'archive', message: err.message });
      logger.error(`Archive error for ${slug}: ${err.message}`);
    }
  }

  return stats;
}
