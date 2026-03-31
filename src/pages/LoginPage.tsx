import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { FileSpreadsheet, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useGoogleLogin } from "@react-oauth/google";

const API = "/api";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const { toast } = useToast();
  const from = (location.state as any)?.from?.pathname || "/";

  // ── shared state ─────────────────────────────────────────
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);

  // ── sign-in ───────────────────────────────────────────────
  const [siUser, setSiUser] = useState("");
  const [siPass, setSiPass] = useState("");

  // ── register ─────────────────────────────────────────────
  const [regUser,  setRegUser]  = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPass,  setRegPass]  = useState("");
  const [regPass2, setRegPass2] = useState("");

  // ── helpers ───────────────────────────────────────────────
  function onSuccess(data: { access_token: string; username: string; role: string }) {
    login(data.access_token, { username: data.username, role: data.role });
    navigate(from, { replace: true });
  }

  async function post(endpoint: string, body: object) {
    const res = await fetch(`${API}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Request failed" }));
      throw new Error(err.detail || "Unknown error");
    }
    return res.json();
  }

  // ── sign in submit ────────────────────────────────────────
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!siUser.trim() || !siPass.trim()) return;
    setLoading(true);
    try {
      const data = await post("/auth/login", { username: siUser.trim(), password: siPass });
      onSuccess(data);
    } catch (err: any) {
      toast({ title: "Sign in failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  // ── register submit ───────────────────────────────────────
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (regPass !== regPass2) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (regPass.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const data = await post("/auth/register", {
        username: regUser.trim(),
        email: regEmail.trim(),
        password: regPass,
      });
      onSuccess(data);
    } catch (err: any) {
      toast({ title: "Registration failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  // ── Google sign in ────────────────────────────────────────
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      try {
        const data = await post("/auth/google", { access_token: tokenResponse.access_token });
        onSuccess(data);
      } catch (err: any) {
        toast({ title: "Google sign in failed", description: err.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      toast({ title: "Google sign in failed", description: "Could not connect to Google", variant: "destructive" });
    },
  });

  // ── shared password field ─────────────────────────────────
  function PwInput({ id, value, onChange, placeholder, autoComplete }: {
    id: string; value: string; onChange: (v: string) => void;
    placeholder: string; autoComplete: string;
  }) {
    return (
      <div className="relative">
        <Input
          id={id}
          type={showPw ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete={autoComplete}
          required
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setShowPw(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  }

  // ── Google button ─────────────────────────────────────────
  function GoogleButton() {
    return (
      <>
        <div className="relative my-4">
          <Separator />
          <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
            or
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full flex items-center gap-3"
          onClick={() => googleLogin()}
          disabled={loading}
        >
          {/* Google SVG logo */}
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </Button>
      </>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-sidebar-primary flex items-center justify-center mb-4">
            <FileSpreadsheet className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold">ProcureIQ</h1>
          <p className="text-muted-foreground text-sm mt-1">RFP Intelligence Platform</p>
        </div>

        {/* Card */}
        <div className="bg-card border rounded-2xl shadow-sm p-8">
          <Tabs defaultValue="signin">
            <TabsList className="w-full mb-6">
              <TabsTrigger value="signin"  className="flex-1">Sign In</TabsTrigger>
              <TabsTrigger value="register" className="flex-1">Create Account</TabsTrigger>
            </TabsList>

            {/* ── SIGN IN TAB ───────────────────────────── */}
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="si-user">Username</Label>
                  <Input
                    id="si-user"
                    type="text"
                    placeholder="Your username"
                    value={siUser}
                    onChange={e => setSiUser(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="si-pass">Password</Label>
                  <PwInput
                    id="si-pass"
                    value={siPass}
                    onChange={setSiPass}
                    placeholder="Your password"
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" className="w-full mt-2" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </form>
              <GoogleButton />
            </TabsContent>

            {/* ── REGISTER TAB ─────────────────────────── */}
            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-user">Username</Label>
                  <Input
                    id="reg-user"
                    type="text"
                    placeholder="Choose a username"
                    value={regUser}
                    onChange={e => setRegUser(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder="you@company.com"
                    value={regEmail}
                    onChange={e => setRegEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-pass">Password</Label>
                  <PwInput
                    id="reg-pass"
                    value={regPass}
                    onChange={setRegPass}
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-pass2">Confirm Password</Label>
                  <PwInput
                    id="reg-pass2"
                    value={regPass2}
                    onChange={setRegPass2}
                    placeholder="Repeat password"
                    autoComplete="new-password"
                  />
                </div>
                <Button type="submit" className="w-full mt-2" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading ? "Creating account…" : "Create Account"}
                </Button>
              </form>
              <GoogleButton />
            </TabsContent>
          </Tabs>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          By signing in you agree to the terms of use.
        </p>
      </div>
    </div>
  );
}
