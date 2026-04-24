import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [showForgot, setShowForgot] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast({ title: "Check your email", description: "We sent you a password reset link." });
      setShowForgot(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast({ title: "Check your email", description: "Confirm your account to continue." });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--gradient-warm)' }}>
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex h-12 w-12 rounded-2xl items-center justify-center text-primary-foreground font-bold text-lg mb-4" style={{ background: 'var(--gradient-hero)' }}>
            E
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Expat Digest</h1>
          <p className="text-sm text-muted-foreground mt-1">AI-powered news, personalized for you</p>
        </div>

        <Card className="border-border/50 overflow-hidden" style={{ boxShadow: 'var(--shadow-elevated)' }}>
          <CardHeader className="pb-2 pt-6">
            <CardTitle className="text-lg text-center" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              {showForgot ? "Reset password" : isLogin ? "Welcome back" : "Create account"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {showForgot ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11 rounded-xl"
                />
                <Button type="submit" className="w-full h-11 rounded-xl font-medium" disabled={loading} style={{ background: 'var(--gradient-hero)' }}>
                  {loading ? "Sending..." : "Send Reset Link"}
                </Button>
                <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setShowForgot(false)}>
                  Back to sign in
                </Button>
              </form>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <Input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11 rounded-xl"
                  />
                  <Input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="h-11 rounded-xl"
                  />
                  <Button type="submit" className="w-full h-11 rounded-xl font-medium" disabled={loading} style={{ background: 'var(--gradient-hero)' }}>
                    {loading ? "Loading..." : isLogin ? "Sign In" : "Sign Up"}
                  </Button>
                </form>
                {isLogin && (
                  <Button
                    variant="link"
                    className="w-full mt-2 text-muted-foreground text-sm"
                    onClick={() => setShowForgot(true)}
                  >
                    Forgot password?
                  </Button>
                )}
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
                  <div className="relative flex justify-center text-xs"><span className="bg-card px-3 text-muted-foreground">or</span></div>
                </div>
                <Button
                  variant="outline"
                  className="w-full rounded-xl h-10 text-muted-foreground"
                  onClick={() => setIsLogin(!isLogin)}
                >
                  {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
