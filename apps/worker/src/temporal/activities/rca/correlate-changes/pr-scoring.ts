/**
 * PR Scoring
 *
 * Functions for scoring pull requests based on correlation signals.
 */

import { prisma } from "@cognobserve/db";
import {
  MIN_CORRELATION_SCORE,
  MAX_PRS_TO_ANALYZE,
  MAX_SUSPECTED_PRS,
  calculateTemporalScore,
  calculateSemanticScore,
  calculatePathMatchScore,
  calculateCombinedScore,
  CORRELATION_WEIGHTS,
} from "@cognobserve/shared";
import type { CorrelatedPR, RelevantCodeChunk } from "../../../types";

/**
 * Get list of files changed by a PR.
 * Uses CodeChunks as approximation.
 */
export async function getPRChangedFiles(repoId: string): Promise<string[]> {
  const chunks = await prisma.codeChunk.findMany({
    where: { repoId },
    select: { filePath: true },
    distinct: ["filePath"],
  });

  return chunks.map((c) => c.filePath);
}

/**
 * Score PRs based on temporal, semantic, and path signals.
 */
export async function scorePRs(
  repoId: string,
  cutoffDate: Date,
  alertTime: Date,
  relevantChunks: RelevantCodeChunk[],
  stackTracePaths: Set<string>
): Promise<CorrelatedPR[]> {
  // Fetch recently merged PRs
  const prs = await prisma.gitPullRequest.findMany({
    where: {
      repoId,
      mergedAt: { gte: cutoffDate, lte: alertTime },
    },
    orderBy: { mergedAt: "desc" },
    take: MAX_PRS_TO_ANALYZE,
  });

  console.log(`[scorePRs] Analyzing ${prs.length} merged PRs`);

  // Score each PR
  const scored: CorrelatedPR[] = [];

  for (const pr of prs) {
    if (!pr.mergedAt) continue;

    // Get files changed for this PR (using PR's commits)
    // For now, use all repo files as approximation
    // TODO: Track PR → files mapping
    const changedFiles = await getPRChangedFiles(repoId);

    const signals = {
      temporal: calculateTemporalScore(pr.mergedAt, alertTime),
      semantic: calculateSemanticScore(changedFiles, relevantChunks),
      pathMatch: calculatePathMatchScore(changedFiles, stackTracePaths),
    };

    const score = calculateCombinedScore(signals, CORRELATION_WEIGHTS);

    if (score >= MIN_CORRELATION_SCORE) {
      scored.push({
        number: pr.number,
        title: pr.title.slice(0, 200),
        author: pr.author,
        mergedAt: pr.mergedAt.toISOString(),
        score,
        signals,
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, MAX_SUSPECTED_PRS);
}
