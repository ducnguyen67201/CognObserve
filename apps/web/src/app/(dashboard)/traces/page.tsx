import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function TracesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Traces</h1>
        <p className="text-muted-foreground">
          View and analyze your LLM traces.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>No traces yet</CardTitle>
          <CardDescription>
            Traces will appear here once you start sending data from your AI applications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Configure your SDK to send traces to CognObserve to get started.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
