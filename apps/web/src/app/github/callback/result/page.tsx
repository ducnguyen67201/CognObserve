"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

/**
 * GitHub OAuth Result Page
 *
 * This page receives the result from the API callback route and
 * communicates it to the parent window via postMessage.
 */
export default function GitHubCallbackResultPage() {
  const searchParams = useSearchParams();

  const success = searchParams.get("success") === "true";
  const error = searchParams.get("error");
  const repoCount = searchParams.get("repoCount");

  useEffect(() => {
    // Build result object
    const result = success
      ? { type: "github-oauth-result", success: true, repoCount: Number(repoCount) }
      : { type: "github-oauth-result", success: false, error: error || "unknown" };

    console.log("[GitHub Result] Sending postMessage:", result);

    // Send result to parent window
    if (window.opener) {
      window.opener.postMessage(result, window.location.origin);

      // Close popup after a brief delay
      const timeout = setTimeout(() => {
        window.close();
      }, 1500);

      return () => clearTimeout(timeout);
    }
  }, [success, error, repoCount]);

  // Render success state
  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <CheckCircle2 className="h-16 w-16 text-green-500" />
        <h1 className="mt-4 text-xl font-semibold">GitHub Connected!</h1>
        <p className="mt-2 text-muted-foreground">
          {repoCount} repositories synced
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          This window will close automatically...
        </p>
      </div>
    );
  }

  // Error states
  const errorMessages: Record<string, { title: string; description: string }> = {
    cancelled: {
      title: "Connection Cancelled",
      description: "You cancelled the GitHub authorization.",
    },
    invalid_state: {
      title: "Session Expired",
      description: "Your session has expired. Please try again.",
    },
    github_api_error: {
      title: "Connection Failed",
      description: "Failed to connect to GitHub. Please try again.",
    },
    missing_installation: {
      title: "Installation Failed",
      description: "GitHub did not return installation details.",
    },
  };

  const errorInfo = error
    ? errorMessages[error] || { title: "Unknown Error", description: "An unknown error occurred." }
    : { title: "Unknown Error", description: "An unknown error occurred." };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <XCircle className="h-16 w-16 text-destructive" />
      <h1 className="mt-4 text-xl font-semibold">{errorInfo.title}</h1>
      <p className="mt-2 text-muted-foreground">{errorInfo.description}</p>
      <p className="mt-4 text-sm text-muted-foreground">
        This window will close automatically...
      </p>
    </div>
  );
}
