"use client";

import { useCallback } from "react";
import { useForm } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";

interface CreateAlertDialogProps {
  workspaceSlug: string;
  projectId: string;
  open: boolean;
  onClose: () => void;
}

const ALERT_TYPES = [
  { value: "ERROR_RATE", label: "Error Rate", unit: "%" },
  { value: "LATENCY_P50", label: "Latency (P50)", unit: "ms" },
  { value: "LATENCY_P95", label: "Latency (P95)", unit: "ms" },
  { value: "LATENCY_P99", label: "Latency (P99)", unit: "ms" },
] as const;

const OPERATORS = [
  { value: "GREATER_THAN", label: "Greater than (>)" },
  { value: "LESS_THAN", label: "Less than (<)" },
] as const;

interface CreateAlertFormValues {
  name: string;
  type: "ERROR_RATE" | "LATENCY_P50" | "LATENCY_P95" | "LATENCY_P99";
  threshold: string;
  operator: "GREATER_THAN" | "LESS_THAN";
  windowMins: string;
  cooldownMins: string;
}

const DEFAULT_VALUES: CreateAlertFormValues = {
  name: "",
  type: "ERROR_RATE",
  threshold: "5",
  operator: "GREATER_THAN",
  windowMins: "5",
  cooldownMins: "60",
};

export function CreateAlertDialog({
  workspaceSlug,
  projectId,
  open,
  onClose,
}: CreateAlertDialogProps) {
  const utils = trpc.useUtils();
  const form = useForm<CreateAlertFormValues>({
    defaultValues: DEFAULT_VALUES,
  });

  const createMutation = trpc.alerts.create.useMutation({
    onSuccess: () => {
      utils.alerts.list.invalidate();
      toast.success("Alert created successfully");
      form.reset();
      onClose();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = useCallback(
    (values: CreateAlertFormValues) => {
      const threshold = parseFloat(values.threshold);
      const windowMins = parseInt(values.windowMins, 10);
      const cooldownMins = parseInt(values.cooldownMins, 10);

      if (isNaN(threshold) || threshold < 0) {
        form.setError("threshold", { message: "Must be a positive number" });
        return;
      }
      if (isNaN(windowMins) || windowMins < 1 || windowMins > 60) {
        form.setError("windowMins", { message: "Must be 1-60" });
        return;
      }
      if (isNaN(cooldownMins) || cooldownMins < 1 || cooldownMins > 1440) {
        form.setError("cooldownMins", { message: "Must be 1-1440" });
        return;
      }

      createMutation.mutate({
        workspaceSlug,
        projectId,
        name: values.name,
        type: values.type,
        operator: values.operator,
        threshold,
        windowMins,
        cooldownMins,
      });
    },
    [createMutation, workspaceSlug, projectId, form]
  );

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        form.reset();
        onClose();
      }
    },
    [form, onClose]
  );

  const handleFormSubmit = form.handleSubmit(handleSubmit);

  const selectedType = form.watch("type");
  const unit = ALERT_TYPES.find((t) => t.value === selectedType)?.unit ?? "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Alert</DialogTitle>
          <DialogDescription>
            Set up an alert to get notified when a metric exceeds your threshold.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Alert Name</FormLabel>
                  <FormControl>
                    <Input placeholder="High Error Rate" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Metric Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select metric type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ALERT_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="operator"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Condition</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select condition" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {OPERATORS.map((op) => (
                          <SelectItem key={op.value} value={op.value}>
                            {op.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="threshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Threshold ({unit})</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="windowMins"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time Window (minutes)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={60} {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormDescription>1-60 minutes</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cooldownMins"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cooldown (minutes)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={1440} {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormDescription>1-1440 minutes</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Alert"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
