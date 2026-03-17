"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VetAILogoSVG } from "@/components/icons/medcare";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }
      const role = data.user?.role ?? "user";
      if (role === "vet" || role === "doctor") {
        router.replace("/vet/dashboard");
      } else if (role === "admin") {
        router.replace("/admin");
      } else {
        router.replace("/");
      }
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-muted/20 via-background to-muted/10 px-4 py-12">
      <div className="w-full max-w-[400px] flex flex-col items-center">
        {/* Centered logo */}
        <div className="flex justify-center mb-8">
          <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl bg-primary/5 border border-border/50 flex items-center justify-center shadow-sm">
            <VetAILogoSVG
              width={80}
              height={80}
              className="h-16 w-16 sm:h-20 sm:w-20 text-primary"
            />
          </div>
        </div>

        {/* Card */}
        <div className="w-full rounded-2xl border border-border/80 bg-card/80 backdrop-blur-sm shadow-lg shadow-black/5 p-8 space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Sign in</h1>
            <p className="text-sm text-muted-foreground">Enter your credentials to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 text-left">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium text-foreground">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                className="w-full h-11 rounded-lg border-border bg-background/50 focus-visible:ring-2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full h-11 rounded-lg border-border bg-background/50 pr-10 focus-visible:ring-2"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
                <p className="text-sm text-destructive font-medium" role="alert">
                  {error}
                </p>
              </div>
            )}
            <Button
              type="submit"
              className={cn(
                "w-full h-11 rounded-lg font-medium transition-opacity",
                loading && "opacity-70 pointer-events-none"
              )}
              disabled={loading}
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">VetAI · Animal Husbandry Assistant</p>
      </div>
    </div>
  );
}
