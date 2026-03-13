import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { TOPICS, LANGUAGES } from "@/lib/constants";
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
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Profile Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">City</label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Berlin, Tokyo, São Paulo"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Preferred Language</label>
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
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Daily Digest Time</label>
              <div className="flex gap-3">
                <Select value={String(digestHour)} onValueChange={(v) => setDigestHour(Number(v))}>
                  <SelectTrigger className="w-[120px]">
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
                <Select value={digestTimezone} onValueChange={setDigestTimezone}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "Europe/Berlin",
                      "Europe/London",
                      "Europe/Paris",
                      "Europe/Madrid",
                      "Europe/Rome",
                      "Europe/Amsterdam",
                      "Europe/Warsaw",
                      "Europe/Istanbul",
                      "America/New_York",
                      "America/Chicago",
                      "America/Denver",
                      "America/Los_Angeles",
                      "America/Sao_Paulo",
                      "Asia/Tokyo",
                      "Asia/Shanghai",
                      "Asia/Seoul",
                      "Asia/Kolkata",
                      "Asia/Dubai",
                      "Australia/Sydney",
                    ].map(tz => (
                      <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">Your digest will be generated automatically at this time every day.</p>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">Topics of Interest</label>
              <div className="grid grid-cols-2 gap-3">
                {TOPICS.map(topic => (
                  <div key={topic} className="flex items-center space-x-2">
                    <Checkbox
                      id={topic}
                      checked={selectedTopics.includes(topic)}
                      onCheckedChange={() => toggleTopic(topic)}
                    />
                    <label htmlFor={topic} className="text-sm cursor-pointer">
                      {topic}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={handleSave} disabled={loading} className="w-full">
              {loading ? "Saving..." : "Save Profile"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
