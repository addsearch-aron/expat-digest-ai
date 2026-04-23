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

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

interface FeedspotCandidate {
  url: string;
  publisher?: string;
}

const FEEDSPOT_COUNTRY_ALIASES: Record<string, string[]> = {
  spain: ["spanish"],
  germany: ["german"],
  france: ["french"],
  italy: ["italian"],
  portugal: ["portuguese"],
  netherlands: ["dutch"],
  greece: ["greek"],
  sweden: ["swedish"],
  norway: ["norwegian"],
  denmark: ["danish"],
  finland: ["finnish"],
  poland: ["polish"],
  czech_republic: ["czech"],
  austria: ["austrian", "german"],
  switzerland: ["swiss", "german", "french", "italian"],
  belgium: ["belgian", "dutch", "french"],
  ireland: ["irish"],
  scotland: ["scottish"],
  wales: ["welsh"],
  japan: ["japanese"],
  china: ["chinese"],
  taiwan: ["taiwanese", "chinese"],
  korea: ["korean"],
  south_korea: ["korean"],
  india: ["indian"],
  turkey: ["turkish"],
  russia: ["russian"],
  ukraine: ["ukrainian"],
  israel: ["israeli", "hebrew"],
  mexico: ["mexican", "spanish"],
  argentina: ["argentinian", "spanish"],
  colombia: ["colombian", "spanish"],
  chile: ["chilean", "spanish"],
  peru: ["peruvian", "spanish"],
  brazil: ["brazilian", "portuguese"],
  united_states: ["american"],
  united_kingdom: ["british", "english"],
  uk: ["british", "english"],
};

async function fetchFeedspotPage(slug: string): Promise<FeedspotCandidate[]> {
  const url = `https://rss.feedspot.com/${slug}_news_rss_feeds/`;
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ExpatBriefBot/1.0; +https://expat-digest-ai.lovable.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.log(`Feedspot ${slug}: ${res.status}`);
      return [];
    }
    const html = await res.text();

    // Extract candidate feed URLs from the HTML.
    // Match links that look like RSS/Atom endpoints.
    const urlRe = /https?:\/\/[^\s"'<>]+?(?:\/(?:rss|feed|atom|feeds)(?:[\/.][^\s"'<>]*)?|\.(?:rss|atom|xml)(?:\?[^\s"'<>]*)?)/gi;
    const found = new Map<string, FeedspotCandidate>();
    // Strip HTML tags to plain text for heading lookup, but use indexed matching on raw HTML.
    let m: RegExpExecArray | null;
    const headingRe = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>|<a[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = urlRe.exec(html)) !== null) {
      const raw = m[0];
      const idx = m.index;
      const clean = raw.replace(/[)\].,;]+$/, "");
      if (/feedspot\.com|fonts\.|googleapis|gstatic|cdn\.|\.css|\.js$|\.png$|\.jpg$|\.svg$|\.ico$/i.test(clean)) continue;
      if (clean.length > 300) continue;
      if (found.has(clean)) continue;

      // Look back up to 800 chars for the nearest heading or anchor text — that's the publisher.
      const windowStart = Math.max(0, idx - 800);
      const windowHtml = html.slice(windowStart, idx);
      headingRe.lastIndex = 0;
      let lastText: string | undefined;
      let hm: RegExpExecArray | null;
      while ((hm = headingRe.exec(windowHtml)) !== null) {
        const text = (hm[1] || hm[2] || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (text && text.length >= 2 && text.length <= 120 && !/^(rss|feed|subscribe|home|next|prev)$/i.test(text)) {
          lastText = text;
        }
      }
      found.set(clean, { url: clean, publisher: lastText });
    }
    const extracted = Array.from(found.values());
    console.log(`Feedspot ${slug}: extracted ${extracted.length} candidates`);
    return extracted;
  } catch (error) {
    console.log(`Feedspot ${slug}: ${error instanceof Error ? error.message : "fetch failed"}`);
    return [];
  }
}

async function fetchFeedspotCandidates(
  city: string,
  country: string,
  language: string,
): Promise<FeedspotCandidate[]> {
  const slugs: string[] = [];
  const countrySlug = country ? slugify(country) : "";
  const languageSlug = language ? slugify(language) : "";
  const citySlug = city ? slugify(city) : "";

  if (countrySlug) {
    slugs.push(countrySlug, ...((FEEDSPOT_COUNTRY_ALIASES[countrySlug] || []).map(slugify)));
  }
  if (languageSlug) slugs.push(languageSlug);
  if (citySlug) slugs.push(citySlug);

  const uniqueSlugs = slugs.filter((slug, index) => slug && slugs.indexOf(slug) === index);

  console.log(`Feedspot slugs: ${uniqueSlugs.join(", ") || "(none)"}`);

  const results = await Promise.allSettled(uniqueSlugs.map((s) => fetchFeedspotPage(s)));
  const all: FeedspotCandidate[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }
  // Dedupe by URL, cap at 30
  const seen = new Set<string>();
  const out: FeedspotCandidate[] = [];
  for (const c of all) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    out.push(c);
    if (out.length >= 30) break;
  }
  return out;
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

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are an expert on local, regional, and national news outlets worldwide.

Your task is to assemble a list of useful RSS/Atom feeds for an expat living in ${city ? `${city}, ` : ""}${country}, reading in ${language}.

Geographic levels:
- city = primarily covers this city or its metro area
- region = covers the broader state/province/Land/autonomous region
- country = national coverage

You will receive a shortlist of candidate feeds discovered from a curated public RSS directory. Treat these as **pre-vetted real publishers**. Your job is to:
(a) **Keep every shortlist candidate that plausibly serves a ${language}-speaking expat in ${country}** — when in doubt, keep it. URLs are validated server-side, so the validator drops broken ones.
(b) Drop only obvious non-news entries: podcasts unrelated to news, single-topic hobby blogs (cooking, sports-team-only, etc.), defunct sites, or feeds clearly outside ${country}.
(c) Classify each kept entry as city / region / country.
(d) You may add 0-3 additional well-known feeds you are confident exist (e.g. major national broadcasters with stable RSS endpoints).

Quantity targets (these are minimums, not caps):
- city: 1-3
- region: 3-6
- country: 6-15

If the shortlist contains more relevant publishers than the target range, **return more — do not artificially cap**. The user benefits from breadth.

Quality filtering applies primarily to feeds you add yourself, not to shortlist entries. For shortlist candidates, default to keeping.

Other rules:
- Prefer feeds in the user's preferred language, but include 1-2 reputable English-language sources if useful for expats.
- Do not invent publications or fabricate URLs using generic patterns like /rss or /feed without specific knowledge.
- If city-level coverage is limited, use the nearest genuine metro/local outlet rather than promoting national outlets to city level.

For each suggestion include: url, title, level, description, publisher.`;

    // Discover candidate feeds from Feedspot to give the LLM a real shortlist.
    const feedspotCandidates = await fetchFeedspotCandidates(city, country, language);
    console.log(`Feedspot returned ${feedspotCandidates.length} candidate URLs`);

    const candidatesBlock = feedspotCandidates.length
      ? `\n\nCandidate feeds discovered from a public RSS directory (use these as your primary source — select the relevant ones and classify each as city/region/country):\n${feedspotCandidates
          .map((c) => `- ${c.url}`)
          .join("\n")}`
      : "";

    const userPrompt = `Suggest RSS feeds for an expat living in ${city ? `${city}, ` : ""}${country}.
Preferred reading language: ${language}.

Think carefully about which real publications cover ${city ? `${city} specifically (and its region)` : country}. Prefer URLs from the candidate shortlist below; you may also add 0-3 additional well-known feeds you are confident exist.${candidatesBlock}`;

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1",
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