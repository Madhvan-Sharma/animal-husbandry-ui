"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function SessionRedirect({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const role = data.user?.role;
        if (role === "vet" || role === "doctor") {
          router.replace("/vet/dashboard");
          return;
        }
        if (role === "admin") {
          router.replace("/admin");
          return;
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [router]);

  return <>{children}</>;
}
