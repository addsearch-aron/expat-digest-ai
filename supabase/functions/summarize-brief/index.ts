import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { articles } = await req.json();
    if (!articles || articles.length === 0) {
      return new Response(JSON.stringify({ summary: "No articles to summarize." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build input with article indices so the LLM can reference them
    const input = articles.slice(0, 20).map((a: any, i: number) => {
      const summaryText = (a.translated_summary?.length ? a.translated_summary : a.summary) || [];
      return `[${i + 1}] "${a.title}" (${a.topic || "General"}, source: ${a.source || "unknown"})\n   ${summaryText.join(" ")}`;
    }).join("\n\n");

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `You are a news briefing assistant. Given a list of numbered articles with summaries, produce a comprehensive executive briefing of 3-4 paragraphs covering the most important developments. Group related news thematically. When referencing an article, include its number in square brackets like [1] so readers can find the source. Cover all major topics represented. Be informative, analytical, and highlight actionable or impactful news.`
          },
          { role: "user", content: `Here are today's articles:\n\n${input}\n\nProduce a 3-4 paragraph executive briefing with article references in [N] format.` }
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI error: ${err}`);
    }

    const data = await res.json();
    const summary = data.choices?.[0]?.message?.content?.trim() || "Could not generate summary.";

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
