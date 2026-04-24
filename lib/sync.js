import { fetchOffers } from './recruitee.js';
import { getCollection, listAllItems, createItem, updateItem } from './webflow.js';
import { slugify } from './normalize.js';

// Each logical field lists candidate matches (exact slug, then display name).
// We resolve these against the live Webflow schema so the code still works
// when a field's API slug drifts (e.g. a field is renamed in Webflow's UI
// but keeps its original slug).
const FIELD_CANDIDATES = {
  name: ['name', 'title'],
  slug: ['slug'],
  link: ['link', 'url', 'job-url'],
  // Webflow field labelled "Location" — slug may still be department-* if the
  // field was renamed from Department.
  location: ['location', 'department'],
  // Webflow field labelled "Brand" — populated from Recruitee's department.
  brand: ['brand'],
};

function normalizeKey(s) {
  return String(s || '').toLowerCase().trim().replace(/[_\s-]+/g, '-');
}

function resolveFieldSlugs(schemaFields) {
  const bySlug = new Map();
  const byDisplayName = new Map();
  for (const f of schemaFields || []) {
    if (f.slug) bySlug.set(normalizeKey(f.slug), f.slug);
    if (f.displayName) byDisplayName.set(normalizeKey(f.displayName), f.slug);
  }
  const resolved = {};
  for (const [key, candidates] of Object.entries(FIELD_CANDIDATES)) {
    for (const c of candidates) {
      const n = normalizeKey(c);
      if (bySlug.has(n)) { resolved[key] = bySlug.get(n); break; }
      if (byDisplayName.has(n)) { resolved[key] = byDisplayName.get(n); break; }
    }
  }
  return resolved;
}

function offerSlug(offer) {
  return offer.slug || slugify(`${offer.name}-${offer.recruiteeId}`);
}

function buildFieldData(offer, { slugs }) {
  const data = {};
  if (slugs.name) data[slugs.name] = offer.name;
  if (slugs.slug) data[slugs.slug] = offerSlug(offer);
  if (slugs.link && offer.jobUrl) data[slugs.link] = offer.jobUrl;
  if (slugs.location && offer.location) data[slugs.location] = offer.location;
  // Recruitee's department is used as the Webflow "brand" value.
  if (slugs.brand && offer.department) data[slugs.brand] = offer.department;
  return data;
}

function indexBySlug(items, slugKey) {
  const map = new Map();
  for (const item of items) {
    const slug = item?.fieldData?.[slugKey];
    if (slug) map.set(String(slug), item);
  }
  return map;
}

export async function syncJobs({ collectionId, logger = console } = {}) {
  if (!collectionId) throw new Error('Missing WEBFLOW_COLLECTION_ID');

  const stats = {
    fetched: 0, created: 0, updated: 0, reactivated: 0, archived: 0,
    resolvedSlugs: null, errors: [],
  };

  const [collection, offers, existingItems] = await Promise.all([
    getCollection(collectionId),
    fetchOffers(),
    listAllItems(collectionId),
  ]);

  const slugs = resolveFieldSlugs(collection?.fields);
  stats.resolvedSlugs = slugs;

  const missing = ['name', 'slug'].filter((k) => !slugs[k]);
  if (missing.length) {
    throw new Error(
      `Webflow collection is missing required fields: ${missing.join(', ')}. ` +
      `Resolved slugs: ${JSON.stringify(slugs)}`,
    );
  }

  stats.fetched = offers.length;
  const existingBySlug = indexBySlug(existingItems, slugs.slug);
  const seenSlugs = new Set();

  for (const offer of offers) {
    const slug = offerSlug(offer);
    seenSlugs.add(slug);
    const fieldData = buildFieldData(offer, { slugs });
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
