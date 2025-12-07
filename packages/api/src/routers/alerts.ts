/**
 * Alerts Router
 *
 * tRPC router for alert management.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "@cognobserve/db";
import { createRouter, protectedProcedure, workspaceMiddleware } from "../trpc";
import {
  AlertTypeSchema,
  AlertOperatorSchema,
  ChannelProviderSchema,
} from "../schemas/alerting";
import {
  LinkChannelSchema,
  UnlinkChannelSchema,
  GetLinkedChannelsSchema,
} from "../schemas/channels";
import { AlertingAdapter } from "../lib/alerting";
import { getAvailableProviders } from "../lib/alerting/init";

/**
 * Input schemas
 */
const CreateAlertSchema = z.object({
  workspaceSlug: z.string(),
  projectId: z.string(),
  name: z.string().min(1).max(100),
  type: AlertTypeSchema,
  threshold: z.number().min(0),
  operator: AlertOperatorSchema.default("GREATER_THAN"),
  windowMins: z.number().int().min(1).max(60).default(5),
  cooldownMins: z.number().int().min(1).max(1440).default(60),
});

const UpdateAlertSchema = z.object({
  workspaceSlug: z.string(),
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  threshold: z.number().min(0).optional(),
  operator: AlertOperatorSchema.optional(),
  windowMins: z.number().int().min(1).max(60).optional(),
  cooldownMins: z.number().int().min(1).max(1440).optional(),
  enabled: z.boolean().optional(),
});

const AddChannelSchema = z.object({
  workspaceSlug: z.string(),
  alertId: z.string(),
  provider: ChannelProviderSchema,
  config: z.record(z.unknown()),
});

/**
 * Alerts Router
 */
export const alertsRouter = createRouter({
  /**
   * List alerts for a project
   */
  list: protectedProcedure
    .input(z.object({ workspaceSlug: z.string(), projectId: z.string() }))
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      // Verify project belongs to workspace
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspace.id },
        select: { id: true },
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      return prisma.alert.findMany({
        where: { projectId: input.projectId },
        include: {
          channels: {
            select: { id: true, provider: true, verified: true },
          },
          _count: { select: { history: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  /**
   * Get single alert with full details
   */
  get: protectedProcedure
    .input(z.object({ workspaceSlug: z.string(), id: z.string() }))
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const alert = await prisma.alert.findUnique({
        where: { id: input.id },
        include: {
          project: { select: { workspaceId: true } },
          channels: true,
          history: {
            take: 10,
            orderBy: { triggeredAt: "desc" },
          },
        },
      });

      if (!alert) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Alert not found" });
      }

      // Verify workspace access
      if (alert.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return alert;
    }),

  /**
   * Create new alert
   */
  create: protectedProcedure
    .input(CreateAlertSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Verify project belongs to workspace
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspace.id },
        select: { id: true },
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      return prisma.alert.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          type: input.type,
          threshold: input.threshold,
          operator: input.operator,
          windowMins: input.windowMins,
          cooldownMins: input.cooldownMins,
        },
        include: { channels: true },
      });
    }),

  /**
   * Update alert
   */
  update: protectedProcedure
    .input(UpdateAlertSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Verify alert exists and belongs to workspace
      const alert = await prisma.alert.findUnique({
        where: { id: input.id },
        include: { project: { select: { workspaceId: true } } },
      });

      if (!alert) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Alert not found" });
      }

      if (alert.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Extract only the fields we want to update
      const { name, threshold, operator, windowMins, cooldownMins, enabled } = input;
      const updateData = { name, threshold, operator, windowMins, cooldownMins, enabled };

      return prisma.alert.update({
        where: { id: input.id },
        data: updateData,
        include: { channels: true },
      });
    }),

  /**
   * Delete alert
   */
  delete: protectedProcedure
    .input(z.object({ workspaceSlug: z.string(), id: z.string() }))
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Verify alert exists and belongs to workspace
      const alert = await prisma.alert.findUnique({
        where: { id: input.id },
        include: { project: { select: { workspaceId: true } } },
      });

      if (!alert) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Alert not found" });
      }

      if (alert.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await prisma.alert.delete({ where: { id: input.id } });
      return { success: true };
    }),

  /**
   * Toggle alert enabled/disabled
   */
  toggle: protectedProcedure
    .input(z.object({ workspaceSlug: z.string(), id: z.string() }))
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Verify alert exists and belongs to workspace
      const alert = await prisma.alert.findUnique({
        where: { id: input.id },
        include: { project: { select: { workspaceId: true } } },
      });

      if (!alert) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (alert.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return prisma.alert.update({
        where: { id: input.id },
        data: { enabled: !alert.enabled },
      });
    }),

  /**
   * Get alert history
   */
  history: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string(),
        alertId: z.string(),
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      // Verify alert exists and belongs to workspace
      const alert = await prisma.alert.findUnique({
        where: { id: input.alertId },
        include: { project: { select: { workspaceId: true } } },
      });

      if (!alert) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (alert.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const history = await prisma.alertHistory.findMany({
        where: { alertId: input.alertId },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { triggeredAt: "desc" },
      });

      let nextCursor: string | undefined;
      if (history.length > input.limit) {
        const next = history.pop();
        nextCursor = next?.id;
      }

      return { items: history, nextCursor };
    }),

  /**
   * Add notification channel to alert
   */
  addChannel: protectedProcedure
    .input(AddChannelSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Verify alert exists and belongs to workspace
      const alert = await prisma.alert.findUnique({
        where: { id: input.alertId },
        include: { project: { select: { workspaceId: true } } },
      });

      if (!alert) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Alert not found" });
      }

      if (alert.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Validate config with adapter
      try {
        const adapter = AlertingAdapter(input.provider);
        const validatedConfig = adapter.validateConfig(input.config);

        return prisma.alertChannel.create({
          data: {
            alertId: input.alertId,
            provider: input.provider,
            config: validatedConfig as object,
          },
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("No adapter registered")) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Provider ${input.provider} is not available`,
          });
        }
        throw error;
      }
    }),

  /**
   * Remove notification channel
   */
  removeChannel: protectedProcedure
    .input(z.object({ workspaceSlug: z.string(), channelId: z.string() }))
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Verify channel exists and belongs to workspace
      const channel = await prisma.alertChannel.findUnique({
        where: { id: input.channelId },
        include: {
          alert: {
            include: { project: { select: { workspaceId: true } } },
          },
        },
      });

      if (!channel) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (channel.alert.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await prisma.alertChannel.delete({ where: { id: input.channelId } });
      return { success: true };
    }),

  /**
   * Test notification channel
   */
  testChannel: protectedProcedure
    .input(z.object({ workspaceSlug: z.string(), channelId: z.string() }))
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Verify channel exists and belongs to workspace
      const channel = await prisma.alertChannel.findUnique({
        where: { id: input.channelId },
        include: {
          alert: {
            include: { project: { select: { workspaceId: true } } },
          },
        },
      });

      if (!channel) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (channel.alert.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      try {
        const adapter = AlertingAdapter(channel.provider);
        const result = await adapter.sendTest(channel.config);

        // Mark as verified if successful
        if (result.success) {
          await prisma.alertChannel.update({
            where: { id: input.channelId },
            data: { verified: true },
          });
        }

        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return {
          success: false,
          provider: channel.provider,
          error: message,
        };
      }
    }),

  /**
   * Get list of available notification providers
   */
  getProviders: protectedProcedure.query(() => {
    return getAvailableProviders();
  }),

  /**
   * Link a workspace notification channel to an alert
   */
  linkChannel: protectedProcedure
    .input(LinkChannelSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Verify alert exists and belongs to workspace
      const alert = await prisma.alert.findFirst({
        where: {
          id: input.alertId,
          project: { workspaceId: ctx.workspace.id },
        },
      });

      if (!alert) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Alert not found" });
      }

      // Verify channel exists and belongs to workspace
      const channel = await prisma.notificationChannel.findFirst({
        where: { id: input.channelId, workspaceId: ctx.workspace.id },
      });

      if (!channel) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
      }

      // Atomic create - catch unique constraint violation
      try {
        return await prisma.alertChannelLink.create({
          data: {
            alertId: input.alertId,
            channelId: input.channelId,
          },
          include: {
            channel: {
              select: { id: true, name: true, provider: true, verified: true },
            },
          },
        });
      } catch (error) {
        // Prisma unique constraint violation
        if (
          error instanceof Error &&
          "code" in error &&
          (error as { code: string }).code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Channel is already linked to this alert",
          });
        }
        throw error;
      }
    }),

  /**
   * Unlink a workspace notification channel from an alert
   */
  unlinkChannel: protectedProcedure
    .input(UnlinkChannelSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Verify alert exists and belongs to workspace
      const alert = await prisma.alert.findFirst({
        where: {
          id: input.alertId,
          project: { workspaceId: ctx.workspace.id },
        },
      });

      if (!alert) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Alert not found" });
      }

      // Atomic delete with compound key - catch if not found
      try {
        await prisma.alertChannelLink.delete({
          where: {
            alertId_channelId: {
              alertId: input.alertId,
              channelId: input.channelId,
            },
          },
        });
        return { success: true };
      } catch (error) {
        // Handle record not found
        if (
          error instanceof Error &&
          "code" in error &&
          (error as { code: string }).code === "P2025"
        ) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Link not found" });
        }
        throw error;
      }
    }),

  /**
   * Get workspace notification channels linked to an alert
   */
  getLinkedChannels: protectedProcedure
    .input(GetLinkedChannelsSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      // Verify alert exists and belongs to workspace
      const alert = await prisma.alert.findUnique({
        where: { id: input.alertId },
        include: { project: { select: { workspaceId: true } } },
      });

      if (!alert) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Alert not found" });
      }

      if (alert.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const links = await prisma.alertChannelLink.findMany({
        where: { alertId: input.alertId },
        include: {
          channel: {
            select: { id: true, name: true, provider: true, verified: true },
          },
        },
      });

      return links.map((link) => link.channel);
    }),

  /**
   * Get all alert history for a project
   */
  projectHistory: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string(),
        projectId: z.string(),
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      // Verify project belongs to workspace
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspace.id },
        select: { id: true },
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const history = await prisma.alertHistory.findMany({
        where: {
          alert: { projectId: input.projectId },
        },
        include: {
          alert: {
            select: { id: true, name: true, type: true, threshold: true, operator: true },
          },
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { triggeredAt: "desc" },
      });

      let nextCursor: string | undefined;
      if (history.length > input.limit) {
        const next = history.pop();
        nextCursor = next?.id;
      }

      return { items: history, nextCursor };
    }),
});

export type AlertsRouter = typeof alertsRouter;
