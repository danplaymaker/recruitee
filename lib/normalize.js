export function normalizeString(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    if (typeof value.name === 'string') return value.name.trim();
    if (typeof value.title === 'string') return value.title.trim();
  }
  return '';
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 256) || 'job';
}

export function normalizeOffer(offer) {
  const recruiteeId = String(offer.id);
  const name = normalizeString(offer.title) || `Job ${recruiteeId}`;
  const location = normalizeString(offer.location) || normalizeString(offer.city);
  const department = normalizeString(offer.department);
  const jobUrl =
    (typeof offer.careers_url === 'string' && offer.careers_url) ||
    (typeof offer.url === 'string' && offer.url) ||
    '';

  return {
    recruiteeId,
    name,
    location,
    department,
    jobUrl,
  };
}
