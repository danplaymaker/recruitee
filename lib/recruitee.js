import { normalizeOffer } from './normalize.js';

const DEFAULT_URL = 'https://distilled.recruitee.com/api/offers/';

export async function fetchOffers() {
  const url = process.env.RECRUITEE_OFFERS_URL || DEFAULT_URL;
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Recruitee request failed: ${res.status} ${res.statusText} ${body}`);
  }

  const data = await res.json();
  const offers = Array.isArray(data?.offers) ? data.offers : [];
  return offers.map(normalizeOffer);
}
