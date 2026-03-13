import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOPICS = [
  "Immigration", "Taxes", "Housing", "Healthcare", "Education",
  "Transport", "Safety", "Politics", "Business", "Economy", "Events", "Weather"
];

async function fetchRSS(feedUrl: string): Promise<any[]> {
  try {
    const res = await fetch(feedUrl);
    const text = await res.text();
    const items: any[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(text)) !== null) {
      const itemXml = match[1];
      const getTag = (tag: string) => {
        const m = itemXml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
        return m ? (m[1] || m[2] || '').trim() : '';
      };
      const pubDate = getTag('pubDate');
      const published = pubDate ? new Date(pubDate) : new Date();
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (published >= oneDayAgo) {
        items.push({
          title: getTag('title'),
          url: getTag('link'),
          content: getTag('description') || getTag('content:encoded') || '',
          source: feedUrl,
          published_at: published.toISOString(),
        });
      }
    }
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    while ((match = entryRegex.exec(text)) !== null) {
      const entryXml = match[1];
      const getTag = (tag: string) => {
        const m = entryXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
        return m ? m[1].trim() : '';
      };
      const linkMatch = entryXml.match(/<link[^>]*href="([^"]*)"[^>]*\/?>|<link[^>]*>([^<]*)<\/link>/i);
      const link = linkMatch ? (linkMatch[1] || linkMatch[2] || '') : '';
      const pubDate = getTag('published') || getTag('updated');
      const published = pubDate ? new Date(pubDate) : new Date();
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (published >= oneDayAgo) {
        items.push({
          title: getTag('title'),
          url: link,
          content: getTag('summary') || getTag('content') || '',
          source: feedUrl,
          published_at: published.toISOString(),
        });
      }
    }
    return items;
  } catch (e) {
    console.error(`Error fetching RSS ${feedUrl}:`, e);
    return [];
  }
}

function deduplicateItems(items: any[]): any[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.url || item.title.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim().slice(0, 2000);
}

async function callOpenAI(messages: any[], jsonMode = false): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const body: any = {
    model: "gpt-4o-mini",
    messages,
    temperature: 0.2,
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

// Batch: classify + detect language for multiple articles in one call
async function batchClassifyAndDetect(articles: { title: string; content: string }[]): Promise<{ topic: string; language: string }[]> {
  const articleDescriptions = articles.map((a, i) =>
    `Article ${i + 1}:\nTitle: ${a.title}\nContent: ${stripHtml(a.content).slice(0, 300)}`
  ).join('\n\n');

  const prompt = `For each article below, determine:
1. The language it is written in (return the language name in English, e.g. "English", "French")
2. The most fitting topic from this list: ${TOPICS.join(", ")}

You MUST choose exactly one topic from the list above. Use the exact spelling. If an article does not fit ANY of the listed topics, return "NONE" as the topic.

Return a JSON object with key "results" containing an array of objects, each with "language" and "topic" fields. Return exactly ${articles.length} results in order.

${articleDescriptions}`;

  const result = await callOpenAI([{ role: "user", content: prompt }], true);
  try {
    const parsed = JSON.parse(result);
    return parsed.results || [];
  } catch {
    return articles.map(() => ({ topic: "Unknown", language: "Unknown" }));
  }
}

// Batch: summarize multiple articles in one call
async function batchSummarize(articles: { title: string; content: string }[]): Promise<string[][]> {
  const articleDescriptions = articles.map((a, i) =>
    `Article ${i + 1}:\nTitle: ${a.title}\nContent: ${stripHtml(a.content)}`
  ).join('\n\n---\n\n');

  const prompt = `Summarize each article below in exactly 3 concise bullet points. Only include information explicitly present. No hallucinations.

Return a JSON object with key "summaries" containing an array of arrays (each inner array has 3 bullet point strings). Return exactly ${articles.length} results in order.

${articleDescriptions}`;

  const result = await callOpenAI([{ role: "user", content: prompt }], true);
  try {
    const parsed = JSON.parse(result);
    return parsed.summaries || articles.map(() => ["No summary available"]);
  } catch {
    return articles.map(() => ["No summary available"]);
  }
}

// Batch: translate multiple articles' titles + bullets in one call
async function batchTranslate(
  items: { title: string; bullets: string[] }[],
  targetLang: string
): Promise<{ title: string; bullets: string[] }[]> {
  if (items.length === 0) return [];

  const descriptions = items.map((item, i) =>
    `Item ${i + 1}:\nTitle: ${item.title}\nBullets:\n${item.bullets.map((b, j) => `${j + 1}. ${b}`).join('\n')}`
  ).join('\n\n---\n\n');

  const prompt = `Translate each item's title and bullet points faithfully to ${targetLang}. Do not add new information.

Return a JSON object with key "translations" containing an array of objects, each with "title" (string) and "bullets" (array of 3 strings). Return exactly ${items.length} results in order.

${descriptions}`;

  const result = await callOpenAI([{ role: "user", content: prompt }], true);
  try {
    const parsed = JSON.parse(result);
    return parsed.translations || items;
  } catch {
    return items;
  }
}

function decodeJwtPayload(token: string): any {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error("Invalid JWT");
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(payload);
  return JSON.parse(decoded);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("No authorization header");

    // Auth: decode JWT to get user ID (no network call needed)
    const token = authHeader.replace("Bearer ", "");
    const jwtPayload = decodeJwtPayload(token);
    const userId = jwtPayload.sub;
    if (!userId) throw new Error("Unauthorized");
    console.log(`[digest] Authenticated user: ${userId}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user profile
    const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", userId).single();
    if (!profile) throw new Error("Profile not found");

    const userTopics = profile.topics || [];
    const preferredLang = profile.preferred_language || "English";

    // Get user feeds
    const { data: feeds } = await supabase.from("user_feeds").select("*").eq("user_id", userId);
    if (!feeds || feeds.length === 0) {
      return new Response(JSON.stringify({ articles: [], message: "No feeds configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Fetch all RSS feeds in parallel
    console.log(`[digest] Fetching ${feeds.length} feeds...`);
    const feedResults = await Promise.all(feeds.map(f => fetchRSS(f.feed_url)));
    let allItems: any[] = feedResults.flat();
    console.log(`[digest] Fetched ${allItems.length} total items`);

    // Step 2: Deduplicate
    allItems = deduplicateItems(allItems);

    // Shuffle for diversity
    for (let i = allItems.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allItems[i], allItems[j]] = [allItems[j], allItems[i]];
    }

    if (allItems.length === 0) {
      return new Response(JSON.stringify({ articles: [], message: "No recent articles found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limit per source
    const MAX_PER_SOURCE = 15;
    const sourceCount: Record<string, number> = {};
    const toProcess: any[] = [];
    for (const item of allItems) {
      const src = item.source || "unknown";
      if ((sourceCount[src] || 0) >= MAX_PER_SOURCE) continue;
      sourceCount[src] = (sourceCount[src] || 0) + 1;
      toProcess.push(item);
    }
    console.log(`[digest] Processing ${toProcess.length} articles after per-source limit`);

    // Step 3: Batch classify + detect language (batches of 8)
    const BATCH_SIZE = 8;
    const classifyResults: { topic: string; language: string }[] = [];
    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      const batch = toProcess.slice(i, i + BATCH_SIZE);
      const results = await batchClassifyAndDetect(batch);
      classifyResults.push(...results);
      console.log(`[digest] Classified batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toProcess.length / BATCH_SIZE)}`);
    }

    // Step 4: Filter by user topics
    const filtered: { item: any; topic: string; language: string; index: number }[] = [];
    for (let i = 0; i < toProcess.length; i++) {
      const { topic, language } = classifyResults[i] || { topic: "NONE", language: "Unknown" };
      // Remove articles that don't fit any topic
      if (topic === "NONE" || topic === "Unknown") continue;
      // Filter by user's selected topics
      if (userTopics.length > 0 && !userTopics.some((ut: string) => topic.toLowerCase() === ut.toLowerCase())) {
        continue;
      }
      filtered.push({ item: toProcess[i], topic, language, index: i });
    }
    console.log(`[digest] ${filtered.length} articles match user topics`);

    // Step 5: Batch summarize (batches of 5)
    const SUMMARY_BATCH = 5;
    const allSummaries: string[][] = [];
    for (let i = 0; i < filtered.length; i += SUMMARY_BATCH) {
      const batch = filtered.slice(i, i + SUMMARY_BATCH).map(f => ({
        title: f.item.title,
        content: f.item.content,
      }));
      const summaries = await batchSummarize(batch);
      allSummaries.push(...summaries);
      console.log(`[digest] Summarized batch ${Math.floor(i / SUMMARY_BATCH) + 1}/${Math.ceil(filtered.length / SUMMARY_BATCH)}`);
    }

    // Step 6: Batch translate articles that need it (batches of 5)
    const needsTranslation: { idx: number; title: string; bullets: string[] }[] = [];
    for (let i = 0; i < filtered.length; i++) {
      const lang = filtered[i].language;
      if (lang.toLowerCase() !== preferredLang.toLowerCase()) {
        needsTranslation.push({ idx: i, title: filtered[i].item.title, bullets: allSummaries[i] || [] });
      }
    }

    const translationResults: Map<number, { title: string; bullets: string[] }> = new Map();
    if (needsTranslation.length > 0) {
      console.log(`[digest] Translating ${needsTranslation.length} articles...`);
      const TRANSLATE_BATCH = 5;
      for (let i = 0; i < needsTranslation.length; i += TRANSLATE_BATCH) {
        const batch = needsTranslation.slice(i, i + TRANSLATE_BATCH);
        const results = await batchTranslate(
          batch.map(b => ({ title: b.title, bullets: b.bullets })),
          preferredLang
        );
        batch.forEach((b, j) => {
          translationResults.set(b.idx, results[j]);
        });
      }
    }

    // Build final articles
    const processedArticles = filtered.map((f, i) => {
      const summary = allSummaries[i] || [];
      const translation = translationResults.get(i);
      const isTranslated = !!translation;

      return {
        user_id: userId,
        title: isTranslated ? translation!.title : f.item.title,
        source: f.item.source,
        url: f.item.url,
        content: stripHtml(f.item.content).slice(0, 1000),
        published_at: f.item.published_at,
        language: f.language,
        topic: f.topic,
        summary,
        translated_summary: isTranslated ? translation!.bullets : [],
        is_translated: isTranslated,
      };
    });

    console.log(`[digest] Saving ${processedArticles.length} articles`);

    // Delete existing articles for user, then insert new ones
    await supabase.from("articles").delete().eq("user_id", userId);

    if (processedArticles.length > 0) {
      const { error: insertError } = await supabase.from("articles").insert(processedArticles);
      if (insertError) console.error("Insert error:", insertError);
    }

    console.log(`[digest] Done!`);
    return new Response(JSON.stringify({ articles: processedArticles, count: processedArticles.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Digest error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
