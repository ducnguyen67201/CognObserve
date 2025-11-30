"use client";

import { useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SpanJsonViewerProps {
  data: unknown;
  maxHeight?: number;
}

/**
 * Pretty-printed JSON viewer with copy button.
 */
export function SpanJsonViewer({ data, maxHeight = 300 }: SpanJsonViewerProps) {
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [jsonString]);

  return (
    <div className="relative group">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>

      <pre
        className={cn(
          "p-4 rounded-lg bg-muted overflow-auto text-xs font-mono",
          "whitespace-pre-wrap break-words"
        )}
        style={{ maxHeight }}
      >
        <code>{jsonString}</code>
      </pre>
    </div>
  );
}
