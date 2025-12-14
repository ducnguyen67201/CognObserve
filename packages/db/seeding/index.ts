#!/usr/bin/env tsx
/**
 * Database Seeding Orchestrator
 *
 * Usage:
 *   pnpm db:seed              # Run all seeds
 *   pnpm db:seed traces       # Run specific seed
 *   pnpm db:seed --list       # List available seeds
 *
 * Add new seeds:
 *   1. Create a new file in this folder (e.g., users.ts)
 *   2. Export an async function (e.g., seedUsers)
 *   3. Register it in SEEDS below
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Load .env from monorepo root BEFORE any other imports
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

// Dynamic imports to ensure env is loaded first
const { prisma } = await import("../src/index.js");
const { seedTraces } = await import("./traces.js");
const { seedModelPricing } = await import("./model-pricing.js");

// Registry of available seeds
const SEEDS: Record<string, { name: string; description: string; fn: () => Promise<void> }> = {
  "model-pricing": {
    name: "model-pricing",
    description: "Default LLM model pricing (OpenAI, Anthropic, Google, Mistral)",
    fn: seedModelPricing,
  },
  traces: {
    name: "traces",
    description: "Full hierarchy: Users → Sessions → Traces → Spans (with LLM calls)",
    fn: seedTraces,
  },
};

function printUsage() {
  console.log("Database Seeding Tool\n");
  console.log("Usage:");
  console.log("  pnpm db:seed              Run all seeds");
  console.log("  pnpm db:seed <name>       Run specific seed");
  console.log("  pnpm db:seed --list       List available seeds");
  console.log("  pnpm db:seed --help       Show this help\n");
}

function listSeeds() {
  console.log("Available seeds:\n");
  for (const [key, seed] of Object.entries(SEEDS)) {
    console.log(`  ${key.padEnd(15)} ${seed.description}`);
  }
  console.log("");
}

async function runSeed(name: string) {
  const seed = SEEDS[name];
  if (!seed) {
    console.error(`Unknown seed: ${name}`);
    console.log(`Run 'pnpm db:seed --list' to see available seeds.`);
    process.exit(1);
  }

  console.log(`\n━━━ Running seed: ${seed.name} ━━━\n`);
  await seed.fn();
}

async function runAllSeeds() {
  console.log("Running all seeds...\n");

  for (const [key, seed] of Object.entries(SEEDS)) {
    console.log(`\n━━━ Running seed: ${seed.name} ━━━\n`);
    await seed.fn();
  }

  console.log("\n✅ All seeds completed!");
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  if (args.includes("--list") || args.includes("-l")) {
    listSeeds();
    process.exit(0);
  }

  try {
    if (args.length === 0) {
      await runAllSeeds();
    } else {
      for (const seedName of args) {
        await runSeed(seedName);
      }
    }
  } catch (error) {
    console.error("\n❌ Seeding failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
