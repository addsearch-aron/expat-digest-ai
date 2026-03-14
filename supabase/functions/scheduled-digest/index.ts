import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current UTC hour
    const nowUtc = new Date();
    const utcHour = nowUtc.getUTCHours();

    console.log(`[scheduled-digest] Running at UTC hour ${utcHour}`);

    // Get all profiles and check which ones should run now
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, digest_hour, digest_timezone");

    if (profilesError) throw profilesError;
    if (!profiles || profiles.length === 0) {
      console.log("[scheduled-digest] No profiles found");
      return new Response(JSON.stringify({ triggered: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For each user, convert their preferred hour in their timezone to UTC and check if it matches now
    const usersToTrigger: string[] = [];

    for (const profile of profiles) {
      const userHour = profile.digest_hour ?? 8;
      const userTz = profile.digest_timezone || "Europe/Berlin";

      // Find what UTC hour corresponds to the user's desired local hour today
      // Create a date in the user's timezone at their preferred hour
      const today = new Date();
      const dateStr = today.toISOString().split("T")[0]; // YYYY-MM-DD
      
      try {
        // Use Intl.DateTimeFormat with hourCycle h23 for reliable 0-23 hour format
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: userTz,
          hour: "numeric",
          hourCycle: "h23",
        });
        const parts = formatter.formatToParts(nowUtc);
        const hourPart = parts.find(p => p.type === "hour");
        const localHour = hourPart ? parseInt(hourPart.value, 10) : -1;
        
        console.log(`[scheduled-digest] User ${profile.user_id}: tz=${userTz}, localHour=${localHour}, digestHour=${userHour}`);
        
        if (localHour === userHour) {
          usersToTrigger.push(profile.user_id);
        }
      } catch (e) {
        console.error(`[scheduled-digest] Invalid timezone ${userTz} for user ${profile.user_id}:`, e);
      }
    }

    console.log(`[scheduled-digest] Triggering digest for ${usersToTrigger.length} users`);

    // Trigger digest for each user by calling the digest function with their auth
    const results = await Promise.allSettled(
      usersToTrigger.map(async (userId) => {
        // Create a service-level call to digest, passing user context
        const res = await fetch(`${supabaseUrl}/functions/v1/digest`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseAnonKey}`,
            "x-scheduled-user-id": userId,
          },
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Digest failed for ${userId}: ${err}`);
        }
        return userId;
      })
    );

    const succeeded = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;
    console.log(`[scheduled-digest] Done. Succeeded: ${succeeded}, Failed: ${failed}`);

    return new Response(JSON.stringify({ triggered: usersToTrigger.length, succeeded, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[scheduled-digest] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
