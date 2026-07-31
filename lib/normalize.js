export function normalizeString(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    for (const key of ['name', 'title', 'value', 'label', 'text']) {
      if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
    }
  }
  return '';
}

function normalizeLocation(offer) {
  const direct = normalizeString(offer.location);
  if (direct) return direct;
  // Try city/country at the top level, then nested under location.
  const loc = (offer.location && typeof offer.location === 'object') ? offer.location : {};
  const city = normalizeString(offer.city) || normalizeString(loc.city);
  const country = normalizeString(offer.country) || normalizeString(loc.country);
  if (city && country) return `${city}, ${country}`;
  return city || country || '';
}

function normalizeDepartment(offer) {
  return normalizeString(offer.department);
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
  const slug = typeof offer.slug === 'string' && offer.slug ? offer.slug : '';
  const location = normalizeLocation(offer);
  const department = normalizeDepartment(offer);
  const jobUrl =
    (typeof offer.careers_url === 'string' && offer.careers_url) ||
    (typeof offer.url === 'string' && offer.url) ||
    '';

  return {
    recruiteeId,
    slug,
    name,
    location,
    department,
    jobUrl,
    // Raw values for debug logging when normalization came up empty.
    _raw: {
      location: offer.location ?? null,
      city: offer.city ?? null,
      country: offer.country ?? null,
      department: offer.department ?? null,
    },
  };
}
