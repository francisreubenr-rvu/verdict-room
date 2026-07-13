"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// One QueryClient per browser session (not per render) — standard TanStack
// Query + Next.js App Router pattern to avoid sharing state across requests
// on the server while still surviving client-side navigations.
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
