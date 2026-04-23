import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { TOPICS, LANGUAGES } from "@/lib/constants";
import { COUNTRIES } from "@/lib/countries";
import SuggestFeedsDialog, { type SuggestedFeed } from "@/components/SuggestFeedsDialog";
import { MapPin, Globe, Tags, Rss, ArrowRight, ArrowLeft, CheckCircle2, Plus, X, Sparkles } from "lucide-react";

const STEPS = [
  { title: "Where are you based?", description: "We'll find local news relevant to your city", icon: MapPin },
  { title: "Preferred language", description: "We'll translate articles into your language", icon: Globe },
  { title: "Pick your topics", description: "Select at least one topic you care about", icon: Tags },
  { title: "Add news sources", description: "Paste RSS feed URLs from sites you follow", icon: Rss },
];

const STEP_COLORS = [
  "from-blue-500/20 to-cyan-500/20",
  "from-violet-500/20 to-purple-500/20",
  "from-amber-500/20 to-orange-500/20",
  "from-emerald-500/20 to-teal-500/20",
];

const ICON_COLORS = [
  "text-blue-600 dark:text-blue-400",
  "text-violet-600 dark:text-violet-400",
  "text-amber-600 dark:text-amber-400",
  "text-emerald-600 dark:text-emerald-400",
];

export default function OnboardingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const [country, setCountry] = useState("");
  const [countryQuery, setCountryQuery] = useState("");
  const [city, setCity] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("English");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [feeds, setFeeds] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);

  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q));
  }, [countryQuery]);

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
    if (step === 0 && !country) return false;
    if (step === 2 && selectedTopics.length === 0) return false;
    if (step === 3 && feeds.length === 0) return false;
    return true;
  };

  const finishOnboarding = async () => {
    setSaving(true);
    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          city,
          country,
          preferred_language: preferredLanguage,
          topics: selectedTopics,
        })
        .eq("user_id", user!.id);

      if (profileError) throw profileError;

      if (feeds.length > 0) {
        const feedInserts = feeds.map(url => ({
          user_id: user!.id,
          feed_url: url,
          title: new URL(url).hostname,
        }));
        const { error: feedError } = await supabase.from("user_feeds").insert(feedInserts);
        if (feedError) throw feedError;
      }

      toast({ title: "You're all set! 🎉", description: "Your daily brief is ready to be generated." });
      navigate("/brief", { replace: true });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const StepIcon = STEPS[step].icon;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      {/* Header branding */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 mb-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="text-sm font-medium tracking-wide uppercase text-muted-foreground">Setup</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Expat Daily Brief</h1>
      </div>

      <div className="w-full max-w-md space-y-8">
        {/* Progress bar */}
        <div className="flex items-center gap-1.5 justify-center px-4">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-500 ease-out ${
                i < step
                  ? "bg-primary w-full"
                  : i === step
                  ? "bg-primary w-full"
                  : "bg-muted w-full"
              }`}
            />
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Step {step + 1} of {STEPS.length}
        </p>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          {/* Gradient header strip */}
          <div className={`bg-gradient-to-r ${STEP_COLORS[step]} px-6 py-5 transition-all duration-500`}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-background/80 backdrop-blur flex items-center justify-center shadow-sm">
                <StepIcon className={`h-5 w-5 ${ICON_COLORS[step]} transition-colors duration-500`} />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">{STEPS[step].title}</h2>
                <p className="text-sm text-muted-foreground">{STEPS[step].description}</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {step === 0 && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Country *</label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Select your country" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <div className="p-2 sticky top-0 bg-popover z-10">
                        <Input
                          autoFocus
                          placeholder="Search countries…"
                          value={countryQuery}
                          onChange={(e) => setCountryQuery(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="h-9"
                        />
                      </div>
                      {filteredCountries.map((c) => (
                        <SelectItem key={c.code} value={c.name}>
                          {c.name}
                        </SelectItem>
                      ))}
                      {filteredCountries.length === 0 && (
                        <p className="px-3 py-2 text-sm text-muted-foreground">No matches</p>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">City (recommended)</label>
                  <Input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Berlin, Tokyo, São Paulo"
                    className="h-11"
                  />
                </div>
              </div>
            )}

            {step === 1 && (
              <Select value={preferredLanguage} onValueChange={setPreferredLanguage}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(lang => (
                    <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {step === 2 && (
              <div className="flex flex-wrap gap-2">
                {TOPICS.map(topic => {
                  const selected = selectedTopics.includes(topic);
                  return (
                    <button
                      key={topic}
                      onClick={() => toggleTopic(topic)}
                      className={`px-3.5 py-2 rounded-full text-sm font-medium transition-all duration-200 border ${
                        selected
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-secondary text-secondary-foreground border-border hover:border-primary/50 hover:bg-accent"
                      }`}
                    >
                      {topic}
                    </button>
                  );
                })}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                {country && (
                  <button
                    type="button"
                    onClick={() => setSuggestOpen(true)}
                    className="w-full flex items-center justify-between gap-3 p-3.5 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/5 to-accent/10 hover:from-primary/10 hover:to-accent/20 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Sparkles className="h-4 w-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          Suggest feeds for {city ? `${city}, ` : ""}{country}
                        </p>
                        <p className="text-xs text-muted-foreground">AI-picked, validated local sources</p>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-primary shrink-0">Find local feeds →</span>
                  </button>
                )}
                <div className="flex gap-2">
                  <Input
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://example.com/rss.xml"
                    className="h-11"
                    onKeyDown={(e) => e.key === "Enter" && addFeed()}
                  />
                  <Button onClick={addFeed} size="icon" className="h-11 w-11 shrink-0">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {feeds.length > 0 && (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {feeds.map((url, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary text-sm group"
                      >
                        <span className="truncate mr-2 text-secondary-foreground">{url}</span>
                        <button
                          onClick={() => removeFeed(i)}
                          className="shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Tip: search for "site name + RSS feed" to find URLs.
                </p>
                <SuggestFeedsDialog
                  open={suggestOpen}
                  onOpenChange={setSuggestOpen}
                  country={country}
                  city={city}
                  language={preferredLanguage}
                  existingUrls={feeds}
                  onAdd={(picked) => {
                    setFeeds((prev) => {
                      const set = new Set(prev);
                      picked.forEach((p) => set.add(p.url));
                      return Array.from(set);
                    });
                    toast({ title: `Added ${picked.length} feed${picked.length === 1 ? "" : "s"}` });
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center">
          <Button
            variant="ghost"
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed()} className="px-6">
              Continue <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          ) : (
            <Button onClick={finishOnboarding} disabled={!canProceed() || saving} className="px-6">
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              {saving ? "Saving..." : "Get Started"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
