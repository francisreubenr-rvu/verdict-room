import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Verdict } from "@/components/verdict";
import type { VerdictJson } from "@/components/research-types";

interface ReportCardProps {
  query: string;
  verdictJson: VerdictJson;
}

export function ReportCard({ query, verdictJson }: ReportCardProps) {
  return (
    <Card className="border-2 border-foreground shadow-[4px_4px_0_0_var(--color-foreground)]">
      <CardHeader>
        <CardTitle className="font-serif text-base font-medium text-muted-foreground">
          {query}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Verdict verdict={verdictJson.verdict} options={verdictJson.options} />
      </CardContent>
    </Card>
  );
}
