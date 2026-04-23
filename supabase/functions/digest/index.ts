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

// Run batches in parallel with concurrency limit
async function runParallel<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let idx = 0;
  const run = async () => {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => run()));
  return results;
}

// Batch: classify + detect language for multiple articles in one call
async function batchClassifyAndDetect(articles: { title: string; content: string }[]): Promise<{ topic: string; language: string }[]> {
  const articleDescriptions = articles.map((a, i) =>
    `Article id=${i}:\nTitle: ${a.title}\nContent: ${stripHtml(a.content).slice(0, 300)}`
  ).join('\n\n');

  const prompt = `For each article below, determine:
1. The language it is written in (return the language name in English, e.g. "English", "French")
2. The most fitting topic from this list: ${TOPICS.join(", ")}

You MUST choose exactly one topic from the list above. Use the exact spelling. If an article does not fit ANY of the listed topics, return "NONE" as the topic.

Return a JSON object with key "results" containing an array of objects, each with "id" (the integer id from the input), "language", and "topic" fields. You MUST include the "id" field on every result so we can match it back to the input. Return exactly ${articles.length} results, one per input id.

${articleDescriptions}`;

  const result = await callOpenAI([{ role: "user", content: prompt }], true);
  try {
    const parsed = JSON.parse(result);
    const arr = parsed.results || [];
    // Map results back to input order using id; fall back to position if id missing.
    const byId = new Map<number, { topic: string; language: string }>();
    arr.forEach((r: any, pos: number) => {
      const id = typeof r?.id === 'number' ? r.id : pos;
      byId.set(id, { topic: r?.topic ?? 'Unknown', language: r?.language ?? 'Unknown' });
    });
    if (arr.length !== articles.length) {
      console.warn(`[batchClassifyAndDetect] expected ${articles.length} results, got ${arr.length}`);
    }
    return articles.map((_, i) => byId.get(i) ?? { topic: 'Unknown', language: 'Unknown' });
  } catch {
    return articles.map(() => ({ topic: "Unknown", language: "Unknown" }));
  }
}

// Batch: summarize multiple articles in one call
async function batchSummarize(articles: { title: string; content: string }[]): Promise<string[][]> {
  const articleDescriptions = articles.map((a, i) =>
    `Article id=${i}:\nTitle: ${a.title}\nContent: ${stripHtml(a.content)}`
  ).join('\n\n---\n\n');

  const prompt = `Summarize each article below in a single concise paragraph (2-3 sentences). Only include information explicitly present in the article content. Do NOT add facts, names, dates, numbers, or context not present. If the content is sparse or only a title, return a single sentence based ONLY on what's there — do not invent details.

Return a JSON object with key "results" containing an array of objects. Each object MUST have:
- "id": the integer id from the input (so we can match it back)
- "summary": an array with exactly 1 string (the paragraph summary)

Return exactly ${articles.length} results, one per input id.

${articleDescriptions}`;

  const result = await callOpenAI([{ role: "user", content: prompt }], true);
  try {
    const parsed = JSON.parse(result);
    const arr = parsed.results || parsed.summaries || [];
    const byId = new Map<number, string[]>();
    arr.forEach((r: any, pos: number) => {
      // Support either {id, summary:[...]} or legacy [string] entries.
      if (Array.isArray(r)) {
        byId.set(pos, r);
      } else {
        const id = typeof r?.id === 'number' ? r.id : pos;
        const s = Array.isArray(r?.summary) ? r.summary : (typeof r?.summary === 'string' ? [r.summary] : null);
        if (s) byId.set(id, s);
      }
    });
    if (arr.length !== articles.length) {
      console.warn(`[batchSummarize] expected ${articles.length} results, got ${arr.length}`);
    }
    return articles.map((a, i) => byId.get(i) ?? [a.title]);
  } catch {
    return articles.map((a) => [a.title]);
  }
}

// Batch: summarize AND translate in one call (saves a whole round-trip for non-English articles)
async function batchSummarizeAndTranslate(
  articles: { title: string; content: string }[],
  targetLang: string
): Promise<{ summary: string[]; translatedTitle: string; translatedSummary: string[] }[]> {
  const articleDescriptions = articles.map((a, i) =>
    `Article id=${i}:\nTitle: ${a.title}\nContent: ${stripHtml(a.content)}`
  ).join('\n\n---\n\n');

  const prompt = `For each article below:
1. Summarize it in a single concise paragraph (2-3 sentences) in the original language. Only include information explicitly present in the article content. Do NOT add facts, names, dates, numbers, or context not present. If the source is sparse or only a title, return one short sentence based ONLY on what's there — do not invent details.
2. Translate the title and the summary paragraph to ${targetLang}. Translate ONLY what is in the source. Do NOT add facts, names, dates, numbers, or context not present in the input. If the source is a single sentence, output a single sentence. Do not expand. If the summary is just a restatement of the title, the translated summary should also be just a restatement of the translated title — do not invent a longer summary.

Return a JSON object with key "results" containing an array of objects, each with:
- "id": the integer id from the input (REQUIRED — used to match results back to inputs)
- "summary": array with 1 string (the paragraph summary in original language)
- "translated_title": string (title in ${targetLang})
- "translated_summary": array with 1 string (the paragraph summary in ${targetLang})

Return exactly ${articles.length} results, one per input id. Do NOT drop, merge, or reorder items — every input id must appear exactly once in the output.

${articleDescriptions}`;

  const result = await callOpenAI([{ role: "user", content: prompt }], true);
  try {
    const parsed = JSON.parse(result);
    const arr = parsed.results || [];
    const byId = new Map<number, { summary: string[]; translatedTitle: string; translatedSummary: string[] }>();
    arr.forEach((r: any, pos: number) => {
      const id = typeof r?.id === 'number' ? r.id : pos;
      byId.set(id, {
        summary: Array.isArray(r?.summary) ? r.summary : (r?.summary ? [r.summary] : []),
        translatedTitle: r?.translated_title || "",
        translatedSummary: Array.isArray(r?.translated_summary) ? r.translated_summary : (r?.translated_summary ? [r.translated_summary] : []),
      });
    });
    if (arr.length !== articles.length) {
      console.warn(`[batchSummarizeAndTranslate] expected ${articles.length} results, got ${arr.length}`);
    }
    return articles.map((a, i) => {
      const got = byId.get(i);
      if (!got) {
        // Mis-pairing prevention: better to ship the title untranslated than to silently
        // attach somebody else's translation to this article.
        console.warn(`[batchSummarizeAndTranslate] missing result for id=${i}, falling back to title`);
        return { summary: [a.title], translatedTitle: "", translatedSummary: [] };
      }
      return got;
    });
  } catch {
    return articles.map((a) => ({
      summary: [a.title],
      translatedTitle: "",
      translatedSummary: [],
    }));
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
    // Support scheduled invocation via x-scheduled-user-id header (from scheduled-digest function)
    const scheduledUserId = req.headers.get("x-scheduled-user-id");
    let userId: string;

    if (scheduledUserId) {
      userId = scheduledUserId;
    } else {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) throw new Error("No authorization header");
      const token = authHeader.replace("Bearer ", "");
      const jwtPayload = decodeJwtPayload(token);
      userId = jwtPayload.sub;
      if (!userId) throw new Error("Unauthorized");
    }
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

    // Limit per source (30 per source, no global cap)
    const MAX_PER_SOURCE = 30;
    const sourceCount: Record<string, number> = {};
    const toProcess: any[] = [];
    for (const item of allItems) {
      const src = item.source || "unknown";
      if ((sourceCount[src] || 0) >= MAX_PER_SOURCE) continue;
      sourceCount[src] = (sourceCount[src] || 0) + 1;
      toProcess.push(item);
    }
    console.log(`[digest] Processing ${toProcess.length} articles after per-source limit`);

    // Step 3: Classify + detect language in PARALLEL batches (15 per batch, 4 concurrent)
    const CLASSIFY_BATCH = 15;
    const classifyTasks: (() => Promise<{ topic: string; language: string }[]>)[] = [];
    for (let i = 0; i < toProcess.length; i += CLASSIFY_BATCH) {
      const batch = toProcess.slice(i, i + CLASSIFY_BATCH);
      classifyTasks.push(() => batchClassifyAndDetect(batch));
    }
    console.log(`[digest] Classifying in ${classifyTasks.length} batches (4 concurrent)...`);
    const classifyBatchResults = await runParallel(classifyTasks, 4);
    const classifyResults = classifyBatchResults.flat();
    console.log(`[digest] Classification done`);

    // Step 4: Filter by user topics — drop NONE/Unknown immediately
    const filtered: { item: any; topic: string; language: string }[] = [];
    for (let i = 0; i < toProcess.length; i++) {
      const { topic, language } = classifyResults[i] || { topic: "NONE", language: "Unknown" };
      if (topic === "NONE" || topic === "Unknown") continue;
      if (userTopics.length > 0 && !userTopics.some((ut: string) => topic.toLowerCase() === ut.toLowerCase())) {
        continue;
      }
      filtered.push({ item: toProcess[i], topic, language });
    }
    console.log(`[digest] ${filtered.length} articles match user topics`);

    // Step 5+6: Split into same-language (just summarize) and foreign-language (summarize+translate in one call)
    // This eliminates the separate translation step entirely for foreign articles
    const sameLanguage: { idx: number; item: any; topic: string; language: string }[] = [];
    const foreignLanguage: { idx: number; item: any; topic: string; language: string }[] = [];

    for (let i = 0; i < filtered.length; i++) {
      if (filtered[i].language.toLowerCase() === preferredLang.toLowerCase()) {
        sameLanguage.push({ idx: i, ...filtered[i] });
      } else {
        foreignLanguage.push({ idx: i, ...filtered[i] });
      }
    }

    console.log(`[digest] ${sameLanguage.length} same-language, ${foreignLanguage.length} need translation`);

    // Process both tracks in parallel
    const PROCESS_BATCH = 10;
    const articleData: Map<number, { summary: string[]; translatedTitle?: string; translatedSummary?: string[] }> = new Map();

    // Thin-source threshold: articles with content shorter than this skip the LLM entirely
    // to avoid hallucinated summaries/translations from sparse RSS items.
    const THIN_CONTENT_CHARS = 200;

    // Pre-fill thin articles: use title as summary (no LLM call = no invention)
    const thinSameLang = sameLanguage.filter(b => stripHtml(b.item.content).length < THIN_CONTENT_CHARS);
    const richSameLang = sameLanguage.filter(b => stripHtml(b.item.content).length >= THIN_CONTENT_CHARS);
    const thinForeign = foreignLanguage.filter(b => stripHtml(b.item.content).length < THIN_CONTENT_CHARS);
    const richForeign = foreignLanguage.filter(b => stripHtml(b.item.content).length >= THIN_CONTENT_CHARS);

    for (const b of thinSameLang) {
      articleData.set(b.idx, { summary: [b.item.title] });
    }
    for (const b of thinForeign) {
      // No translation: surface the original title as both summary and translated_summary placeholder.
      // is_translated will end up false because translatedSummary is empty.
      articleData.set(b.idx, { summary: [b.item.title] });
    }
    if (thinSameLang.length + thinForeign.length > 0) {
      console.log(`[digest] Skipped LLM for ${thinSameLang.length + thinForeign.length} thin articles (<${THIN_CONTENT_CHARS} chars)`);
    }

    // Build tasks for same-language articles (summarize only)
    const summarizeTasks: (() => Promise<void>)[] = [];
    for (let i = 0; i < richSameLang.length; i += PROCESS_BATCH) {
      const batch = richSameLang.slice(i, i + PROCESS_BATCH);
      summarizeTasks.push(async () => {
        const summaries = await batchSummarize(batch.map(b => ({ title: b.item.title, content: b.item.content })));
        batch.forEach((b, j) => {
          articleData.set(b.idx, { summary: summaries[j] || ["No summary available"] });
        });
      });
    }

    // Build tasks for foreign-language articles (summarize + translate in one call)
    const translateTasks: (() => Promise<void>)[] = [];
    for (let i = 0; i < richForeign.length; i += PROCESS_BATCH) {
      const batch = richForeign.slice(i, i + PROCESS_BATCH);
      translateTasks.push(async () => {
        const results = await batchSummarizeAndTranslate(
          batch.map(b => ({ title: b.item.title, content: b.item.content })),
          preferredLang
        );
        batch.forEach((b, j) => {
          articleData.set(b.idx, {
            summary: results[j].summary,
            translatedTitle: results[j].translatedTitle,
            translatedSummary: results[j].translatedSummary,
          });
        });
      });
    }

    // Run ALL summarize and translate tasks in parallel (4 concurrent)
    const allTasks = [...summarizeTasks, ...translateTasks];
    console.log(`[digest] Processing ${allTasks.length} summarize/translate batches (4 concurrent)...`);
    await runParallel(allTasks, 4);
    console.log(`[digest] Summarization/translation done`);

    // Build final articles
    const processedArticles = filtered.map((f, i) => {
      const data = articleData.get(i) || { summary: ["No summary available"] };
      const isTranslated = !!data.translatedSummary?.length;

      return {
        user_id: userId,
        title: isTranslated && data.translatedTitle ? data.translatedTitle : f.item.title,
        source: f.item.source,
        url: f.item.url,
        content: stripHtml(f.item.content).slice(0, 1000),
        published_at: f.item.published_at,
        language: f.language,
        topic: f.topic,
        summary: data.summary,
        translated_summary: data.translatedSummary || [],
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

    // Step 7: Generate executive summary and cache it
    if (processedArticles.length > 0) {
      console.log(`[digest] Generating executive summary...`);
      try {
        const input = processedArticles.slice(0, 20).map((a: any, i: number) => {
          const bullets = (a.translated_summary?.length ? a.translated_summary : a.summary) || [];
          return `[${i + 1}] "${a.title}" (${a.topic || "General"}, source: ${a.source || "unknown"})\n${bullets.map((b: string) => `   - ${b}`).join("\n")}`;
        }).join("\n\n");

        const summaryText = await callOpenAI([
          {
            role: "system",
            content: `You are a news briefing assistant. Given a list of numbered articles with summaries, produce a comprehensive executive briefing of 3-4 paragraphs covering the most important developments. Group related news thematically. When referencing an article, include its number in square brackets like [1] so readers can find the source. Cover all major topics represented. Be informative, analytical, and highlight actionable or impactful news.`
          },
          { role: "user", content: `Here are today's articles:\n\n${input}\n\nProduce a 3-4 paragraph executive briefing with article references in [N] format.` }
        ]);

        // Delete old summaries for this user, then insert new one
        await supabase.from("executive_summaries").delete().eq("user_id", userId);
        const { error: sumError } = await supabase.from("executive_summaries").insert({
          user_id: userId,
          summary: summaryText.trim(),
        });
        if (sumError) console.error("Summary insert error:", sumError);
        else console.log(`[digest] Executive summary cached.`);
      } catch (e) {
        console.error("[digest] Executive summary generation failed:", e);
      }
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
