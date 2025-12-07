import { prisma, Prisma, SpanLevel } from "@cognobserve/db";
import { TRPCError } from "@trpc/server";
import type { TrackedUserWithStats } from "../schemas/trackedUsers";

interface ListUsersInput {
  projectId: string;
  workspaceId: string;
  search?: string;
  from?: Date;
  to?: Date;
  sortBy: "lastSeenAt" | "firstSeenAt" | "traceCount" | "totalCost";
  sortOrder: "asc" | "desc";
  limit: number;
  cursor?: string;
}

interface UserMetrics {
  user_id: string;
  trace_count: bigint;
  session_count: bigint;
  total_tokens: bigint;
  total_cost: Prisma.Decimal;
  error_count: bigint;
  total_latency_ms: bigint;
  span_count: bigint;
}

/**
 * TrackedUser Service - Business logic for tracked user operations
 */
export class TrackedUserService {
  /**
   * List tracked users with aggregated stats using optimized query
   * Avoids N+1 by using a single aggregation query for metrics
   */
  static async list(input: ListUsersInput): Promise<{
    items: TrackedUserWithStats[];
    nextCursor: string | undefined;
  }> {
    const { projectId, workspaceId, search, from, to, sortBy, sortOrder, limit, cursor } = input;

    // Verify project belongs to workspace
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
    }

    // Build where clause for users
    const where: Prisma.TrackedUserWhereInput = {
      projectId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { externalId: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(from && { lastSeenAt: { gte: from } }),
      ...(to && { lastSeenAt: { lte: to } }),
    };

    // Fetch users with basic info (no N+1)
    const users = await prisma.trackedUser.findMany({
      where,
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy:
        sortBy === "lastSeenAt" || sortBy === "firstSeenAt"
          ? { [sortBy]: sortOrder }
          : { lastSeenAt: "desc" as const },
      select: {
        id: true,
        projectId: true,
        externalId: true,
        name: true,
        email: true,
        metadata: true,
        firstSeenAt: true,
        lastSeenAt: true,
      },
    });

    const hasMore = users.length > limit;
    const userSlice = users.slice(0, limit);
    const userIds = userSlice.map((u) => u.id);

    if (userIds.length === 0) {
      return { items: [], nextCursor: undefined };
    }

    // Single aggregation query for all metrics (no N+1)
    // Note: Table names use Prisma's @@map values (trace_sessions, tracked_users)
    const metrics = await prisma.$queryRaw<UserMetrics[]>`
      SELECT
        u.id as user_id,
        COUNT(DISTINCT t.id) as trace_count,
        COUNT(DISTINCT ts.id) as session_count,
        COALESCE(SUM(s."totalTokens"), 0) as total_tokens,
        COALESCE(SUM(s."totalCost"), 0) as total_cost,
        COUNT(*) FILTER (WHERE s.level = 'ERROR') as error_count,
        COALESCE(SUM(EXTRACT(EPOCH FROM (s."endTime" - s."startTime")) * 1000), 0) as total_latency_ms,
        COUNT(s.id) FILTER (WHERE s."endTime" IS NOT NULL) as span_count
      FROM "tracked_users" u
      LEFT JOIN "Trace" t ON t."userId" = u.id
      LEFT JOIN "trace_sessions" ts ON ts."userId" = u.id
      LEFT JOIN "Span" s ON s."traceId" = t.id
      WHERE u.id = ANY(${userIds})
      GROUP BY u.id
    `;

    // Create metrics lookup map
    const metricsMap = new Map<string, UserMetrics>();
    for (const m of metrics) {
      metricsMap.set(m.user_id, m);
    }

    // Combine users with metrics
    const usersWithStats: TrackedUserWithStats[] = userSlice.map((user) => {
      const m = metricsMap.get(user.id);
      const traceCount = Number(m?.trace_count ?? 0);
      const sessionCount = Number(m?.session_count ?? 0);
      const totalTokens = Number(m?.total_tokens ?? 0);
      const totalCost = Number(m?.total_cost ?? 0);
      const errorCount = Number(m?.error_count ?? 0);
      const spanCount = Number(m?.span_count ?? 0);
      const totalLatencyMs = Number(m?.total_latency_ms ?? 0);

      return {
        id: user.id,
        projectId: user.projectId,
        externalId: user.externalId,
        name: user.name,
        email: user.email,
        metadata: user.metadata as Record<string, unknown> | null,
        firstSeenAt: user.firstSeenAt,
        lastSeenAt: user.lastSeenAt,
        traceCount,
        sessionCount,
        totalTokens,
        totalCost,
        errorCount,
        errorRate: spanCount > 0 ? (errorCount / spanCount) * 100 : 0,
        avgLatencyMs: spanCount > 0 ? totalLatencyMs / spanCount : null,
      };
    });

    // Re-sort if sorting by computed fields
    if (sortBy === "traceCount" || sortBy === "totalCost") {
      usersWithStats.sort((a, b) => {
        const aVal = sortBy === "traceCount" ? a.traceCount : a.totalCost;
        const bVal = sortBy === "traceCount" ? b.traceCount : b.totalCost;
        return sortOrder === "desc" ? bVal - aVal : aVal - bVal;
      });
    }

    return {
      items: usersWithStats,
      nextCursor: hasMore ? users[limit]?.id : undefined,
    };
  }

  /**
   * Get single user with sessions and aggregated metrics
   */
  static async get(id: string, workspaceId: string) {
    const user = await prisma.trackedUser.findUnique({
      where: { id },
      include: {
        project: { select: { workspaceId: true } },
        sessions: {
          take: 10,
          orderBy: { updatedAt: "desc" },
          include: { _count: { select: { traces: true } } },
        },
        _count: { select: { traces: true, sessions: true } },
      },
    });

    if (!user || user.project.workspaceId !== workspaceId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    // Get aggregated metrics in parallel
    const [metrics, errorCount] = await Promise.all([
      prisma.span.aggregate({
        where: { trace: { userId: user.id } },
        _sum: { totalTokens: true, totalCost: true },
      }),
      prisma.span.count({
        where: { trace: { userId: user.id }, level: SpanLevel.ERROR },
      }),
    ]);

    return {
      ...user,
      totalTokens: metrics._sum.totalTokens ?? 0,
      totalCost: Number(metrics._sum.totalCost ?? 0),
      errorCount,
    };
  }

  /**
   * Get user by external ID
   */
  static async getByExternalId(
    projectId: string,
    externalId: string,
    workspaceId: string
  ) {
    // Verify project belongs to workspace
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
    }

    const user = await prisma.trackedUser.findUnique({
      where: { projectId_externalId: { projectId, externalId } },
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    return user;
  }

  /**
   * Get user's traces (paginated)
   */
  static async getTraces(
    userId: string,
    workspaceId: string,
    limit: number,
    cursor?: string
  ) {
    // Verify user belongs to workspace
    const user = await prisma.trackedUser.findUnique({
      where: { id: userId },
      select: { project: { select: { workspaceId: true } } },
    });

    if (!user || user.project.workspaceId !== workspaceId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    const traces = await prisma.trace.findMany({
      where: { userId },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { timestamp: "desc" },
      include: {
        session: { select: { id: true, externalId: true, name: true } },
        spans: {
          select: {
            id: true,
            name: true,
            level: true,
            totalTokens: true,
            totalCost: true,
          },
        },
      },
    });

    let nextCursor: string | undefined;
    if (traces.length > limit) {
      const next = traces.pop();
      nextCursor = next?.id;
    }

    return { items: traces, nextCursor };
  }

  /**
   * Get user analytics over time (daily breakdown)
   */
  static async getAnalytics(userId: string, workspaceId: string, days: number) {
    // Verify user belongs to workspace
    const user = await prisma.trackedUser.findUnique({
      where: { id: userId },
      select: { project: { select: { workspaceId: true } } },
    });

    if (!user || user.project.workspaceId !== workspaceId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await prisma.$queryRaw<
      Array<{
        date: Date;
        trace_count: bigint;
        total_tokens: bigint;
        total_cost: Prisma.Decimal;
        error_count: bigint;
      }>
    >`
      SELECT
        DATE(t."timestamp") as date,
        COUNT(DISTINCT t."id") as trace_count,
        COALESCE(SUM(s."totalTokens"), 0) as total_tokens,
        COALESCE(SUM(s."totalCost"), 0) as total_cost,
        COUNT(*) FILTER (WHERE s."level" = 'ERROR') as error_count
      FROM "Trace" t
      LEFT JOIN "Span" s ON s."traceId" = t."id"
      WHERE t."userId" = ${userId}
        AND t."timestamp" >= ${startDate}
      GROUP BY DATE(t."timestamp")
      ORDER BY date ASC
    `;

    return result.map((row) => ({
      date: row.date,
      traceCount: Number(row.trace_count),
      totalTokens: Number(row.total_tokens),
      totalCost: Number(row.total_cost),
      errorCount: Number(row.error_count),
    }));
  }

  /**
   * Project-level user summary stats
   */
  static async getSummary(projectId: string, workspaceId: string) {
    // Verify project belongs to workspace
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [totalUsers, activeUsers, newUsers] = await Promise.all([
      prisma.trackedUser.count({ where: { projectId } }),
      prisma.trackedUser.count({
        where: { projectId, lastSeenAt: { gte: sevenDaysAgo } },
      }),
      prisma.trackedUser.count({
        where: { projectId, firstSeenAt: { gte: sevenDaysAgo } },
      }),
    ]);

    // Top users by cost
    const topUsersByCost = await prisma.$queryRaw<
      Array<{
        user_id: string;
        external_id: string;
        name: string | null;
        total_cost: Prisma.Decimal;
      }>
    >`
      SELECT
        u."id" as user_id,
        u."externalId" as external_id,
        u."name",
        COALESCE(SUM(s."totalCost"), 0) as total_cost
      FROM "tracked_users" u
      LEFT JOIN "Trace" t ON t."userId" = u."id"
      LEFT JOIN "Span" s ON s."traceId" = t."id"
      WHERE u."projectId" = ${projectId}
      GROUP BY u."id", u."externalId", u."name"
      ORDER BY total_cost DESC
      LIMIT 5
    `;

    return {
      totalUsers,
      activeUsers,
      newUsers,
      topUsersByCost: topUsersByCost.map((u) => ({
        userId: u.user_id,
        externalId: u.external_id,
        name: u.name,
        totalCost: Number(u.total_cost),
      })),
    };
  }

  /**
   * Update user metadata
   */
  static async update(
    id: string,
    workspaceId: string,
    data: { name?: string; email?: string; metadata?: Record<string, unknown> }
  ) {
    // Verify user belongs to workspace
    const user = await prisma.trackedUser.findUnique({
      where: { id },
      select: { metadata: true, project: { select: { workspaceId: true } } },
    });

    if (!user || user.project.workspaceId !== workspaceId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    // Merge metadata if provided
    const existingMetadata =
      user.metadata && typeof user.metadata === "object" && !Array.isArray(user.metadata)
        ? (user.metadata as Record<string, unknown>)
        : {};
    const mergedMetadata = data.metadata
      ? { ...existingMetadata, ...data.metadata }
      : undefined;

    return prisma.trackedUser.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.email !== undefined && { email: data.email }),
        ...(mergedMetadata !== undefined && {
          metadata: mergedMetadata as Prisma.InputJsonValue,
        }),
      },
    });
  }

  /**
   * Delete tracked user (atomic operation - no race condition)
   */
  static async delete(id: string, workspaceId: string) {
    try {
      // Use atomic delete with workspace check
      await prisma.trackedUser.delete({
        where: {
          id,
          project: { workspaceId },
        },
      });
      return { success: true };
    } catch (e) {
      // P2025 = Record not found
      if ((e as { code?: string }).code === "P2025") {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      throw e;
    }
  }
}
