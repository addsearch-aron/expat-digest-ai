import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { FlaskConical, Loader2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";

function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono font-medium">{value}%</span>
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

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-6 w-6" />
          <h1 className="text-2xl font-serif font-bold">Model Evaluation</h1>
        </div>

        {/* Faithfulness */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Summary Faithfulness</CardTitle>
            <Button
              size="sm"
              onClick={() => runEval("faithfulness")}
              disabled={loadingType !== null}
            >
              {loadingType === "faithfulness" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Run Check
            </Button>
          </CardHeader>
          <CardContent>
            {faithfulness ? (
              <div className="space-y-3">
                <MetricBar label="Supported" value={faithfulness.summary.supported_pct} color="" />
                <MetricBar label="Partially Supported" value={faithfulness.summary.partial_pct} color="" />
                <MetricBar label="Not Supported" value={faithfulness.summary.unsupported_pct} color="" />
                <p className="text-xs text-muted-foreground">Based on {faithfulness.summary.total_bullets} bullets</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Checks whether summary bullets are grounded in article content. Requires generated articles.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Translation */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Translation Quality</CardTitle>
            <Button
              size="sm"
              onClick={() => runEval("translation")}
              disabled={loadingType !== null}
            >
              {loadingType === "translation" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Run Check
            </Button>
          </CardHeader>
          <CardContent>
            {translation ? (
              <div className="space-y-3">
                <MetricBar label="Accurate" value={translation.summary.accurate_pct} color="" />
                <MetricBar label="Minor Issues" value={translation.summary.minor_pct} color="" />
                <MetricBar label="Major Distortion" value={translation.summary.major_pct} color="" />
                <p className="text-xs text-muted-foreground">Based on {translation.summary.total} translated articles</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Evaluates whether translations preserve original meaning. Requires translated articles.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Classification */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Topic Classification Accuracy</CardTitle>
            <Button
              size="sm"
              onClick={() => runEval("classification")}
              disabled={loadingType !== null}
            >
              {loadingType === "classification" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Run Check
            </Button>
          </CardHeader>
          <CardContent>
            {classification ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 rounded-lg bg-muted">
                    <p className="text-3xl font-mono font-bold">{classification.summary.accuracy}%</p>
                    <p className="text-sm text-muted-foreground">Accuracy</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted">
                    <p className="text-3xl font-mono font-bold">{classification.summary.macro_f1}%</p>
                    <p className="text-sm text-muted-foreground">Macro F1</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {classification.summary.correct}/{classification.summary.total} correct on static evaluation dataset
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Tests classifier on 35 pre-labeled articles. Computes accuracy and macro F1.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
