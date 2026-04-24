## Goal
Replace the bare "No summary available." text on the Daily Brief page with a helpful, context-aware empty state — especially for **today**, where the briefing may simply not be ready yet.

## File to change
`src/pages/DailyBriefPage.tsx` only. No backend, no schema changes.

## Changes

### 1. Load the user's scheduled digest time
In the existing profile-loading area (or in `loadCachedSummary`'s effect), add a one-time fetch:

```ts
const { data } = await supabase
  .from("profiles")
  .select("digest_hour, digest_timezone")
  .eq("user_id", user.id)
  .single();
```

Store as `digestHour` (number, default 8) and `digestTimezone` (string, default `Europe/Berlin`) in component state.

### 2. Compute "is today" and a formatted scheduled time
- `isToday = isSameDay(selectedDate, today)` (helper already exists at line 30).
- Format the scheduled time as e.g. `"8:00 AM (Europe/Berlin)"` using `Intl.DateTimeFormat` with `hour: 'numeric'`, `hour12: true`, `timeZone: digestTimezone`.
- Compute `scheduledPassed` = current time in `digestTimezone` is past `digest_hour`. (Used to tweak copy: "should be ready shortly" vs. "will be ready around …".)

### 3. Replace the empty-state block (line 291–293)
Current:
```tsx
<p className="text-sm text-muted-foreground">No summary available.</p>
```

Replace with two branches:

**A. When `isToday` (briefing not generated yet today):**
- Icon (Clock or Sparkles) in a soft circular badge (matches the existing "no articles" empty state style at line 304).
- Headline: *"Your briefing isn't ready yet"*
- Body copy:
  - If `!scheduledPassed`: *"Your daily brief will be ready around **8:00 AM (Europe/Berlin)**. We'll generate it automatically — no action needed."*
  - If `scheduledPassed`: *"Your daily brief was scheduled for **8:00 AM (Europe/Berlin)** but hasn't arrived yet. You can generate it manually below."*
- Two buttons side by side:
  - Primary: **"Generate now"** → calls existing `generateDigest()`, disabled while `loading`, shows spinner.
  - Secondary (outline): **"View yesterday's brief"** → `setSelectedDate(last7Days[1])`.

**B. When `!isToday` (past day with no briefing):**
- Smaller, quieter message: *"No briefing was generated for this day."*
- Single secondary button: **"Back to today"** → `setSelectedDate(today)`.

### 4. Styling
Reuse existing patterns from this file:
- Wrap the empty state in a centered block with `py-10 text-center` inside the existing `<CardContent>`.
- Soft icon badge: `h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4` (same as line 304).
- Buttons: `rounded-xl`, primary uses `style={{ background: 'var(--gradient-hero)' }}` to match the header CTA at line 165.

## Out of scope
- No changes to the digest edge function or scheduling.
- No new DB columns; `digest_hour` / `digest_timezone` already exist on `profiles`.
- The top-right "Generate Digest" header button stays as-is (the new in-card "Generate now" is an additional, contextual entry point).

## Acceptance
- Visiting today's brief before the digest runs shows the scheduled time, a Generate Now button, and a link to yesterday.
- Visiting an older day with no briefing shows a quieter message and a "Back to today" button.
- Once a briefing exists for the selected day, behavior is unchanged.