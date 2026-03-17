"use client";

import { Thread } from "@/components/thread";
import { StreamProvider } from "@/providers/Stream";
import { ArtifactProvider } from "@/components/thread/artifact";
import { Toaster } from "@/components/ui/sonner";
import { SessionRedirect } from "@/components/auth/session-redirect";
import React from "react";

export default function UserPage(): React.ReactNode {
  return (
    <SessionRedirect>
      <React.Suspense fallback={<div>Loading (layout)...</div>}>
        <Toaster />
        <StreamProvider>
          <ArtifactProvider>
            <Thread />
          </ArtifactProvider>
        </StreamProvider>
      </React.Suspense>
    </SessionRedirect>
  );
}
