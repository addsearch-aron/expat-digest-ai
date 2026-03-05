import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, ExternalLink, Clock, Globe } from "lucide-react";
import AppLayout from "@/components/AppLayout";

export default function DailyBriefPage() {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadArticles();
  }, [user]);

  const loadArticles = async () => {
    const { data } = await supabase
      .from("articles")
      .select("*")
      .eq("user_id", user!.id)
      .order("published_at", { ascending: false })
      .limit(10);
    setArticles(data || []);
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

        {articles.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No articles yet. Add some RSS feeds and click "Generate Digest".
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {articles.map((article) => (
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
          </div>
        )}
      </div>
    </AppLayout>
  );
}
