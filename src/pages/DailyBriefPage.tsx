import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, ExternalLink, Clock, Globe, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { TOPICS } from "@/lib/constants";

const PAGE_SIZE = 10;

function getLast7Days(): Date[] {
  const days: Date[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }
  return days;
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const DAY_ABBREVS = ["S", "M", "T", "W", "T", "F", "S"];

export default function DailyBriefPage() {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [briefSummary, setBriefSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"summary" | "articles">("summary");
  const [digestHour, setDigestHour] = useState<number>(8);
  const [digestTimezone, setDigestTimezone] = useState<string>("Europe/Berlin");

  const last7Days = useMemo(() => getLast7Days(), []);
  const [selectedDate, setSelectedDate] = useState<Date>(last7Days[0]);
  const today = last7Days[0];

  useEffect(() => {
    if (user) {
      loadArticles();
      loadProfileSchedule();
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadCachedSummary(selectedDate);
    }
  }, [user, selectedDate]);

  const loadCachedSummary = async (date: Date) => {
    setSummaryLoading(true);
    setBriefSummary(null);
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const { data } = await supabase
        .from("executive_summaries")
        .select("summary")
        .eq("user_id", user!.id)
        .gte("created_at", startOfDay.toISOString())
        .lte("created_at", endOfDay.toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (data?.summary) {
        setBriefSummary(data.summary);
      }
    } catch (e: any) {
      console.error("Failed to load cached summary:", e);
    } finally {
      setSummaryLoading(false);
    }
  };

  const loadArticles = async () => {
    const { data } = await supabase
      .from("articles")
      .select("*")
      .eq("user_id", user!.id)
      .order("published_at", { ascending: false });
    setArticles(data || []);
  };

  const loadProfileSchedule = async () => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("digest_hour, digest_timezone")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (data) {
        if (typeof data.digest_hour === "number") setDigestHour(data.digest_hour);
        if (data.digest_timezone) setDigestTimezone(data.digest_timezone);
      }
    } catch (e) {
      console.error("Failed to load digest schedule:", e);
    }
  };

  const generateDigest = async () => {
    setLoading(true);
    toast({ title: "Generating digest...", description: "This may take a minute." });
    try {
      const { data, error } = await supabase.functions.invoke("digest", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setLastGenerated(new Date().toLocaleTimeString());
      await loadArticles();
      setSelectedDate(new Date(new Date().setHours(0,0,0,0)));
      await loadCachedSummary(new Date(new Date().setHours(0,0,0,0)));
      toast({ title: "Digest ready!", description: `${data.count || 0} articles processed.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const topicCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of articles) {
      const t = a.topic || "Unknown";
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [articles]);

  const availableTopics = useMemo(() => {
    return TOPICS.filter((t) => topicCounts[t] && topicCounts[t] > 0);
  }, [topicCounts]);

  const filtered = useMemo(() => {
    if (!selectedTopic) return articles;
    return articles.filter((a) => a.topic === selectedTopic);
  }, [articles, selectedTopic]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [selectedTopic]);

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Daily Brief</h1>
            {lastGenerated && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1.5">
                <Clock className="h-3 w-3" /> Last generated: {lastGenerated}
              </p>
            )}
          </div>
          <Button
            onClick={generateDigest}
            disabled={loading}
            className="rounded-xl px-5 h-11 font-medium shadow-sm"
            style={{ background: loading ? undefined : 'var(--gradient-hero)' }}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Generating..." : "Generate Digest"}
          </Button>
        </div>

        {/* Tab bar */}
        {articles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 p-1 rounded-2xl bg-muted/50">
            <button
              onClick={() => setViewMode("summary")}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                viewMode === "summary"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Summary
            </button>
            <button
              onClick={() => { setViewMode("articles"); setSelectedTopic(null); }}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                viewMode === "articles" && selectedTopic === null
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All
              <span className="text-xs opacity-60 tabular-nums">({articles.length})</span>
            </button>
            {availableTopics.map((topic) => (
              <button
                key={topic}
                onClick={() => { setViewMode("articles"); setSelectedTopic(topic); }}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  viewMode === "articles" && selectedTopic === topic
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {topic}
                <span className="text-xs opacity-60 tabular-nums">({topicCounts[topic]})</span>
              </button>
            ))}
          </div>
        )}

        {/* Summary view */}
        {viewMode === "summary" && articles.length > 0 && (
          <Card className="border-0 overflow-hidden" style={{ boxShadow: 'var(--shadow-elevated)' }}>
            <div className="h-1 w-full" style={{ background: 'var(--gradient-hero)' }} />
            <CardHeader className="pb-3 space-y-3">
              <CardTitle className="text-xl flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-accent-foreground" />
                </div>
                Executive Briefing
              </CardTitle>
              {/* Day navigation */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg"
                    disabled={isSameDay(selectedDate, last7Days[last7Days.length - 1])}
                    onClick={() => {
                      const idx = last7Days.findIndex(d => isSameDay(d, selectedDate));
                      if (idx < last7Days.length - 1) setSelectedDate(last7Days[idx + 1]);
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{formatDayLabel(selectedDate)}</span>
                    {isSameDay(selectedDate, today) && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 rounded-md">Today</Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg"
                    disabled={isSameDay(selectedDate, today)}
                    onClick={() => {
                      const idx = last7Days.findIndex(d => isSameDay(d, selectedDate));
                      if (idx > 0) setSelectedDate(last7Days[idx - 1]);
                    }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex justify-center gap-1">
                  {[...last7Days].reverse().map((day) => (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(day)}
                      className={`h-7 w-7 rounded-full text-xs font-medium transition-all duration-200 ${
                        isSameDay(day, selectedDate)
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {DAY_ABBREVS[day.getDay()]}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <div className="space-y-3">
                  {[100, 92, 85, 100, 78].map((w, i) => (
                    <div key={i} className={`h-4 bg-muted animate-pulse rounded-md`} style={{ width: `${w}%` }} />
                  ))}
                </div>
              ) : briefSummary ? (
                <div className="space-y-4">
                  {briefSummary.split("\n\n").map((para, i) => (
                    <p key={i} className="text-sm text-foreground/85 leading-relaxed">
                      {renderSummaryWithLinks(para, articles)}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No summary available.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Articles view */}
        {viewMode === "articles" && (
          <>
            {paginated.length === 0 ? (
              <Card className="border-border/50" style={{ boxShadow: 'var(--shadow-card)' }}>
                <CardContent className="py-16 text-center">
                  <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                    <Newspaper className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground font-medium">
                    {articles.length === 0
                      ? 'No articles yet. Add some RSS feeds and click "Generate Digest".'
                      : "No articles for this topic."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {paginated.map((article) => (
                  <Card
                    key={article.id}
                    className="card-hover border-border/50 overflow-hidden group"
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle className="text-base leading-snug font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                          {article.title}
                        </CardTitle>
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge variant="secondary" className="rounded-md font-medium text-xs">
                          {article.topic}
                        </Badge>
                        {article.is_translated && (
                          <Badge variant="outline" className="rounded-md flex items-center gap-1 text-xs">
                            <Globe className="h-3 w-3" /> Translated
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {article.source} · {article.published_at ? new Date(article.published_at).toLocaleDateString() : ""}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {(article.is_translated && article.translated_summary?.length > 0
                          ? article.translated_summary
                          : article.summary || []
                        ).join(" ")}
                      </p>
                    </CardContent>
                  </Card>
                ))}

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-3 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="rounded-lg"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                    </Button>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {page} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-lg"
                    >
                      Next <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {articles.length === 0 && viewMode === "summary" && (
          <Card className="border-border/50" style={{ boxShadow: 'var(--shadow-card)' }}>
            <CardContent className="py-16 text-center">
              <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                <Newspaper className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-medium">
                No articles yet. Add some RSS feeds and click "Generate Digest".
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

function Newspaper(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
      <path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>
    </svg>
  );
}

function renderSummaryWithLinks(text: string, articles: any[]): React.ReactNode {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const idx = parseInt(match[1], 10) - 1;
      const article = articles[idx];
      if (article) {
        return (
          <a
            key={i}
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-medium"
            title={article.title}
          >
            [{match[1]}]
          </a>
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}
