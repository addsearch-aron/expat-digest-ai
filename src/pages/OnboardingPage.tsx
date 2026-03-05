import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { TOPICS, LANGUAGES } from "@/lib/constants";
import { MapPin, Globe, Tags, Rss, ArrowRight, ArrowLeft, CheckCircle2, Plus, Trash2 } from "lucide-react";

const STEPS = [
  { title: "Your Location", description: "Where are you based?", icon: MapPin },
  { title: "Language", description: "What language should we translate articles into?", icon: Globe },
  { title: "Topics", description: "What topics interest you?", icon: Tags },
  { title: "RSS Feeds", description: "Add at least one news source", icon: Rss },
];

export default function OnboardingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  // Profile fields
  const [city, setCity] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("English");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

  // Feeds
  const [feeds, setFeeds] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const toggleTopic = (topic: string) => {
    setSelectedTopics(prev =>
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    );
  };

  const addFeed = () => {
    if (!newUrl.trim()) return;
    try {
      new URL(newUrl.trim());
      setFeeds(prev => [...prev, newUrl.trim()]);
      setNewUrl("");
    } catch {
      toast({ title: "Invalid URL", description: "Please enter a valid RSS feed URL.", variant: "destructive" });
    }
  };

  const removeFeed = (index: number) => {
    setFeeds(prev => prev.filter((_, i) => i !== index));
  };

  const canProceed = () => {
    if (step === 2 && selectedTopics.length === 0) return false;
    if (step === 3 && feeds.length === 0) return false;
    return true;
  };

  const finishOnboarding = async () => {
    setSaving(true);
    try {
      // Save profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          city,
          preferred_language: preferredLanguage,
          topics: selectedTopics,
        })
        .eq("user_id", user!.id);

      if (profileError) throw profileError;

      // Save feeds
      if (feeds.length > 0) {
        const feedInserts = feeds.map(url => ({
          user_id: user!.id,
          feed_url: url,
          title: new URL(url).hostname,
        }));
        const { error: feedError } = await supabase.from("user_feeds").insert(feedInserts);
        if (feedError) throw feedError;
      }

      toast({ title: "Setup complete!", description: "You're ready to generate your first digest." });
      navigate("/brief", { replace: true });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const StepIcon = STEPS[step].icon;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Progress */}
        <div className="flex items-center gap-2 justify-center">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i <= step ? "bg-primary w-10" : "bg-muted w-6"
              }`}
            />
          ))}
        </div>

        <Card>
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <StepIcon className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl font-serif">{STEPS[step].title}</CardTitle>
            <CardDescription>{STEPS[step].description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Step 0: City */}
            {step === 0 && (
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Berlin, Tokyo, São Paulo"
                autoFocus
              />
            )}

            {/* Step 1: Language */}
            {step === 1 && (
              <Select value={preferredLanguage} onValueChange={setPreferredLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(lang => (
                    <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Step 2: Topics */}
            {step === 2 && (
              <div className="grid grid-cols-2 gap-3">
                {TOPICS.map(topic => (
                  <label
                    key={topic}
                    className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedTopics.includes(topic)
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <Checkbox
                      checked={selectedTopics.includes(topic)}
                      onCheckedChange={() => toggleTopic(topic)}
                    />
                    <span className="text-sm">{topic}</span>
                  </label>
                ))}
              </div>
            )}

            {/* Step 3: RSS Feeds */}
            {step === 3 && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://example.com/rss.xml"
                    onKeyDown={(e) => e.key === "Enter" && addFeed()}
                  />
                  <Button onClick={addFeed} size="icon" variant="secondary">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {feeds.length > 0 && (
                  <div className="space-y-2">
                    {feeds.map((url, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border bg-card text-sm">
                        <span className="truncate mr-2">{url}</span>
                        <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7 text-destructive" onClick={() => removeFeed(i)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Add RSS feed URLs from news sites relevant to your expat life.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={finishOnboarding} disabled={!canProceed() || saving}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              {saving ? "Saving..." : "Get Started"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
