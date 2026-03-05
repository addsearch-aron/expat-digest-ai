import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";
import ProfilePage from "./pages/ProfilePage";
import FeedsPage from "./pages/FeedsPage";
import DailyBriefPage from "./pages/DailyBriefPage";
import EvaluationPage from "./pages/EvaluationPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    const check = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("topics")
        .eq("user_id", user.id)
        .single();
      
      const hasTopics = profile?.topics && profile.topics.length > 0;
      
      if (!hasTopics) {
        const { count } = await supabase
          .from("user_feeds")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id);
        setNeedsOnboarding(!count || count === 0);
      } else {
        setNeedsOnboarding(false);
      }
    };
    check();
  }, [user]);

  if (loading || needsOnboarding === null) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (needsOnboarding) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/brief" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
            <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
            <Route path="/brief" element={<OnboardingGate><DailyBriefPage /></OnboardingGate>} />
            <Route path="/feeds" element={<OnboardingGate><FeedsPage /></OnboardingGate>} />
            <Route path="/profile" element={<OnboardingGate><ProfilePage /></OnboardingGate>} />
            <Route path="/evaluation" element={<OnboardingGate><EvaluationPage /></OnboardingGate>} />
            <Route path="/" element={<Navigate to="/brief" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
