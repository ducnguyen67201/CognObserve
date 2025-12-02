"use client";

import { useState } from "react";
import { Bell, Plus, AlertTriangle, Clock, MoreVertical, Trash2, TestTube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import { CreateAlertDialog } from "./create-alert-dialog";
import { AddChannelDialog } from "./add-channel-dialog";
import { showError, alertError } from "@/lib/errors";
import { alertToast } from "@/lib/success";
import { ALERT_TYPE_LABELS, type AlertType } from "@cognobserve/api/schemas";

interface AlertsPanelProps {
  workspaceSlug: string;
  projectId: string;
}

const ALERT_TYPE_ICONS: Record<string, typeof AlertTriangle> = {
  ERROR_RATE: AlertTriangle,
  LATENCY_P50: Clock,
  LATENCY_P95: Clock,
  LATENCY_P99: Clock,
};

export function AlertsPanel({ workspaceSlug, projectId }: AlertsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [isAddChannelOpen, setIsAddChannelOpen] = useState(false);

  const utils = trpc.useUtils();
  const { data: alerts, isLoading } = trpc.alerts.list.useQuery(
    { workspaceSlug, projectId },
    { enabled: isOpen }
  );

  const toggleMutation = trpc.alerts.toggle.useMutation({
    onSuccess: () => {
      utils.alerts.list.invalidate();
      alertToast.updated();
    },
    onError: (error) => {
      showError(error);
    },
  });

  const deleteMutation = trpc.alerts.delete.useMutation({
    onSuccess: () => {
      utils.alerts.list.invalidate();
      alertToast.deleted();
    },
    onError: (error) => {
      showError(error);
    },
  });

  const testChannelMutation = trpc.alerts.testChannel.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        alertToast.testSent();
        utils.alerts.list.invalidate();
      } else {
        alertError.testFailed(result.error);
      }
    },
    onError: (error) => {
      showError(error);
    },
  });

  const handleToggle = (id: string) => {
    toggleMutation.mutate({ workspaceSlug, id });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate({ workspaceSlug, id });
  };

  const handleTestChannel = (channelId: string) => {
    testChannelMutation.mutate({ workspaceSlug, channelId });
  };

  const handleOpenAddChannel = (alertId: string) => {
    setSelectedAlertId(alertId);
    setIsAddChannelOpen(true);
  };

  const handleCloseCreateDialog = () => {
    setIsCreateOpen(false);
  };

  const handleCloseAddChannel = () => {
    setIsAddChannelOpen(false);
    setSelectedAlertId(null);
  };

  // Count active alerts
  const activeAlerts = alerts?.filter((a) => a.enabled).length ?? 0;

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Bell className="h-4 w-4" />
            Alerts
            {activeAlerts > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {activeAlerts}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px] sm:max-w-[540px] flex flex-col p-0">
          <SheetHeader className="p-6 pb-4 border-b">
            <div className="flex items-center justify-between pr-8">
              <SheetTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Project Alerts
              </SheetTitle>
              <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Alert
              </Button>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="p-6 space-y-4">
              {isLoading ? (
                <AlertsSkeleton />
              ) : alerts?.length === 0 ? (
                <EmptyState onCreateClick={() => setIsCreateOpen(true)} />
              ) : (
                alerts?.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    onAddChannel={handleOpenAddChannel}
                    onTestChannel={handleTestChannel}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <CreateAlertDialog
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        open={isCreateOpen}
        onClose={handleCloseCreateDialog}
      />

      {selectedAlertId && (
        <AddChannelDialog
          workspaceSlug={workspaceSlug}
          alertId={selectedAlertId}
          open={isAddChannelOpen}
          onClose={handleCloseAddChannel}
        />
      )}
    </>
  );
}

interface AlertCardProps {
  alert: {
    id: string;
    name: string;
    type: AlertType;
    threshold: number;
    operator: string;
    windowMins: number;
    enabled: boolean;
    channels: Array<{ id: string; provider: string; verified: boolean }>;
    _count: { history: number };
  };
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onAddChannel: (alertId: string) => void;
  onTestChannel: (channelId: string) => void;
}

function AlertCard({
  alert,
  onToggle,
  onDelete,
  onAddChannel,
  onTestChannel,
}: AlertCardProps) {
  const Icon = ALERT_TYPE_ICONS[alert.type] ?? AlertTriangle;
  const thresholdDisplay =
    alert.type === "ERROR_RATE" ? `${alert.threshold}%` : `${alert.threshold}ms`;
  const operatorDisplay = alert.operator === "GREATER_THAN" ? ">" : "<";

  const handleToggleClick = () => onToggle(alert.id);
  const handleDeleteClick = () => onDelete(alert.id);
  const handleAddChannelClick = () => onAddChannel(alert.id);

  return (
    <div
      className={`rounded-lg border p-4 ${!alert.enabled ? "opacity-60 bg-muted/50" : "bg-card"}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`rounded-lg p-2 ${
              alert.type === "ERROR_RATE"
                ? "bg-destructive/10 text-destructive"
                : "bg-amber-500/10 text-amber-600"
            }`}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h4 className="font-medium">{alert.name}</h4>
              {!alert.enabled && (
                <Badge variant="secondary" className="text-xs">
                  Disabled
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {ALERT_TYPE_LABELS[alert.type]} {operatorDisplay} {thresholdDisplay}
            </p>
            <p className="text-xs text-muted-foreground">
              Window: {alert.windowMins}min
              {alert._count.history > 0 && (
                <span className="ml-2">
                  ({alert._count.history} trigger{alert._count.history !== 1 ? "s" : ""})
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch checked={alert.enabled} onCheckedChange={handleToggleClick} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleAddChannelClick}>
                <Plus className="mr-2 h-4 w-4" />
                Add Channel
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDeleteClick}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Channels */}
      {alert.channels.length > 0 && (
        <div className="mt-3 pt-3 border-t">
          <p className="text-xs text-muted-foreground mb-2">Notification Channels</p>
          <div className="flex flex-wrap gap-2">
            {alert.channels.map((channel) => (
              <div key={channel.id} className="flex items-center gap-1">
                <Badge
                  variant={channel.verified ? "default" : "outline"}
                  className="text-xs gap-1"
                >
                  {channel.provider}
                  {channel.verified && <span className="text-green-500">✓</span>}
                </Badge>
                {!channel.verified && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onTestChannel(channel.id)}
                    title="Send test notification"
                  >
                    <TestTube className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AlertsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  onCreateClick: () => void;
}

function EmptyState({ onCreateClick }: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Bell className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="font-medium mb-2">No alerts configured</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Create alerts to get notified when metrics exceed thresholds.
      </p>
      <Button onClick={onCreateClick}>
        <Plus className="h-4 w-4 mr-2" />
        Create Alert
      </Button>
    </div>
  );
}
