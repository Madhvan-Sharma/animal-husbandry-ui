"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Mail, User as UserIcon } from "lucide-react";

type SessionUser = {
  id: string;
  username: string;
  role: string;
  name: string;
  email: string;
  specialization?: string;
};

let inFlight: Promise<SessionUser | null> | null = null;

async function fetchSessionUserOnce(): Promise<SessionUser | null> {
  if (inFlight) return inFlight;
  inFlight = fetch("/api/auth/session")
    .then((r) => r.json())
    .then((data) => (data?.user as SessionUser | null) ?? null)
    .catch(() => null)
    .finally(() => {
      // Reset inFlight but keep cache.
      inFlight = null;
    })
    .then((u) => {
      return u;
    });
  return inFlight;
}

export function LoggedInUser({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSessionUserOnce()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Card className={cn("border-border/70 bg-card/60", compact ? "px-3 py-2" : "p-3", className)}>
        <div className="h-4 w-44 rounded bg-muted animate-pulse" />
        {!compact && <div className="mt-2 h-3 w-56 rounded bg-muted animate-pulse" />}
      </Card>
    );
  }

  if (!user) return null;

  const roleLabel = (user.role || "user").toLowerCase();

  return (
    <Card
      className={cn(
        "border-border/70 bg-card/60 backdrop-blur-sm",
        compact ? "px-3 py-2" : "p-3",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <UserIcon className="size-4 text-muted-foreground shrink-0" />
            <p className="text-sm font-semibold text-foreground truncate">
              {user.name || user.username}
            </p>
            <Badge variant="secondary" className="h-5 px-2 text-[10px] uppercase tracking-wider">
              {roleLabel}
            </Badge>
          </div>
          {!compact && (
            <div className="mt-1 space-y-1">
              {user.email ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="size-3.5 shrink-0" />
                  <span className="truncate">{user.email}</span>
                </div>
              ) : null}
              {roleLabel !== "user" && user.specialization ? (
                <p className="text-xs text-muted-foreground truncate">
                  {user.specialization}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

