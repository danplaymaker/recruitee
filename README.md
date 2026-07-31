# Recruitee → Webflow Jobs Sync

Serverless sync service that pulls published job offers from Recruitee and upserts them into a Webflow CMS "Jobs" collection. Deployed on Vercel, runs hourly via Vercel Cron, and can be triggered manually.

Replaces an existing Zapier workflow with a fully controlled pipeline.

## How it works

1. Fetch all offers from `https://distilled.recruitee.com/api/offers/` (treated as the single source of truth for active jobs).
2. List every item in the Webflow Jobs collection.
3. For each Recruitee offer, upsert the matching Webflow item by `slug` — using Recruitee's `offer.slug` (create if missing, update + un-archive if it already exists).
4. For every Webflow item whose `slug` is no longer in the Recruitee response, set `isArchived: true`. Items are never deleted or unpublished. Archive is reversible: if a Recruitee offer reappears, the item is un-archived on the next run.
5. Return a JSON summary of created / updated / archived counts.

Archived items are automatically hidden from the live site by Webflow, so the frontend doesn't need to filter anything.

## Project layout

```
api/
  sync-jobs.js      # Vercel function, auth + entry point
lib/
  recruitee.js      # Fetches offers
  webflow.js        # Webflow v2 CMS client (list/create/update, retries on 429/5xx)
  normalize.js      # Safely extracts string fields from object-or-string values
  sync.js           # Upsert + deactivate orchestration
vercel.json         # Hourly cron at `0 * * * *`
```

## Webflow collection

The code is wired for a collection named "Jobs" with these fields:

| Webflow field | Source                                        |
|---------------|-----------------------------------------------|
| Title         | `offer.title`                                 |
| Slug          | `offer.slug` (Recruitee-provided)             |
| Link          | `offer.careers_url` (fallback `offer.url`)    |
| Location      | `offer.location` (object or string)           |
| Brand         | `offer.department` (Recruitee's "department" is used as brand) |

The code resolves each Webflow slug at runtime from the collection schema (by slug, then display name), so renaming a field in Webflow doesn't require a code change. If you add a new field or change the matching semantics, edit `FIELD_CANDIDATES` at the top of `lib/sync.js`.

### Matching key

The upsert key is the Webflow `slug` field, populated from Recruitee's `offer.slug`. Recruitee slugs are unique per offer and stable across runs, so they're a safe identifier.

### Deactivating removed jobs

Because the collection has no `is_active` switch, items whose slug disappears from the Recruitee response are marked `isArchived: true` via the Webflow API. Archive is reversible — if the offer comes back, the item is un-archived on the next run. No items are ever deleted.

## Environment variables

Set in Vercel (Project → Settings → Environment Variables). See `.env.example`.

| Variable                | Required | Purpose                                                     |
|-------------------------|----------|-------------------------------------------------------------|
| `WEBFLOW_API_TOKEN`       | yes      | Site API token with CMS read/write scope (and `sites:write` for site publish) |
| `WEBFLOW_COLLECTION_ID`   | yes      | ID of the Jobs collection                                   |
| `WEBFLOW_SITE_ID`         | yes      | ID of the Webflow site — used to publish the site to the live domain after each sync |
| `CRON_SECRET`             | yes      | Shared secret for authorizing requests                      |
| `RECRUITEE_OFFERS_URL`    | no       | Override the Recruitee endpoint (defaults to distilled)     |

## Deploy

```bash
npm i -g vercel
vercel link
vercel env add WEBFLOW_API_TOKEN
vercel env add WEBFLOW_COLLECTION_ID
vercel env add CRON_SECRET
vercel --prod
```

The cron in `vercel.json` will run `/api/sync-jobs` every hour on the hour. Vercel Cron automatically sends `Authorization: Bearer $CRON_SECRET`.

## Trigger manually

```bash
curl -X POST "https://<your-domain>/api/sync-jobs?secret=$CRON_SECRET"
```

or with a header:

```bash
curl -X POST "https://<your-domain>/api/sync-jobs" \
  -H "x-cron-secret: $CRON_SECRET"
```

Response:

```json
{
  "ok": true,
  "startedAt": "2025-01-01T00:00:00.000Z",
  "finishedAt": "2025-01-01T00:00:07.412Z",
  "stats": {
    "fetched": 24,
    "created": 1,
    "updated": 23,
    "reactivated": 0,
    "archived": 2,
    "errors": []
  }
}
```

Returns `207` with `ok: false` if some items failed but the run completed. Returns `500` if the run aborted before finishing.

## Local development

```bash
vercel dev
curl "http://localhost:3000/api/sync-jobs?secret=$CRON_SECRET"
```
