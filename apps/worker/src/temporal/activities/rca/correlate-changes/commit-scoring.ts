/**
 * Commit Scoring
 *
 * Functions for scoring commits based on correlation signals.
 */

import { prisma } from "@cognobserve/db";
import {
  MIN_CORRELATION_SCORE,
  MAX_COMMITS_TO_ANALYZE,
  MAX_SUSPECTED_COMMITS,
  calculateTemporalScore,
  calculateSemanticScore,
  calculatePathMatchScore,
  calculateCombinedScore,
  CORRELATION_WEIGHTS,
} from "@cognobserve/shared";
import type { CorrelatedCommit, RelevantCodeChunk } from "../../../types";

/**
 * Get list of files changed by a commit.
 * Uses CodeChunks to determine which files were indexed.
 *
 * Note: This is an approximation. In a full implementation,
 * we would store the actual files changed per commit (commitSha → files mapping).
 */
export async function getCommitChangedFiles(repoId: string): Promise<string[]> {
  // Query distinct file paths from code chunks for this repo
  // TODO: Implement commit → files mapping for accurate results
  const chunks = await prisma.codeChunk.findMany({
    where: { repoId },
    select: { filePath: true },
    distinct: ["filePath"],
  });

  return chunks.map((c) => c.filePath);
}

/**
 * Score commits based on temporal, semantic, and path signals.
 */
export async function scoreCommits(
  repoId: string,
  cutoffDate: Date,
  alertTime: Date,
  relevantChunks: RelevantCodeChunk[],
  stackTracePaths: Set<string>
): Promise<CorrelatedCommit[]> {
  // Fetch recent commits
  const commits = await prisma.gitCommit.findMany({
    where: {
      repoId,
      timestamp: { gte: cutoffDate, lte: alertTime },
    },
    orderBy: { timestamp: "desc" },
    take: MAX_COMMITS_TO_ANALYZE,
  });

  console.log(`[scoreCommits] Analyzing ${commits.length} commits`);

  // Score each commit
  const scored: CorrelatedCommit[] = [];

  for (const commit of commits) {
    // Get files changed for this commit from CodeChunks
    const changedFiles = await getCommitChangedFiles(repoId);

    const signals = {
      temporal: calculateTemporalScore(commit.timestamp, alertTime),
      semantic: calculateSemanticScore(changedFiles, relevantChunks),
      pathMatch: calculatePathMatchScore(changedFiles, stackTracePaths),
    };

    const score = calculateCombinedScore(signals, CORRELATION_WEIGHTS);

    // Only include if above threshold
    if (score >= MIN_CORRELATION_SCORE) {
      scored.push({
        sha: commit.sha,
        message: commit.message.slice(0, 200),
        author: commit.author,
        authorEmail: commit.authorEmail,
        timestamp: commit.timestamp.toISOString(),
        score,
        signals,
        filesChanged: changedFiles.slice(0, 10), // Limit files in output
      });
    }
  }

  // Sort by score descending and take top N
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUSPECTED_COMMITS);
}
