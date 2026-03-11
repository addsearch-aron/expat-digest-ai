import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOPICS = [
  "Housing", "Public Transport", "Immigration / Visas", "Safety",
  "Healthcare", "Local Events", "Economy", "Education"
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
    // Also try Atom format
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

async function classifyTopic(title: string, content: string): Promise<string> {
  const prompt = `Classify the following article into exactly one of these topics: ${TOPICS.join(", ")}.
Return ONLY the topic name, nothing else.

Title: ${title}
Content: ${stripHtml(content).slice(0, 500)}`;
  
  const result = await callOpenAI([{ role: "user", content: prompt }]);
  const cleaned = result.trim();
  const matched = TOPICS.find(t => cleaned.toLowerCase().includes(t.toLowerCase()));
  return matched || cleaned;
}

async function summarize(title: string, content: string): Promise<string[]> {
  const prompt = `Summarize this article in exactly 3 concise bullet points. Only include information explicitly present in the article. No hallucinations.

Title: ${title}
Content: ${stripHtml(content)}`;
  
  const result = await callOpenAI([{ role: "user", content: prompt }]);
  return result.split('\n').filter(l => l.trim()).map(l => l.replace(/^[-•*]\s*/, '').trim()).slice(0, 3);
}

async function translateSummary(bullets: string[], targetLang: string): Promise<string[]> {
  const prompt = `Translate the following bullet points faithfully to ${targetLang}. Do not add new information. Return each translated bullet on its own line.

${bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')}`;
  
  const result = await callOpenAI([{ role: "user", content: prompt }]);
  return result.split('\n').filter(l => l.trim()).map(l => l.replace(/^\d+\.\s*/, '').replace(/^[-•*]\s*/, '').trim()).slice(0, 3);
}

async function detectLanguage(text: string): Promise<string> {
  const prompt = `What language is this text written in? Return only the language name in English (e.g. "English", "French", "German"). Text: "${text.slice(0, 300)}"`;
  const result = await callOpenAI([{ role: "user", content: prompt }]);
  return result.trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized");

    // Get user profile
    const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();
    if (!profile) throw new Error("Profile not found");

    const userTopics = profile.topics || [];
    const preferredLang = profile.preferred_language || "English";

    // Get user feeds
    const { data: feeds } = await supabase.from("user_feeds").select("*").eq("user_id", user.id);
    if (!feeds || feeds.length === 0) {
      return new Response(JSON.stringify({ articles: [], message: "No feeds configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Fetch RSS items
    let allItems: any[] = [];
    for (const feed of feeds) {
      const items = await fetchRSS(feed.feed_url);
      allItems = allItems.concat(items);
    }

    // Step 2: Deduplicate
    allItems = deduplicateItems(allItems);

    if (allItems.length === 0) {
      return new Response(JSON.stringify({ articles: [], message: "No recent articles found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process items (limit to 15 to avoid too many API calls)
    const toProcess = allItems.slice(0, 15);
    const processedArticles: any[] = [];

    for (const item of toProcess) {
      try {
        // Step 3: Detect language
        const language = await detectLanguage(item.title + " " + stripHtml(item.content).slice(0, 200));

        // Step 4: Classify topic
        const topic = await classifyTopic(item.title, item.content);

        // Step 5: Filter by user topics
        if (userTopics.length > 0 && !userTopics.some((ut: string) => topic.toLowerCase().includes(ut.toLowerCase()))) {
          continue;
        }

        // Step 6: Summarize
        const summary = await summarize(item.title, item.content);

        // Step 7: Translate if needed
        let translatedSummary: string[] = [];
        let isTranslated = false;
        if (language.toLowerCase() !== preferredLang.toLowerCase()) {
          translatedSummary = await translateSummary(summary, preferredLang);
          isTranslated = true;
        }

        processedArticles.push({
          user_id: user.id,
          title: item.title,
          source: item.source,
          url: item.url,
          content: stripHtml(item.content).slice(0, 1000),
          published_at: item.published_at,
          language,
          topic,
          summary,
          translated_summary: translatedSummary,
          is_translated: isTranslated,
        });

        if (processedArticles.length >= 10) break;
      } catch (e) {
        console.error(`Error processing article "${item.title}":`, e);
      }
    }

    // Delete existing articles for user, then insert new ones
    await supabase.from("articles").delete().eq("user_id", user.id);
    
    if (processedArticles.length > 0) {
      const { error: insertError } = await supabase.from("articles").insert(processedArticles);
      if (insertError) console.error("Insert error:", insertError);
    }

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
