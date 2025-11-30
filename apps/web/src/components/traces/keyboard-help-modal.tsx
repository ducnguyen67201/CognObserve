"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";
import { KEYBOARD_SHORTCUTS } from "@/hooks/traces/use-waterfall-keyboard";

interface KeyboardHelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Modal showing keyboard shortcuts for the waterfall view.
 */
export function KeyboardHelpModal({
  open,
  onOpenChange,
}: KeyboardHelpModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Use these shortcuts to navigate the waterfall view quickly.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          {KEYBOARD_SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.key}
              className="flex items-center justify-between"
            >
              <span className="text-sm text-muted-foreground">
                {shortcut.description}
              </span>
              <kbd className="rounded bg-muted px-2 py-1 font-mono text-xs">
                {shortcut.key}
              </kbd>
            </div>
          ))}
        </div>
        <div className="mt-6 text-center text-xs text-muted-foreground">
          Press <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Esc</kbd> to close
        </div>
      </DialogContent>
    </Dialog>
  );
}
