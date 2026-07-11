"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  const [query, setQuery] = useState("");

  // M1 scaffold only — the research pipeline (search -> fetch -> extract ->
  // synthesize) is M2. This just captures input; submit is inert for now.
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b-2 border-foreground px-6 py-4">
        <span className="font-serif text-lg font-semibold tracking-tight">
          PurchasePilot
        </span>
        <Link
          href="/login"
          className="font-mono text-sm text-muted-foreground hover:text-foreground"
        >
          Sign in
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center px-6 py-20">
        <div className="w-full max-w-2xl text-center">
          <h1 className="font-serif text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
            One input in. A verdict you can trust.
          </h1>
          <p className="mx-auto mt-4 max-w-lg font-serif text-lg text-muted-foreground">
            Tell us what you&apos;re buying. We watch the reviews, read the
            threads, and separate sponsored opinion from organic — so you
            don&apos;t have to.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mt-10 rounded-lg border-2 border-foreground bg-card p-2 shadow-[4px_4px_0_0_var(--color-foreground)] sm:flex sm:items-center sm:gap-2 sm:p-2"
          >
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Best noise-cancelling headphones under $300 for travel, I have an iPhone"
              className="h-12 flex-1 border-0 bg-transparent font-serif text-base shadow-none focus-visible:ring-0"
            />
            <Button
              type="submit"
              size="lg"
              disabled={query.trim().length === 0}
              className="mt-2 h-12 w-full sm:mt-0 sm:w-auto"
            >
              Research
            </Button>
          </form>
        </div>

        <section className="mt-24 w-full max-w-2xl">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Recent research
          </h2>
          <Card className="mt-3 border-2 border-dashed border-border bg-transparent shadow-none">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <p className="font-serif text-muted-foreground">
                No research sessions yet. Run one above to see it here.
              </p>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
