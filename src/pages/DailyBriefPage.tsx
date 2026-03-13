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

  useEffect(() => {
    if (user) loadArticles();
  }, [user]);

  const loadArticles = async () => {
    const { data } = await supabase
      .from("articles")
      .select("*")
      .eq("user_id", user!.id)
      .order("published_at", { ascending: false });
    setArticles(data || []);
    // Auto-generate summary if articles exist
    if (data && data.length > 0) {
      generateSummary(data);
    }
  };

  const generateSummary = async (articleList: any[]) => {
    setSummaryLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("summarize-brief", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { articles: articleList },
      });
      if (error) throw error;
      setBriefSummary(data?.summary || null);
    } catch (e: any) {
      console.error("Summary generation failed:", e);
    } finally {
      setSummaryLoading(false);
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
      toast({ title: "Digest ready!", description: `${data.count || 0} articles processed.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Compute facet counts
  const topicCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of articles) {
      const t = a.topic || "Unknown";
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [articles]);

  // Available topics (only those with articles)
  const availableTopics = useMemo(() => {
    return TOPICS.filter((t) => topicCounts[t] && topicCounts[t] > 0);
  }, [topicCounts]);

  // Filtered articles
  const filtered = useMemo(() => {
    if (!selectedTopic) return articles;
    return articles.filter((a) => a.topic === selectedTopic);
  }, [articles, selectedTopic]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [selectedTopic]);

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-serif font-bold">Daily Brief</h1>
            {lastGenerated && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Clock className="h-3 w-3" /> Last generated: {lastGenerated}
              </p>
            )}
          </div>
          <Button onClick={generateDigest} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Generating..." : "Generate Digest"}
          </Button>
        </div>

        {/* Executive Summary */}
        {articles.length > 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Key Highlights
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <p className="text-sm text-muted-foreground animate-pulse">Generating summary…</p>
              ) : briefSummary ? (
                <p className="text-sm text-muted-foreground leading-relaxed">{briefSummary}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No summary available.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Topic filter bar */}
        {articles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedTopic(null)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedTopic === null
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              All
              <span className="text-xs opacity-75">({articles.length})</span>
            </button>
            {availableTopics.map((topic) => (
              <button
                key={topic}
                onClick={() => setSelectedTopic(topic)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedTopic === topic
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {topic}
                <span className="text-xs opacity-75">({topicCounts[topic]})</span>
              </button>
            ))}
          </div>
        )}

        {paginated.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                {articles.length === 0
                  ? 'No articles yet. Add some RSS feeds and click "Generate Digest".'
                  : "No articles for this topic."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {paginated.map((article) => (
              <Card key={article.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-tight">{article.title}</CardTitle>
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <Badge variant="secondary">{article.topic}</Badge>
                    {article.is_translated && (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Globe className="h-3 w-3" /> Translated
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {article.source} · {article.published_at ? new Date(article.published_at).toLocaleDateString() : ""}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5">
                    {(article.is_translated && article.translated_summary?.length > 0
                      ? article.translated_summary
                      : article.summary || []
                    ).map((bullet: string, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground flex gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}

            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
