"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";

interface AddChannelDialogProps {
  workspaceSlug: string;
  alertId: string;
  open: boolean;
  onClose: () => void;
}

type ChannelProvider = "GMAIL" | "DISCORD";

const CHANNEL_PROVIDERS = [
  {
    value: "GMAIL" as const,
    label: "Gmail / Email",
    icon: Mail,
    description: "Send alerts via email",
  },
  {
    value: "DISCORD" as const,
    label: "Discord",
    icon: MessageSquare,
    description: "Send alerts to a Discord channel",
  },
] as const;

const GmailFormSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const DiscordFormSchema = z.object({
  webhookUrl: z
    .string()
    .url("Invalid URL")
    .refine(
      (url) => url.startsWith("https://discord.com/api/webhooks/"),
      "Must be a Discord webhook URL"
    ),
});

export function AddChannelDialog({
  workspaceSlug,
  alertId,
  open,
  onClose,
}: AddChannelDialogProps) {
  const [selectedProvider, setSelectedProvider] = useState<ChannelProvider | null>(null);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedProvider(null);
      onClose();
    }
  };

  const handleBack = () => {
    setSelectedProvider(null);
  };

  const handleSelectProvider = (provider: ChannelProvider) => {
    setSelectedProvider(provider);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        {selectedProvider === null ? (
          <ProviderSelection onSelect={handleSelectProvider} />
        ) : selectedProvider === "GMAIL" ? (
          <GmailChannelForm
            workspaceSlug={workspaceSlug}
            alertId={alertId}
            onBack={handleBack}
            onClose={onClose}
          />
        ) : (
          <DiscordChannelForm
            workspaceSlug={workspaceSlug}
            alertId={alertId}
            onBack={handleBack}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ProviderSelectionProps {
  onSelect: (provider: ChannelProvider) => void;
}

function ProviderSelection({ onSelect }: ProviderSelectionProps) {
  const renderProviderButton = (provider: (typeof CHANNEL_PROVIDERS)[number]) => {
    const Icon = provider.icon;
    const handleClick = () => onSelect(provider.value);

    return (
      <button
        key={provider.value}
        type="button"
        onClick={handleClick}
        className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-left w-full"
      >
        <div className="rounded-lg bg-muted p-3">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="font-medium">{provider.label}</div>
          <div className="text-sm text-muted-foreground">{provider.description}</div>
        </div>
      </button>
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add Notification Channel</DialogTitle>
        <DialogDescription>
          Choose how you want to receive alert notifications.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-4">{CHANNEL_PROVIDERS.map(renderProviderButton)}</div>
    </>
  );
}

interface ChannelFormProps {
  workspaceSlug: string;
  alertId: string;
  onBack: () => void;
  onClose: () => void;
}

function GmailChannelForm({ workspaceSlug, alertId, onBack, onClose }: ChannelFormProps) {
  const utils = trpc.useUtils();
  const form = useForm<z.infer<typeof GmailFormSchema>>({
    resolver: zodResolver(GmailFormSchema),
    defaultValues: { email: "" },
  });

  const addMutation = trpc.alerts.addChannel.useMutation({
    onSuccess: () => {
      utils.alerts.list.invalidate();
      toast.success("Email channel added");
      onClose();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (values: z.infer<typeof GmailFormSchema>) => {
    addMutation.mutate({
      workspaceSlug,
      alertId,
      provider: "GMAIL",
      config: values,
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add Email Channel</DialogTitle>
        <DialogDescription>
          Enter the email address to receive alert notifications.
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email Address</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="alerts@example.com"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Alerts will be sent to this email address.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onBack}>
              Back
            </Button>
            <Button type="submit" disabled={addMutation.isPending}>
              {addMutation.isPending ? "Adding..." : "Add Channel"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}

function DiscordChannelForm({ workspaceSlug, alertId, onBack, onClose }: ChannelFormProps) {
  const utils = trpc.useUtils();
  const form = useForm<z.infer<typeof DiscordFormSchema>>({
    resolver: zodResolver(DiscordFormSchema),
    defaultValues: { webhookUrl: "" },
  });

  const addMutation = trpc.alerts.addChannel.useMutation({
    onSuccess: () => {
      utils.alerts.list.invalidate();
      toast.success("Discord channel added");
      onClose();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (values: z.infer<typeof DiscordFormSchema>) => {
    addMutation.mutate({
      workspaceSlug,
      alertId,
      provider: "DISCORD",
      config: values,
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add Discord Channel</DialogTitle>
        <DialogDescription>
          Enter your Discord webhook URL to receive alert notifications.
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
          <FormField
            control={form.control}
            name="webhookUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Webhook URL</FormLabel>
                <FormControl>
                  <Input
                    type="url"
                    placeholder="https://discord.com/api/webhooks/..."
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Create a webhook in your Discord server settings under
                  Integrations &gt; Webhooks.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onBack}>
              Back
            </Button>
            <Button type="submit" disabled={addMutation.isPending}>
              {addMutation.isPending ? "Adding..." : "Add Channel"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
