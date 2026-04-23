import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Rss, Sparkles, MapPin } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import SuggestFeedsDialog, { type SuggestedFeed } from "@/components/SuggestFeedsDialog";

export default function FeedsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [feeds, setFeeds] = useState<any[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<{ country?: string; city?: string; preferred_language?: string } | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);

  useEffect(() => {
    if (user) {
      loadFeeds();
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("country, city, preferred_language")
      .eq("user_id", user!.id)
      .maybeSingle();
    setProfile(data || null);
  };

  const loadFeeds = async () => {
    const { data } = await supabase
      .from("user_feeds")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });
    setFeeds(data || []);
  };

  const handleAddSuggested = async (picked: SuggestedFeed[]) => {
    const existing = new Set(feeds.map((f) => f.feed_url));
    const toInsert = picked.filter((p) => !existing.has(p.url));
    if (toInsert.length === 0) {
      toast({ title: "Already added", description: "All selected feeds are already in your list." });
      return;
    }
    const rows = toInsert.map((p) => ({
      user_id: user!.id,
      feed_url: p.url,
      title: p.title,
    }));
    const { error } = await supabase.from("user_feeds").insert(rows);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Added ${toInsert.length} feed${toInsert.length === 1 ? "" : "s"}` });
    loadFeeds();
  };

  const addFeed = async () => {
    if (!newUrl.trim()) return;
    setLoading(true);
    const { error } = await supabase.from("user_feeds").insert({
      user_id: user!.id,
      feed_url: newUrl.trim(),
      title: new URL(newUrl.trim()).hostname,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setNewUrl("");
      loadFeeds();
      toast({ title: "Feed added" });
    }
    setLoading(false);
  };

  const removeFeed = async (id: string) => {
    await supabase.from("user_feeds").delete().eq("id", id);
    loadFeeds();
    toast({ title: "Feed removed" });
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">My Feeds</h1>

        {profile?.country && (
          <Card className="border-primary/30 overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            <CardContent className="p-5 flex items-center justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">Suggest feeds for your location</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3" />
                    {[profile.city, profile.country].filter(Boolean).join(", ")}
                  </p>
                </div>
              </div>
              <Button onClick={() => setSuggestOpen(true)} className="rounded-xl shrink-0">
                Suggest feeds
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="border-border/50 overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2.5 text-lg" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center">
                <Rss className="h-4 w-4 text-accent-foreground" />
              </div>
              Add RSS Feed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://example.com/rss.xml"
                onKeyDown={(e) => e.key === "Enter" && addFeed()}
                className="h-11 rounded-xl"
              />
              <Button onClick={addFeed} disabled={loading} className="h-11 rounded-xl px-5" style={{ background: 'var(--gradient-hero)' }}>
                <Plus className="h-4 w-4 mr-1.5" /> Add
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50" style={{ boxShadow: 'var(--shadow-card)' }}>
          <CardHeader>
            <CardTitle className="text-lg" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Your Feeds
              <span className="text-sm font-normal text-muted-foreground ml-2">({feeds.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {feeds.length === 0 ? (
              <div className="py-8 text-center">
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <Rss className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground text-sm">No feeds added yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {feeds.map((feed) => (
                  <div
                    key={feed.id}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-border/50 bg-background hover:bg-muted/30 transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{feed.title || feed.feed_url}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{feed.feed_url}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFeed(feed.id)}
                      className="text-muted-foreground hover:text-destructive shrink-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {profile?.country && (
          <SuggestFeedsDialog
            open={suggestOpen}
            onOpenChange={setSuggestOpen}
            country={profile.country}
            city={profile.city}
            language={profile.preferred_language}
            existingUrls={feeds.map((f) => f.feed_url)}
            onAdd={handleAddSuggested}
          />
        )}
      </div>
    </AppLayout>
  );
}
