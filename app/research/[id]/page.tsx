"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressTracker } from "@/components/progress-tracker";
import { ReportCard } from "@/components/report-card";
import { SourceList } from "@/components/source-list";
import { AttemptList } from "@/components/attempt-list";
import { AppFooter } from "@/components/footer";
import {
  isTerminalStatus,
  FAILURE_MESSAGES,
  type FailureReason,
  type ResearchSessionResponse,
} from "@/components/research-types";

async function fetchResearchSession(
  id: string
): Promise<ResearchSessionResponse> {
  const res = await fetch(`/api/research/${id}`);
  if (!res.ok) {
    throw new Error(`Failed to load research session (${res.status})`);
  }
  return res.json();
}

function CenteredMessage({
  message,
  linkLabel,
}: {
  message: string;
  linkLabel: string;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-[880px] flex-1 flex-col items-center justify-center gap-5 px-4 py-20 text-center sm:px-6">
        <p className="font-serif text-lg text-foreground">{message}</p>
        <Link href="/app" className={buttonVariants({ size: "lg" })}>
          {linkLabel}
        </Link>
      </main>
      <AppFooter />
    </div>
  );
}

export default function ResearchSessionPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isPending, isError } = useQuery({
    queryKey: ["research", id],
    queryFn: () => fetchResearchSession(id),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && isTerminalStatus(status) ? false : 2000;
    },
  });

  if (isPending) {
    return (
      <div className="flex flex-1 flex-col">
        <main className="mx-auto w-full max-w-[880px] flex-1 px-4 py-12 sm:px-6">
          <Skeleton className="h-6 w-1/2 rounded-xl" />
          <Skeleton className="mt-6 h-40 w-full rounded-3xl" />
        </main>
        <AppFooter />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <CenteredMessage
        message="Couldn't load this research session."
        linkLabel="Back to research"
      />
    );
  }

  if (data.status === "failed") {
    const message =
      FAILURE_MESSAGES[data.failureReason as FailureReason] ??
      "Research failed, try again.";
    return (
      <div className="flex flex-1 flex-col">
        <main className="mx-auto flex w-full max-w-[880px] flex-1 flex-col items-center gap-9 px-4 py-20 sm:px-6">
          <div className="flex flex-col items-center gap-5 text-center">
            <p className="font-serif text-lg text-foreground">{message}</p>
            <Link href="/app" className={buttonVariants({ size: "lg" })}>
              Start a new search
            </Link>
          </div>
          {data.attempts.length > 0 ? (
            <AttemptList attempts={data.attempts} />
          ) : null}
        </main>
        <AppFooter />
      </div>
    );
  }

  const isDone = data.status === "done";

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-9 px-4 py-12 sm:px-6">
        {!isDone ? (
          <ProgressTracker
            query={data.query}
            status={data.status}
            sources={data.sources}
            expectedSources={data.expectedSources}
          />
        ) : null}

        {isDone && data.verdictJson ? (
          <ReportCard
            query={data.query}
            verdictJson={data.verdictJson}
            sourceCount={data.sources.length}
            createdAt={data.createdAt}
            updatedAt={data.updatedAt}
          />
        ) : null}

        {data.sources.length > 0 ? <SourceList sources={data.sources} /> : null}

        {isDone && data.attempts.length > 0 ? (
          <AttemptList attempts={data.attempts} />
        ) : null}
      </main>

      <AppFooter />
    </div>
  );
}
