import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Loader2, MapPin } from "lucide-react";

export interface SuggestedFeed {
  url: string;
  title: string;
  level: "city" | "region" | "country";
  description: string;
  publisher?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  country: string;
  city?: string;
  language?: string;
  existingUrls?: string[];
  onAdd: (urls: SuggestedFeed[]) => void | Promise<void>;
  addLabel?: string;
}

const LEVEL_LABEL: Record<SuggestedFeed["level"], string> = {
  city: "City",
  region: "Region",
  country: "Country",
};

export default function SuggestFeedsDialog({
  open,
  onOpenChange,
  country,
  city,
  language,
  existingUrls = [],
  onAdd,
  addLabel = "Add selected",
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [feeds, setFeeds] = useState<SuggestedFeed[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [totalSuggested, setTotalSuggested] = useState(0);

  useEffect(() => {
    if (open) void fetchSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fetchSuggestions = async () => {
    setLoading(true);
    setFeeds([]);
    setSelected(new Set());
    setTotalSuggested(0);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-feeds", {
        body: { country, city, language },
      });
      if (error) {
        // supabase.functions.invoke hides the response body on non-2xx; try to read it.
        let serverMsg: string | undefined;
        try {
          const ctx = (error as any)?.context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            serverMsg = body?.error;
          }
        } catch {
          // ignore
        }
        throw new Error(serverMsg || error.message || "Request failed");
      }
      const suggested: SuggestedFeed[] = data?.feeds || [];
      const existing = new Set(existingUrls);
      const fresh: SuggestedFeed[] = suggested.filter((f: SuggestedFeed) => !existing.has(f.url));
      setTotalSuggested(suggested.length);

      // Pre-select all suggested feeds by default
      const preselected = new Set<string>(fresh.map((f) => f.url));

      setFeeds(fresh);
      setSelected(preselected);

      if (suggested.length === 0) {
        toast({
          title: "No new feeds found",
          description: "We couldn't find additional validated feeds for this location.",
        });
      } else if (fresh.length === 0) {
        toast({
          title: "Suggestions already added",
          description: "All suggested feeds for this location are already in your list.",
        });
      }
    } catch (e: any) {
      toast({
        title: "Couldn't fetch suggestions",
        description: e?.message || "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggle = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const handleAdd = async () => {
    const chosen = feeds.filter((f) => selected.has(f.url));
    if (chosen.length === 0) {
      toast({ title: "Select at least one feed" });
      return;
    }
    setAdding(true);
    try {
      await onAdd(chosen);
      onOpenChange(false);
    } finally {
      setAdding(false);
    }
  };

  const grouped = (["city", "region", "country"] as const).map((lvl) => ({
    level: lvl,
    items: feeds.filter((f) => f.level === lvl),
  }));

  const locationLabel = [city, country].filter(Boolean).join(", ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Suggested feeds
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> {locationLabel || "your location"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mb-3" />
              <p className="text-sm">Finding & validating local feeds…</p>
            </div>
          ) : feeds.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {totalSuggested > 0
                ? "All suggested feeds for this location are already in My Feeds."
                : "No validated feeds found for this location."}
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map(({ level, items }) =>
                items.length === 0 ? null : (
                  <div key={level}>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      {LEVEL_LABEL[level]} ({items.length})
                    </h4>
                    <div className="space-y-1.5">
                      {items.map((f) => (
                        <label
                          key={f.url}
                          className="flex items-start gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/40 cursor-pointer transition-colors"
                        >
                          <Checkbox
                            checked={selected.has(f.url)}
                            onCheckedChange={() => toggle(f.url)}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-tight">{f.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{f.description}</p>
                            <p className="text-[11px] text-muted-foreground/70 mt-1 truncate">{f.url}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={adding}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={loading || adding || selected.size === 0}>
            {adding ? "Adding…" : `${addLabel} (${selected.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}