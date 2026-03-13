

## Plan: Unify Topics & Enforce Strict Classification

### Problem
The backend digest function uses a different topic list than the frontend constants, and the LLM can assign arbitrary topic names. Articles with unrecognized topics appear in "All" but not in any tab.

### Changes

**1. `src/lib/constants.ts`** — Add "Economy" to the `TOPICS` array.

**2. `supabase/functions/digest/index.ts`** — Two changes:
- Update `TOPICS` array (line 9-12) to match the frontend canonical list: `Immigration, Taxes, Housing, Healthcare, Education, Transport, Safety, Politics, Business, Economy, Events, Weather`
- Update the classification prompt (line 113-118) to explicitly instruct the LLM: *"You MUST choose exactly one topic from the list. If none fit, return `NONE`."*
- After classification, filter out articles where `topic === "NONE"` (alongside the existing user-topic filter on line 262-269)

**3. `src/pages/DailyBriefPage.tsx`** — No changes needed. The existing filter on line 91 (`TOPICS.filter(...)`) will now work correctly since backend and frontend share the same topic names.

**4. Redeploy** the `digest` edge function.

### Summary of topic list alignment

```text
Canonical list (both backend + frontend):
Immigration, Taxes, Housing, Healthcare, Education,
Transport, Safety, Politics, Business, Economy, Events, Weather
```

Articles classified as `NONE` will be excluded from the digest entirely and not saved to the database.

