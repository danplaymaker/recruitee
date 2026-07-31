const API_BASE = 'https://api.webflow.com/v2';
const PAGE_SIZE = 100;

function authHeaders() {
  const token = process.env.WEBFLOW_API_TOKEN;
  if (!token) throw new Error('Missing WEBFLOW_API_TOKEN');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    accept: 'application/json',
  };
}

async function request(path, init = {}, { retries = 3 } = {}) {
  const url = `${API_BASE}${path}`;
  let attempt = 0;
  while (true) {
    const res = await fetch(url, { ...init, headers: { ...authHeaders(), ...(init.headers || {}) } });
    if (res.ok) {
      if (res.status === 204) return null;
      return res.json();
    }
    // Retry on rate limit / transient 5xx
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const retryAfter = Number(res.headers.get('retry-after')) || 2 ** attempt;
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      attempt += 1;
      continue;
    }
    const body = await res.text().catch(() => '');
    throw new Error(`Webflow ${init.method || 'GET'} ${path} failed: ${res.status} ${res.statusText} ${body}`);
  }
}

export function getCollection(collectionId) {
  return request(`/collections/${collectionId}`);
}

async function listItemsPath(collectionId, subpath) {
  const items = [];
  let offset = 0;
  while (true) {
    const data = await request(
      `/collections/${collectionId}/items${subpath}?limit=${PAGE_SIZE}&offset=${offset}`,
    );
    const batch = Array.isArray(data?.items) ? data.items : [];
    items.push(...batch);
    const total = data?.pagination?.total ?? items.length;
    offset += batch.length;
    if (batch.length === 0 || offset >= total) break;
  }
  return items;
}

export function listAllItems(collectionId) {
  return listItemsPath(collectionId, '');
}

export function listAllLiveItems(collectionId) {
  return listItemsPath(collectionId, '/live');
}

export function createItem(collectionId, fieldData) {
  return request(`/collections/${collectionId}/items`, {
    method: 'POST',
    body: JSON.stringify({
      isArchived: false,
      isDraft: false,
      fieldData,
    }),
  });
}

export function updateItem(collectionId, itemId, fieldData, extra = {}) {
  const body = { ...extra };
  if (fieldData && Object.keys(fieldData).length > 0) body.fieldData = fieldData;
  return request(`/collections/${collectionId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function publishItems(collectionId, itemIds) {
  if (!itemIds || itemIds.length === 0) return { publishedItemIds: [] };
  const CHUNK = 100;
  const publishedItemIds = [];
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const chunk = itemIds.slice(i, i + CHUNK);
    const res = await request(`/collections/${collectionId}/items/publish`, {
      method: 'POST',
      body: JSON.stringify({ itemIds: chunk }),
    });
    if (Array.isArray(res?.publishedItemIds)) publishedItemIds.push(...res.publishedItemIds);
  }
  return { publishedItemIds };
}

export function listSites() {
  return request(`/sites`);
}

export function getSite(siteId) {
  return request(`/sites/${siteId}`);
}

export function publishSite(siteId, { customDomains = [], publishToWebflowSubdomain = true } = {}) {
  return request(`/sites/${siteId}/publish`, {
    method: 'POST',
    body: JSON.stringify({ customDomains, publishToWebflowSubdomain }),
  });
}
