import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { User, Rss, Newspaper, FlaskConical, LogOut } from "lucide-react";

const navItems = [
  { to: "/brief", label: "Daily Brief", icon: Newspaper },
  { to: "/feeds", label: "My Feeds", icon: Rss },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/evaluation", label: "Evaluation", icon: FlaskConical },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { signOut, user } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-card/80 backdrop-blur-xl supports-[backdrop-filter]:bg-card/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/brief" className="flex items-center gap-2.5 group">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center text-primary-foreground font-bold text-sm" style={{ background: 'var(--gradient-hero)' }}>
              E
            </div>
            <span className="font-bold text-lg tracking-tight text-foreground" style={{ fontFamily: "'DM Serif Display', serif" }}>
              Expat Digest
            </span>
          </Link>
          <nav className="flex items-center gap-0.5">
            {navItems.map(({ to, label, icon: Icon }) => {
              const isActive = location.pathname === to;
              return (
                <Link key={to} to={to}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`gap-1.5 rounded-lg transition-all ${
                      isActive
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline text-sm">{label}</span>
                  </Button>
                </Link>
              );
            })}
            <div className="w-px h-6 bg-border mx-1.5" />
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              title="Sign out"
              className="text-muted-foreground hover:text-foreground rounded-lg"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
