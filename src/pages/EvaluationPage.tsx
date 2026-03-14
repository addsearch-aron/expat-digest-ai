import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { FlaskConical, Loader2, BarChart3, Languages, Target } from "lucide-react";
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

export default function EvaluationPage() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [faithfulness, setFaithfulness] = useState<any>(null);
  const [translation, setTranslation] = useState<any>(null);
  const [classification, setClassification] = useState<any>(null);
  const [loadingType, setLoadingType] = useState<string | null>(null);

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

      toast({ title: `${evalType} evaluation complete` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoadingType(null);
    }
  };

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
          <p className="text-xs text-muted-foreground pt-1">Based on {d.summary.total} translated articles</p>
        </div>
      ),
    },
    {
      key: "classification",
      title: "Topic Classification",
      icon: Target,
      description: "Tests classifier on 35 pre-labeled articles. Computes accuracy and macro F1.",
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
              <CardTitle className="flex items-center gap-2.5 text-lg" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center">
                  <Icon className="h-4 w-4 text-accent-foreground" />
                </div>
                {title}
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => runEval(key)}
                disabled={loadingType !== null}
                className="rounded-lg"
              >
                {loadingType === key ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Run Check
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
