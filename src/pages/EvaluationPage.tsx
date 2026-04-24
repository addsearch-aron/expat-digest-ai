import { forwardRef, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { FlaskConical, Loader2, BarChart3, Languages, Target, ChevronDown, Check, X } from "lucide-react";
import AppLayout from "@/components/AppLayout";

function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-semibold tabular-nums">{value}%</span>
      </div>
      <Progress value={value} className={color} />
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const v = (verdict || '').toLowerCase();
  let cls = "bg-muted text-muted-foreground";
  let label = verdict || 'unknown';
  if (v.includes('not supported') || v.includes('major')) {
    cls = "bg-destructive/15 text-destructive border-destructive/30";
  } else if (v.includes('partial') || v.includes('minor')) {
    cls = "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
  } else if (v === 'supported' || v === 'accurate') {
    cls = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
  }
  return <Badge variant="outline" className={`${cls} capitalize`}>{label}</Badge>;
}

const DetailsToggle = forwardRef<HTMLButtonElement, { count: number; open: boolean }>(
  function DetailsToggle({ count, open }, ref) {
    return (
      <CollapsibleTrigger asChild>
        <Button ref={ref} variant="ghost" size="sm" className="w-full justify-between mt-4 text-sm">
          <span>View details ({count} item{count === 1 ? '' : 's'})</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
      </CollapsibleTrigger>
    );
  }
);

function ComparisonBlock({ leftLabel, leftContent, rightLabel, rightContent }: { leftLabel: string; leftContent: React.ReactNode; rightLabel: string; rightContent: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
      <div className="space-y-1.5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{leftLabel}</p>
        <div className="rounded-lg bg-muted/40 p-3 whitespace-pre-wrap text-foreground/90">{leftContent}</div>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{rightLabel}</p>
        <div className="rounded-lg bg-muted/40 p-3 whitespace-pre-wrap text-foreground/90">{rightContent}</div>
      </div>
    </div>
  );
}

const THIN_SOURCE_CHARS = 200;

function ThinSourceChip() {
  return (
    <Badge
      variant="outline"
      className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30"
    >
      Thin source
    </Badge>
  );
}

export default function EvaluationPage() {
  const { session, user } = useAuth();
  const { toast } = useToast();
  const [faithfulness, setFaithfulness] = useState<any>(null);
  const [translation, setTranslation] = useState<any>(null);
  const [classification, setClassification] = useState<any>(null);
  const [dates, setDates] = useState<Record<string, string | null>>({
    faithfulness: null,
    translation: null,
    classification: null,
  });
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("evaluation_results")
        .select("eval_type, results, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (!data) return;
      const latest: Record<string, { results: any; created_at: string }> = {};
      for (const row of data) {
        if (!latest[row.eval_type]) latest[row.eval_type] = { results: row.results, created_at: row.created_at };
      }
      if (latest.faithfulness) setFaithfulness(latest.faithfulness.results);
      if (latest.translation) setTranslation(latest.translation.results);
      if (latest.classification) setClassification(latest.classification.results);
      setDates({
        faithfulness: latest.faithfulness?.created_at ?? null,
        translation: latest.translation?.created_at ?? null,
        classification: latest.classification?.created_at ?? null,
      });
    })();
  }, [user]);

  const runEval = async (evalType: string) => {
    setLoadingType(evalType);
    try {
      const { data, error } = await supabase.functions.invoke("evaluate", {
        body: { evalType },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (evalType === "faithfulness") setFaithfulness(data);
      else if (evalType === "translation") setTranslation(data);
      else if (evalType === "classification") setClassification(data);
      setDates((d) => ({ ...d, [evalType]: new Date().toISOString() }));

      toast({ title: `${evalType} evaluation complete` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoadingType(null);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });

  const evalCards = [
    {
      key: "faithfulness",
      title: "Summary Faithfulness",
      icon: BarChart3,
      description: "Checks whether summary bullets are grounded in article content. Requires generated articles.",
      data: faithfulness,
      renderResult: (d: any) => (
        <div className="space-y-3">
          <MetricBar label="Supported" value={d.summary.supported_pct} color="" />
          <MetricBar label="Partially Supported" value={d.summary.partial_pct} color="" />
          <MetricBar label="Not Supported" value={d.summary.unsupported_pct} color="" />
          <p className="text-xs text-muted-foreground pt-1">Based on {d.summary.total_bullets} bullets</p>
          {Array.isArray(d.details) && d.details.length > 0 && (
            <Collapsible open={!!openDetails.faithfulness} onOpenChange={(o) => setOpenDetails(s => ({ ...s, faithfulness: o }))}>
              <DetailsToggle count={d.details.length} open={!!openDetails.faithfulness} />
              <CollapsibleContent className="space-y-4 pt-3">
                {d.details.map((item: any, i: number) => (
                  <div key={i} className="rounded-xl border border-border/50 p-4 space-y-3 bg-card">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-sm flex-1">{item.article_title}</p>
                      {typeof item.original_content_length === 'number' && item.original_content_length < THIN_SOURCE_CHARS && <ThinSourceChip />}
                    </div>
                    <ComparisonBlock
                      leftLabel={`Original content${typeof item.original_content_length === 'number' ? ` (${item.original_content_length} chars)` : ''}`}
                      leftContent={item.original_content || '—'}
                      rightLabel="Generated summary"
                      rightContent={(item.generated_summary || []).map((b: string, k: number) => <p key={k}>• {b}</p>)}
                    />
                    <div className="space-y-2">
                      {(item.evaluation || []).map((b: any, k: number) => (
                        <div key={k} className="flex items-start gap-2 text-sm">
                          <VerdictBadge verdict={b.verdict} />
                          <div className="flex-1 min-w-0">
                            <p className="text-foreground/90">{b.bullet}</p>
                            {b.explanation && <p className="text-xs text-muted-foreground mt-0.5">{b.explanation}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                    {item.overall_explanation && (
                      <p className="text-xs text-muted-foreground border-t border-border/50 pt-2">{item.overall_explanation}</p>
                    )}
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      ),
    },
    {
      key: "translation",
      title: "Translation Quality",
      icon: Languages,
      description: "Evaluates whether translations preserve original meaning. Requires translated articles.",
      data: translation,
      renderResult: (d: any) => (
        <div className="space-y-3">
          <MetricBar label="Accurate" value={d.summary.accurate_pct} color="" />
          <MetricBar label="Minor Issues" value={d.summary.minor_pct} color="" />
          <MetricBar label="Major Distortion" value={d.summary.major_pct} color="" />
          <p className="text-xs text-muted-foreground pt-1">
            Based on {d.summary.judged ?? d.summary.total} judged article{(d.summary.judged ?? d.summary.total) === 1 ? '' : 's'}
            {d.summary.errored ? ` (${d.summary.errored} skipped due to judge errors)` : ''}
          </p>
          {Array.isArray(d.details) && d.details.length > 0 && (
            <Collapsible open={!!openDetails.translation} onOpenChange={(o) => setOpenDetails(s => ({ ...s, translation: o }))}>
              <DetailsToggle count={d.details.length} open={!!openDetails.translation} />
              <CollapsibleContent className="space-y-4 pt-3">
                {d.details.map((item: any, i: number) => (
                  <div key={i} className="rounded-xl border border-border/50 p-4 space-y-3 bg-card">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-sm flex-1">{item.article_title}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        {typeof item.original_content_length === 'number' && item.original_content_length < THIN_SOURCE_CHARS && <ThinSourceChip />}
                        <VerdictBadge verdict={item.verdict} />
                      </div>
                    </div>
                    <ComparisonBlock
                      leftLabel={`Original${item.source_language ? ` (${item.source_language})` : ''}${typeof item.original_content_length === 'number' ? ` — ${item.original_content_length} chars` : ''}`}
                      leftContent={
                        <>
                          {item.original_title && (
                            <p className="font-semibold mb-2">{item.original_title}</p>
                          )}
                          {(item.original_summary || []).join('\n')}
                        </>
                      }
                      rightLabel="Translation"
                      rightContent={
                        <>
                          {item.translated_title && (
                            <p className="font-semibold mb-2">{item.translated_title}</p>
                          )}
                          {(item.translated_summary || []).join('\n')}
                        </>
                      }
                    />
                    {item.explanation && (
                      <p className="text-xs text-muted-foreground border-t border-border/50 pt-2">
                        <span className="font-medium text-foreground/70">Judge:</span> {item.explanation}
                      </p>
                    )}
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      ),
    },
    {
      key: "classification",
      title: "Topic Classification",
      icon: Target,
      description: "Tests classifier on 10 randomly sampled articles. Computes accuracy and macro F1.",
      data: classification,
      renderResult: (d: any) => (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-5 rounded-xl bg-accent/50">
              <p className="text-3xl font-mono font-bold text-foreground">{d.summary.accuracy}%</p>
              <p className="text-xs text-muted-foreground mt-1">Accuracy</p>
            </div>
            <div className="text-center p-5 rounded-xl bg-accent/50">
              <p className="text-3xl font-mono font-bold text-foreground">{d.summary.macro_f1}%</p>
              <p className="text-xs text-muted-foreground mt-1">Macro F1</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {d.summary.correct}/{d.summary.total} correct on static evaluation dataset
          </p>
          {Array.isArray(d.details) && d.details.length > 0 && (
            <Collapsible open={!!openDetails.classification} onOpenChange={(o) => setOpenDetails(s => ({ ...s, classification: o }))}>
              <DetailsToggle count={d.details.length} open={!!openDetails.classification} />
              <CollapsibleContent className="space-y-3 pt-3">
                {d.details.map((item: any, i: number) => (
                  <div key={i} className={`rounded-xl border p-4 space-y-2 ${item.correct ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-destructive/30 bg-destructive/5'}`}>
                    <div className="flex items-start gap-2">
                      {item.correct
                        ? <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                        : <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{item.article_title}</p>
                        {item.content_excerpt && <p className="text-xs text-muted-foreground mt-0.5">{item.content_excerpt}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm pl-6">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Expected</p>
                        <p className="font-medium">{item.expected}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Predicted</p>
                        <p className={`font-medium ${item.correct ? '' : 'text-destructive'}`}>{item.predicted}</p>
                      </div>
                    </div>
                    {item.explanation && (
                      <p className="text-xs text-muted-foreground pl-6">
                        <span className="font-medium text-foreground/70">Model reasoning:</span> {item.explanation}
                      </p>
                    )}
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--gradient-hero)' }}>
            <FlaskConical className="h-5 w-5 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Model Evaluation</h1>
        </div>

        {evalCards.map(({ key, title, icon: Icon, description, data, renderResult }) => (
          <Card key={key} className="border-border/50 overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-accent-foreground" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-lg" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    {title}
                  </CardTitle>
                  {dates[key] && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Last run: {formatDate(dates[key]!)}
                    </p>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => runEval(key)}
                disabled={loadingType !== null}
                className="rounded-lg"
              >
                {loadingType === key ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                {data ? "Rerun" : "Run Check"}
              </Button>
            </CardHeader>
            <CardContent>
              {data ? renderResult(data) : (
                <p className="text-sm text-muted-foreground">{description}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </AppLayout>
  );
}
