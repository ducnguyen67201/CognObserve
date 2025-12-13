"use client";

import { useState, useCallback } from "react";
import {
  Github,
  MoreHorizontal,
  RefreshCw,
  Power,
  PowerOff,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { showError } from "@/lib/errors";
import { showSuccess } from "@/lib/success";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TableCell, TableRow } from "@/components/ui/table";
import { RepositoryStatusBadge } from "./repository-status-badge";
import type { Repository } from "./types";

interface RepositoryRowProps {
  repository: Repository;
  workspaceSlug: string;
  onRefresh: () => void;
}

export function RepositoryRow({
  repository,
  workspaceSlug,
  onRefresh,
}: RepositoryRowProps) {
  const [showDisableDialog, setShowDisableDialog] = useState(false);

  const enable = trpc.github.enableRepository.useMutation({
    onSuccess: () => {
      showSuccess("Repository enabled", "Indexing will begin shortly.");
      onRefresh();
    },
    onError: showError,
  });

  const disable = trpc.github.disableRepository.useMutation({
    onSuccess: () => {
      showSuccess("Repository disabled", "Indexing has been stopped.");
      setShowDisableDialog(false);
      onRefresh();
    },
    onError: showError,
  });

  const reindex = trpc.github.reindexRepository.useMutation({
    onSuccess: () => {
      showSuccess("Re-indexing started", "This may take a few minutes.");
      onRefresh();
    },
    onError: showError,
  });

  const isLoading = enable.isPending || disable.isPending || reindex.isPending;

  const handleEnable = useCallback(() => {
    enable.mutate({ workspaceSlug, repositoryId: repository.id });
  }, [enable, workspaceSlug, repository.id]);

  const handleDisableClick = useCallback(() => {
    setShowDisableDialog(true);
  }, []);

  const handleDisableConfirm = useCallback(() => {
    disable.mutate({ workspaceSlug, repositoryId: repository.id });
  }, [disable, workspaceSlug, repository.id]);

  const handleDisableCancel = useCallback(() => {
    setShowDisableDialog(false);
  }, []);

  const handleReindex = useCallback(() => {
    reindex.mutate({ workspaceSlug, repositoryId: repository.id });
  }, [reindex, workspaceSlug, repository.id]);

  const githubUrl = `https://github.com/${repository.fullName}`;

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex items-center gap-3">
            <Github className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">{repository.fullName}</span>
          </div>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-2">
            <RepositoryStatusBadge
              enabled={repository.enabled}
              status={repository.indexStatus}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MoreHorizontal className="h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {repository.enabled ? (
                  <>
                    <DropdownMenuItem onClick={handleReindex}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Re-index
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDisableClick}>
                      <PowerOff className="mr-2 h-4 w-4" />
                      Disable
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem onClick={handleEnable}>
                    <Power className="mr-2 h-4 w-4" />
                    Enable
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View on GitHub
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      </TableRow>

      <AlertDialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable repository indexing?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop indexing for{" "}
              <span className="font-medium">{repository.fullName}</span> and
              delete all existing code chunks. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDisableCancel}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisableConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disable.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
