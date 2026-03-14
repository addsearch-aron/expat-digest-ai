import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { TOPICS, LANGUAGES } from "@/lib/constants";
import { User, Clock } from "lucide-react";
import AppLayout from "@/components/AppLayout";

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [city, setCity] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("English");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [digestHour, setDigestHour] = useState(8);
  const [digestTimezone, setDigestTimezone] = useState("Europe/Berlin");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) loadProfile();
  }, [user]);

  const loadProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user!.id)
      .single();
    if (data) {
      setCity(data.city || "");
      setPreferredLanguage(data.preferred_language || "English");
      setSelectedTopics(data.topics || []);
      setDigestHour((data as any).digest_hour ?? 8);
      setDigestTimezone((data as any).digest_timezone || "Europe/Berlin");
    }
  };

  const handleSave = async () => {
    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        city,
        preferred_language: preferredLanguage,
        topics: selectedTopics,
        digest_hour: digestHour,
        digest_timezone: digestTimezone,
      } as any)
      .eq("user_id", user!.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile updated" });
    }
    setLoading(false);
  };

  const toggleTopic = (topic: string) => {
    setSelectedTopics(prev =>
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    );
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>

        {/* General */}
        <Card className="border-border/50 overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2.5 text-lg" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center">
                <User className="h-4 w-4 text-accent-foreground" />
              </div>
              General
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">City</label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Berlin, Tokyo, São Paulo"
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Preferred Language</label>
              <Select value={preferredLanguage} onValueChange={setPreferredLanguage}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(lang => (
                    <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Digest Schedule */}
        <Card className="border-border/50 overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2.5 text-lg" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center">
                <Clock className="h-4 w-4 text-accent-foreground" />
              </div>
              Digest Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <div className="space-y-2 w-[140px]">
                <label className="text-sm font-medium">Time</label>
                <Select value={String(digestHour)} onValueChange={(v) => setDigestHour(Number(v))}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {String(i).padStart(2, "0")}:00
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 flex-1">
                <label className="text-sm font-medium">Timezone</label>
                <Select value={digestTimezone} onValueChange={setDigestTimezone}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "Europe/Berlin", "Europe/London", "Europe/Paris", "Europe/Madrid",
                      "Europe/Rome", "Europe/Amsterdam", "Europe/Warsaw", "Europe/Istanbul",
                      "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
                      "America/Sao_Paulo", "Asia/Tokyo", "Asia/Shanghai", "Asia/Seoul",
                      "Asia/Kolkata", "Asia/Dubai", "Australia/Sydney",
                    ].map(tz => (
                      <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Your digest will be generated automatically at this time every day.</p>
          </CardContent>
        </Card>

        {/* Topics */}
        <Card className="border-border/50 overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Topics of Interest
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {TOPICS.map(topic => {
                const selected = selectedTopics.includes(topic);
                return (
                  <button
                    key={topic}
                    onClick={() => toggleTopic(topic)}
                    className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 border ${
                      selected
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-secondary text-secondary-foreground border-border hover:border-primary/40 hover:bg-accent"
                    }`}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Button
          onClick={handleSave}
          disabled={loading}
          className="w-full h-12 rounded-xl font-medium text-base"
          style={{ background: 'var(--gradient-hero)' }}
        >
          {loading ? "Saving..." : "Save Profile"}
        </Button>
      </div>
    </AppLayout>
  );
}
