import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { articles } = await req.json();
    if (!articles || articles.length === 0) {
      return new Response(JSON.stringify({ summary: "No articles to summarize." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build a condensed input from article titles and summaries
    const input = articles.slice(0, 20).map((a: any, i: number) => {
      const bullets = (a.translated_summary?.length ? a.translated_summary : a.summary) || [];
      return `${i + 1}. [${a.topic || "General"}] ${a.title}\n${bullets.map((b: string) => `   - ${b}`).join("\n")}`;
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
            content: "You are a news briefing assistant. Given a list of articles with their summaries, produce a single concise executive summary (3-5 sentences) highlighting the most important developments across all topics. Be direct, informative, and prioritize actionable or impactful news. Do not use bullet points."
          },
          { role: "user", content: `Here are today's articles:\n\n${input}\n\nProvide a single executive summary of the key highlights.` }
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
