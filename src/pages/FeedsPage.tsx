import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Rss } from "lucide-react";
import AppLayout from "@/components/AppLayout";

export default function FeedsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [feeds, setFeeds] = useState<any[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) loadFeeds();
  }, [user]);

  const loadFeeds = async () => {
    const { data } = await supabase
      .from("user_feeds")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });
    setFeeds(data || []);
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rss className="h-5 w-5" /> Add RSS Feed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://example.com/rss.xml"
                onKeyDown={(e) => e.key === "Enter" && addFeed()}
              />
              <Button onClick={addFeed} disabled={loading}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your Feeds ({feeds.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {feeds.length === 0 ? (
              <p className="text-muted-foreground text-sm">No feeds added yet.</p>
            ) : (
              <div className="space-y-3">
                {feeds.map((feed) => (
                  <div
                    key={feed.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{feed.title || feed.feed_url}</p>
                      <p className="text-xs text-muted-foreground truncate">{feed.feed_url}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFeed(feed.id)}
                      className="text-destructive shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
