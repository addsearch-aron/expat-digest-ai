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

// Static evaluation dataset for classification accuracy
const EVAL_DATASET = [
  { title: "New rent control measures announced for city apartments", content: "The city council approved new rent control regulations limiting annual increases to 3%.", topic: "Housing" },
  { title: "Metro line extension approved for eastern suburbs", content: "A new metro line will connect the eastern suburbs with the city center by 2028.", topic: "Public Transport" },
  { title: "Changes to work permit requirements for skilled workers", content: "The immigration authority updated visa requirements for tech workers.", topic: "Immigration / Visas" },
  { title: "Crime rates drop 15% in downtown area", content: "Police report significant decrease in street crime following new patrol strategies.", topic: "Safety" },
  { title: "New public hospital opens in northern district", content: "A state-of-the-art hospital with 500 beds opens to serve the growing population.", topic: "Healthcare" },
  { title: "Annual cultural festival returns this weekend", content: "The city's largest cultural festival features music, food, and art from 30 countries.", topic: "Local Events" },
  { title: "Unemployment rate falls to historic low of 3.2%", content: "The labor market continues to strengthen with record job creation in Q3.", topic: "Economy" },
  { title: "International school introduces bilingual curriculum", content: "A new bilingual program in English and local language starts next semester.", topic: "Education" },
  { title: "Affordable housing project breaks ground downtown", content: "500 new affordable units will be available for low-income families by 2027.", topic: "Housing" },
  { title: "Bus routes restructured for better coverage", content: "The transit authority redesigned 12 bus routes to improve suburban connections.", topic: "Public Transport" },
  { title: "Digital nomad visa now available for remote workers", content: "A new visa category allows remote workers to stay up to 2 years.", topic: "Immigration / Visas" },
  { title: "Emergency services response time improves", content: "Average emergency response time reduced to under 8 minutes citywide.", topic: "Safety" },
  { title: "Free vaccination campaign for flu season", content: "Health department offers free flu shots at 50 locations across the city.", topic: "Healthcare" },
  { title: "Street food market opens every Friday evening", content: "A new weekly street food market features cuisines from around the world.", topic: "Local Events" },
  { title: "Tech startup funding reaches record levels", content: "Venture capital investment in local startups exceeded €2 billion this year.", topic: "Economy" },
  { title: "University tuition fees reduced for international students", content: "Three major universities cut fees by 20% to attract more international students.", topic: "Education" },
  { title: "Property prices stabilize after two years of growth", content: "Real estate market shows signs of cooling with prices flat for third month.", topic: "Housing" },
  { title: "Cycling infrastructure expanded with 50km new lanes", content: "The city adds protected bike lanes connecting major residential and business areas.", topic: "Public Transport" },
  { title: "Residency permit processing times halved", content: "New digital system reduces visa processing from 8 weeks to 4 weeks.", topic: "Immigration / Visas" },
  { title: "Neighborhood watch programs expand to 20 new areas", content: "Community safety initiatives show positive results in reducing petty crime.", topic: "Safety" },
  { title: "Mental health services expanded for expat community", content: "New multilingual counseling center opens with services in 8 languages.", topic: "Healthcare" },
  { title: "Marathon registration opens with record interest", content: "Over 50,000 runners expected for the annual city marathon next month.", topic: "Local Events" },
  { title: "Inflation drops to 2.1% as food prices stabilize", content: "Consumer prices show continued moderation after months of decline.", topic: "Economy" },
  { title: "New coding bootcamp partners with local employers", content: "A 12-week intensive program guarantees job interviews with 20 companies.", topic: "Education" },
  { title: "Tenant protection laws strengthened against evictions", content: "New legislation requires 6-month notice period and just cause for evictions.", topic: "Housing" },
  { title: "Electric bus fleet doubles in size", content: "The city adds 100 new electric buses to reduce emissions from public transport.", topic: "Public Transport" },
  { title: "Family reunification rules simplified", content: "Spouses and children can now join visa holders with streamlined paperwork.", topic: "Immigration / Visas" },
  { title: "CCTV network upgraded across public spaces", content: "Smart cameras with AI-powered monitoring installed at 200 additional locations.", topic: "Safety" },
  { title: "Dental care subsidies introduced for low-income residents", content: "Government program covers 70% of dental costs for qualifying residents.", topic: "Healthcare" },
  { title: "Christmas markets open across the city center", content: "Traditional holiday markets feature handcrafted goods and seasonal treats.", topic: "Local Events" },
  { title: "GDP growth exceeds forecast at 2.8%", content: "The economy grew faster than expected driven by exports and services.", topic: "Economy" },
  { title: "Public libraries extend hours and add language courses", content: "Libraries now offer free evening language classes in 6 languages.", topic: "Education" },
  { title: "Co-living spaces gain popularity among young expats", content: "Shared living arrangements offer affordable furnished rooms with community events.", topic: "Housing" },
  { title: "Train delays spark calls for infrastructure investment", content: "Commuters face daily delays as aging rail network struggles with demand.", topic: "Public Transport" },
  { title: "Citizenship test requirements updated for 2026", content: "The naturalization exam now includes questions on digital rights and sustainability.", topic: "Immigration / Visas" },
];

async function callOpenAI(messages: any[], jsonMode = false): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  
  const body: any = {
    model: "gpt-4o-mini",
    messages,
    temperature: 0.1,
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

async function evaluateFaithfulness(articles: any[]): Promise<any> {
  const sample = articles.slice(0, 20);
  const results: any[] = [];

  for (const article of sample) {
    const summary = article.summary || [];
    if (summary.length === 0) continue;

    const prompt = `Given the article and its summary bullets, determine for each bullet whether it is "supported", "partially supported", or "not supported" by the article content.

Article title: ${article.title}
Article content: ${(article.content || '').slice(0, 1500)}

Summary bullets:
${summary.map((b: string, i: number) => `${i + 1}. ${b}`).join('\n')}

Return a JSON object with this format:
{"bullets": [{"bullet": "...", "verdict": "supported|partially supported|not supported", "explanation": "brief reason"}], "overall_explanation": "1-2 sentence overall judgment"}`;

    try {
      const response = await callOpenAI([{ role: "user", content: prompt }], true);
      const parsed = JSON.parse(response);
      results.push({
        article_title: article.title,
        article_url: article.url,
        original_content: (article.content || '').slice(0, 800),
        original_content_length: (article.content || '').length,
        generated_summary: summary,
        evaluation: parsed.bullets || [],
        overall_explanation: parsed.overall_explanation || '',
      });
    } catch (e) {
      console.error("Faithfulness eval error:", e);
    }
  }

  let supported = 0, partial = 0, unsupported = 0, total = 0;
  for (const r of results) {
    for (const b of r.evaluation) {
      total++;
      if (b.verdict === "supported") supported++;
      else if (b.verdict === "partially supported") partial++;
      else unsupported++;
    }
  }

  return {
    details: results,
    summary: {
      total_bullets: total,
      supported_pct: total ? Math.round((supported / total) * 100) : 0,
      partial_pct: total ? Math.round((partial / total) * 100) : 0,
      unsupported_pct: total ? Math.round((unsupported / total) * 100) : 0,
    }
  };
}

async function evaluateTranslation(articles: any[]): Promise<any> {
  const translated = articles.filter(a => a.is_translated && a.translated_summary?.length > 0);
  const shuffled = [...translated].sort(() => Math.random() - 0.5);
  const sample = shuffled.slice(0, 10);
  const results: any[] = [];

  for (const article of sample) {
    const originalTitle = article.original_title || article.title;
    const translatedTitle = article.original_title ? article.title : '';

    const prompt = `Compare the original article with its translation. Judge whether meaning is preserved.

IMPORTANT: If the original and the translation appear to describe DIFFERENT articles, events, people, places, or topics (i.e. they are not the same story translated), this is a pairing error — return verdict "major distortion" and mention "source/translation appear to be different articles" in the explanation.

Original title: ${originalTitle}

Original summary:
${(article.summary || []).join('\n')}

Translated title: ${translatedTitle}

Translated summary:
${(article.translated_summary || []).join('\n')}

Return a JSON object: {"verdict": "accurate|minor issues|major distortion", "explanation": "..."}`;

    try {
      const response = await callOpenAI([{ role: "user", content: prompt }], true);
      const parsed = JSON.parse(response);
      results.push({
        article_title: originalTitle,
        original_title: originalTitle,
        translated_title: translatedTitle,
        article_url: article.url,
        original_summary: article.summary || [],
        translated_summary: article.translated_summary || [],
        source_language: article.language || '',
        original_content_length: (article.content || '').length,
        ...parsed,
      });
    } catch (e) {
      console.error("Translation eval error:", e);
    }
  }

  let accurate = 0, minor = 0, major = 0;
  for (const r of results) {
    if (r.verdict === "accurate") accurate++;
    else if (r.verdict === "minor issues") minor++;
    else major++;
  }
  const total = results.length;

  return {
    details: results,
    summary: {
      total,
      accurate_pct: total ? Math.round((accurate / total) * 100) : 0,
      minor_pct: total ? Math.round((minor / total) * 100) : 0,
      major_pct: total ? Math.round((major / total) * 100) : 0,
    }
  };
}

async function evaluateClassification(): Promise<any> {
  const results: { expected: string; predicted: string; correct: boolean }[] = [];
  const shuffled = [...EVAL_DATASET].sort(() => Math.random() - 0.5);
  const sample = shuffled.slice(0, 10);

  for (const item of sample) {
    const prompt = `Classify the following article into exactly one of these topics: ${TOPICS.join(", ")}.
Return a JSON object: {"topic": "<one of the topics>", "explanation": "1 sentence reason"}.

Title: ${item.title}
Content: ${item.content}`;

    try {
      const response = await callOpenAI([{ role: "user", content: prompt }], true);
      const parsed = JSON.parse(response);
      const predicted = (parsed.topic || '').trim();
      const matched = TOPICS.find(t => predicted.toLowerCase().includes(t.toLowerCase())) || predicted;
      results.push({
        article_title: item.title,
        content_excerpt: item.content,
        expected: item.topic,
        predicted: matched,
        correct: matched.toLowerCase() === item.topic.toLowerCase(),
        explanation: parsed.explanation || '',
      });
    } catch (e) {
      console.error("Classification eval error:", e);
    }
  }

  const correct = results.filter(r => r.correct).length;
  const accuracy = results.length ? Math.round((correct / results.length) * 100) : 0;

  // Compute macro F1
  const topicMetrics: Record<string, { tp: number; fp: number; fn: number }> = {};
  for (const t of TOPICS) topicMetrics[t] = { tp: 0, fp: 0, fn: 0 };
  for (const r of results) {
    if (r.correct) {
      topicMetrics[r.expected].tp++;
    } else {
      topicMetrics[r.expected].fn++;
      if (topicMetrics[r.predicted]) topicMetrics[r.predicted].fp++;
    }
  }
  let f1Sum = 0, f1Count = 0;
  for (const t of TOPICS) {
    const { tp, fp, fn } = topicMetrics[t];
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    if (tp + fn > 0) { f1Sum += f1; f1Count++; }
  }
  const macroF1 = f1Count > 0 ? Math.round((f1Sum / f1Count) * 100) : 0;

  return {
    details: results,
    summary: {
      total: results.length,
      correct,
      accuracy,
      macro_f1: macroF1,
    }
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!supabaseUrl || !serviceKey || !anonKey) {
      throw new Error("Missing Supabase env vars");
    }
    const supabase = createClient(supabaseUrl, serviceKey);
    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized");

    const { evalType } = await req.json();

    let result;
    if (evalType === "faithfulness") {
      const { data: articles } = await supabase.from("articles").select("*").eq("user_id", user.id);
      result = await evaluateFaithfulness(articles || []);
    } else if (evalType === "translation") {
      const { data: articles } = await supabase.from("articles").select("*").eq("user_id", user.id);
      result = await evaluateTranslation(articles || []);
    } else if (evalType === "classification") {
      result = await evaluateClassification();
    } else {
      throw new Error("Invalid evalType. Use: faithfulness, translation, classification");
    }

    // Store result
    await supabase.from("evaluation_results").insert({
      user_id: user.id,
      eval_type: evalType,
      results: result,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Evaluate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
