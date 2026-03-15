

## Browse Past 7 Days of Executive Briefings

The `executive_summaries` table and 7-day retention cron already exist. This is purely a frontend change to add day navigation.

### Changes to `src/pages/DailyBriefPage.tsx`

1. **Add date state** — `selectedDate` initialized to today, constrained to last 7 days.

2. **Day navigation bar** inside the Executive Briefing card header:
   - Show the current selected day formatted as **"Sunday, Mar 15"**
   - Left/right chevron buttons to move between days
   - Left button disabled when 7 days back; right button disabled when on today
   - Subtle pill-style day selector showing the last 7 days as clickable day abbreviations (S, M, T, W, T, F, S) with the active one highlighted

3. **Update `loadCachedSummary`** to accept a date parameter and query summaries filtered to that specific day:
   ```sql
   SELECT summary, created_at FROM executive_summaries
   WHERE user_id = ? 
     AND created_at >= startOfDay
     AND created_at < startOfNextDay
   ORDER BY created_at DESC LIMIT 1
   ```

4. **Re-fetch on date change** — `useEffect` on `selectedDate` triggers `loadCachedSummary(selectedDate)`.

5. **Today indicator** — When viewing today's briefing, show a small "Today" badge next to the date.

No database or backend changes needed — the table and retention policy are already in place.

