import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Level = "city" | "region" | "country";

interface Suggested {
  url: string;
  title: string;
  level: Level;
  description: string;
  publisher?: string;
}

interface ValidatedFeed extends Suggested {
  status: "valid" | "invalid" | "unreachable";
}

// Simple in-memory rate limiter (per cold instance)
const rateLimits = new Map<string, number[]>();
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 10;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const calls = (rateLimits.get(userId) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (calls.length >= RATE_MAX) return false;
  calls.push(now);
  rateLimits.set(userId, calls);
  return true;
}

async function validateFeed(url: string): Promise<"valid" | "invalid" | "unreachable"> {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        // Many news sites block non-browser UAs with 403/503
        "User-Agent":
          "Mozilla/5.0 (compatible; ExpatBriefBot/1.0; +https://expat-digest-ai.lovable.app) Feedfetcher",
        Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5",
        "Accept-Language": "*",
      },
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    // Some servers return 403/406 to bots even when the feed exists. Treat any 4xx/5xx as unreachable but
    // still try to sniff the body — some return 200 with HTML challenge, some return 403 with feed body.
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (res.ok && (ct.includes("xml") || ct.includes("rss") || ct.includes("atom"))) return "valid";

    // Read up to 4KB of the body and look for feed markers anywhere in the snippet (not just at start).
    let text = "";
    try {
      text = (await res.text()).slice(0, 4096).toLowerCase();
    } catch {
      return res.ok ? "invalid" : "unreachable";
    }
    const trimmed = text.trimStart();
    if (
      trimmed.startsWith("<?xml") ||
      trimmed.startsWith("<rss") ||
      trimmed.startsWith("<feed") ||
      // Tag may appear after a BOM, comment, or stylesheet declaration
      text.includes("<rss ") ||
      text.includes("<rss>") ||
      text.includes("<feed ") ||
      text.includes("<feed>") ||
      text.includes("<rdf:rss") ||
      text.includes("xmlns=\"http://www.w3.org/2005/atom\"") ||
      text.includes("xmlns=\"http://purl.org/rss/")
    ) {
      return "valid";
    }
    return res.ok ? "invalid" : "unreachable";
  } catch {
    return "unreachable";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    if (!checkRateLimit(userId)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const country = String(body.country || "").trim();
    const city = String(body.city || "").trim();
    const language = String(body.language || "English").trim();

    if (!country) {
      return new Response(JSON.stringify({ error: "country is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are an expert on local and regional news outlets worldwide.
Suggest well-known, real RSS/Atom feed URLs for the user's location.
CRITICAL RULES:
- Only return feeds you are confident actually exist as working RSS/Atom URLs.
- If you don't know a real, specific feed URL for a publication, OMIT it. Do NOT guess or fabricate URLs.
- Prefer feeds in the user's preferred language; include 1-2 reputable English-language internationals when relevant (e.g. The Local, Reuters country page, BBC).
- Quantity targets (these are MAXIMUMS, not quotas — never invent feeds to hit a number):
    * city-level: aim for 3-5 if the city has that many real outlets with known feeds (1-2 is fine for smaller cities)
    * regional: aim for 4-6
    * national / country-level: aim for 8-10
- It is far better to return fewer feeds than to fabricate a single URL. Quality and correctness beat quantity.
- Each suggestion must include: url (full https URL to the RSS/Atom feed), title (publication name), level (city|region|country), description (one short sentence about what they cover), publisher.`;

    const userPrompt = `Suggest RSS feeds for an expat living in ${city ? `${city}, ` : ""}${country}. Preferred language: ${language}.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_feeds",
              description: "Return a list of suggested RSS feeds for the user's location.",
              parameters: {
                type: "object",
                properties: {
                  feeds: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        url: { type: "string" },
                        title: { type: "string" },
                        level: { type: "string", enum: ["city", "region", "country"] },
                        description: { type: "string" },
                        publisher: { type: "string" },
                      },
                      required: ["url", "title", "level", "description"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["feeds"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_feeds" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    let suggested: Suggested[] = [];
    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        suggested = Array.isArray(args.feeds) ? args.feeds : [];
      } catch (e) {
        console.error("Failed to parse tool args", e);
      }
    }

    // Dedupe by URL
    const seen = new Set<string>();
    suggested = suggested.filter((f) => {
      if (!f?.url || seen.has(f.url)) return false;
      seen.add(f.url);
      return true;
    });

    console.log(`Suggested ${suggested.length} feeds; validating...`);

    const validated: ValidatedFeed[] = await Promise.all(
      suggested.map(async (f) => ({ ...f, status: await validateFeed(f.url) })),
    );

    const valid = validated.filter((f) => f.status === "valid");
    const invalidCount = validated.length - valid.length;
    console.log(`Validation: ${valid.length} valid, ${invalidCount} dropped`);

    return new Response(JSON.stringify({ feeds: valid }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-feeds error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});