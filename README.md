# Recruitee → Webflow Jobs Sync

Serverless sync service that pulls published job offers from Recruitee and upserts them into a Webflow CMS "Jobs" collection. Deployed on Vercel, runs hourly via Vercel Cron, and can be triggered manually.

Replaces an existing Zapier workflow with a fully controlled pipeline.

## How it works

1. Fetch all offers from `https://distilled.recruitee.com/api/offers/` (treated as the single source of truth for active jobs).
2. List every item in the Webflow Jobs collection.
3. For each Recruitee offer, upsert the matching Webflow item by `recruitee_id` (create if missing, update otherwise).
4. For every Webflow item whose `recruitee_id` is no longer in the Recruitee response, set `is_active = false`. Items are never deleted or unpublished.
5. Return a JSON summary of created / updated / deactivated counts.

The frontend is expected to filter on `is_active = true`.

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

Create a collection named "Jobs" with these fields (slugs in parentheses are what this code expects):

| Field         | Slug            | Type        |
|---------------|-----------------|-------------|
| Name          | `name`          | Plain text  |
| Recruitee ID  | `recruitee-id`  | Plain text  |
| Location      | `location`      | Plain text  |
| Department    | `department`    | Plain text  |
| Job URL       | `job-url`       | Link        |
| Is Active     | `is-active`     | Switch      |
| Last Seen At  | `last-seen-at`  | Date/Time   |
| Synced At     | `synced-at`     | Date/Time   |

If your collection uses different slugs, edit the `FIELDS` map at the top of `lib/sync.js`.

## Environment variables

Set in Vercel (Project → Settings → Environment Variables). See `.env.example`.

| Variable                | Required | Purpose                                                     |
|-------------------------|----------|-------------------------------------------------------------|
| `WEBFLOW_API_TOKEN`     | yes      | Site API token with CMS read/write scope                    |
| `WEBFLOW_COLLECTION_ID` | yes      | ID of the Jobs collection                                   |
| `CRON_SECRET`           | yes      | Shared secret for authorizing requests                      |
| `RECRUITEE_OFFERS_URL`  | no       | Override the Recruitee endpoint (defaults to distilled)     |

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
    "deactivated": 2,
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
