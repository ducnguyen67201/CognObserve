"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CreateWorkspaceSchema, type CreateWorkspaceInput } from "@cognobserve/api/client";
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
import { useWorkspace } from "@/hooks/use-workspace";

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Only allow lowercase alphanumeric and hyphens (matching WorkspaceSlugSchema)
const SLUG_CHAR_REGEX = /^[a-z0-9-]*$/;

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: CreateWorkspaceDialogProps) {
  const router = useRouter();
  const { createWorkspace, checkSlugAvailable } = useWorkspace();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);

  const form = useForm<CreateWorkspaceInput>({
    resolver: zodResolver(CreateWorkspaceSchema),
    defaultValues: {
      name: "",
      slug: "",
    },
  });

  const generateSlug = useCallback((name: string): string => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);
  }, []);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const name = e.target.value;
      form.setValue("name", name);

      // Auto-generate slug from name
      const slug = generateSlug(name);
      form.setValue("slug", slug);
      setSlugAvailable(null);
    },
    [form, generateSlug]
  );

  const handleSlugChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.toLowerCase();
      if (SLUG_CHAR_REGEX.test(value)) {
        form.setValue("slug", value);
        setSlugAvailable(null);
      }
    },
    [form]
  );

  const handleSlugBlur = useCallback(async () => {
    // Strip leading/trailing hyphens on blur to match WorkspaceSlugSchema
    const rawSlug = form.getValues("slug");
    const slug = rawSlug.replace(/^-+|-+$/g, "");
    if (slug !== rawSlug) {
      form.setValue("slug", slug);
    }
    if (slug.length >= 3) {
      const available = await checkSlugAvailable(slug);
      setSlugAvailable(available);
    }
  }, [form, checkSlugAvailable]);

  const handleSubmit = useCallback(
    async (data: CreateWorkspaceInput) => {
      setIsSubmitting(true);
      try {
        const workspace = await createWorkspace(data);
        toast.success("Workspace created", {
          description: `${workspace.name} has been created successfully.`,
        });
        onOpenChange(false);
        form.reset();
        setSlugAvailable(null);
        // Navigate to the new workspace
        router.push(`/workspace/${workspace.slug}`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to create workspace";
        toast.error("Error", { description: message });
      } finally {
        setIsSubmitting(false);
      }
    },
    [createWorkspace, onOpenChange, form, router]
  );

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        form.reset();
        setSlugAvailable(null);
      }
      onOpenChange(newOpen);
    },
    [form, onOpenChange]
  );

  const renderSlugStatus = () => {
    if (slugAvailable === null) return null;
    if (slugAvailable) {
      return (
        <span className="text-xs text-green-600">Slug is available</span>
      );
    }
    return (
      <span className="text-xs text-destructive">Slug is already taken</span>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Workspace</DialogTitle>
          <DialogDescription>
            Create a new workspace to organize your projects and collaborate
            with your team.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="My Workspace"
                      onChange={handleNameChange}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    The display name for your workspace.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL Slug</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="my-workspace"
                      onChange={handleSlugChange}
                      onBlur={handleSlugBlur}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Used in URLs: /workspace/{form.watch("slug") || "slug"}
                    {renderSlugStatus()}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || slugAvailable === false}
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Workspace
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
