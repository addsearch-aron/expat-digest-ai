

## Location-Based RSS Feed Suggestions

Add an AI-powered feature that suggests local RSS feeds based on the user's country and city, with live URL validation. Available both as a new step in onboarding and as a button on the Feeds page.

### 1. Add `country` to user profile

- Migration: `ALTER TABLE profiles ADD COLUMN country text DEFAULT ''`
- Onboarding step 0 ("Where are you based?") becomes a two-field form: **Country** (searchable dropdown of ~200 countries from a static list) + **City** (free text). Country is required; city stays optional but recommended.

### 2. New edge function: `suggest-feeds`

`supabase/functions/suggest-feeds/index.ts`

Input: `{ country: string, city?: string, language?: string }`
Output: `{ feeds: [{ url, title, level: 'city'|'region'|'country', description, status: 'valid'|'invalid'|'unreachable' }] }`

Steps:
1. Call Lovable AI (`google/gemini-3-flash-preview`) with structured tool-calling schema. Prompt asks for ~12 well-known RSS feeds for the location: ~4 city-level, ~3 regional, ~5 national. Each feed must include `url`, `title`, `level`, `description`, plus the publisher name. System prompt forbids guessing — "if you don't know a real feed, omit it". Prefer feeds in the user's preferred language, but include 1-2 English internationals (e.g. The Local, Reuters country page).
2. Validate every suggested URL in parallel:
   - `fetch(url)` with 5s timeout, redirect-follow, `User-Agent: ExpatBrief/1.0`
   - Check `Content-Type` includes `xml`/`rss`/`atom` OR body starts with `<?xml`/`<rss`/`<feed`
   - Mark `valid`, `invalid` (200 but not a feed), or `unreachable` (timeout/4xx/5xx)
3. Return only `valid` feeds to the client (drop the rest, log counts).
4. Auth: validate JWT, rate-limit to 10 calls/hour/user via in-memory map keyed by user_id.

### 3. Onboarding integration

In step 3 ("Add news sources"), add a panel **above** the manual URL input:

```text
┌──────────────────────────────────────────────┐
│ ✨ Suggest feeds for Berlin, Germany         │
│  [Find local feeds]                          │
└──────────────────────────────────────────────┘
```

After click → loading state → grouped checklist:

```text
City — Berlin (3)
  ☑ Berliner Zeitung — Local news, politics
  ☐ rbb24 Berlin — Public broadcaster
  ☑ Tagesspiegel — General Berlin daily

Region (1)
  ☐ rbb Brandenburg — Regional public radio

Country — Germany (4)
  ☑ Deutsche Welle — International news (EN)
  ☑ Der Spiegel — National weekly
  ☐ FAZ — National daily
  ☐ Süddeutsche Zeitung — National daily
```

Top-2 per group pre-selected. "Add selected" button merges checked URLs into the existing `feeds` state (deduping). User can still add custom URLs manually below.

### 4. Feeds page integration

Add a third card above "Add RSS Feed":

```text
┌─────────────────────────────────────────────┐
│ ✨ Suggest feeds for your location           │
│ Based on Berlin, Germany                     │
│              [Suggest feeds]                 │
└─────────────────────────────────────────────┘
```

Same suggest-feeds call → modal with the same grouped checklist → bulk insert into `user_feeds` (skipping any URL the user already has).

### Out of scope

- Region as a separate input field (we let the AI infer region from country+city)
- Geocoding / autocomplete for the city field
- Automatic re-suggestion when the user moves cities (button is always there)
- Persisting "rejected" suggestions (future runs may show them again)

### Files

**New**
- `supabase/functions/suggest-feeds/index.ts` — AI + validation
- `supabase/migrations/<timestamp>_add_country_to_profiles.sql`
- `src/lib/countries.ts` — static country list (~200 entries)
- `src/components/SuggestFeedsDialog.tsx` — shared grouped-checklist UI used by both pages

**Edited**
- `src/pages/OnboardingPage.tsx` — country dropdown in step 0; suggest panel in step 3
- `src/pages/FeedsPage.tsx` — suggest card + dialog
- `src/integrations/supabase/types.ts` — auto-regenerated for new column

