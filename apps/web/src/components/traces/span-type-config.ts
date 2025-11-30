import {
  Sparkles,
  FileText,
  Code,
  Globe,
  Database,
  Box,
  type LucideIcon,
} from "lucide-react";
import type { SpanType, SpanLevel } from "@/lib/traces/types";

interface SpanTypeConfig {
  icon: LucideIcon;
  color: string;
  bgColor: string;
  label: string;
}

/**
 * Visual configuration for each span type.
 */
export const SPAN_TYPE_CONFIG: Record<SpanType, SpanTypeConfig> = {
  LLM: {
    icon: Sparkles,
    color: "text-purple-500",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    label: "LLM",
  },
  LOG: {
    icon: FileText,
    color: "text-gray-500",
    bgColor: "bg-gray-100 dark:bg-gray-800",
    label: "Log",
  },
  FUNCTION: {
    icon: Code,
    color: "text-blue-500",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    label: "Function",
  },
  HTTP: {
    icon: Globe,
    color: "text-green-500",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    label: "HTTP",
  },
  DB: {
    icon: Database,
    color: "text-orange-500",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    label: "Database",
  },
  CUSTOM: {
    icon: Box,
    color: "text-slate-500",
    bgColor: "bg-slate-100 dark:bg-slate-800",
    label: "Custom",
  },
};

/**
 * Timeline bar colors based on span level.
 */
export const SPAN_LEVEL_COLORS: Record<SpanLevel, string> = {
  DEBUG: "bg-gray-400 dark:bg-gray-600",
  DEFAULT: "bg-blue-500 dark:bg-blue-600",
  WARNING: "bg-yellow-500 dark:bg-yellow-600",
  ERROR: "bg-red-500 dark:bg-red-600",
};

/**
 * Left border accent for timeline bars.
 */
export const SPAN_LEVEL_BORDER: Record<SpanLevel, string> = {
  DEBUG: "border-l-gray-500",
  DEFAULT: "border-l-blue-600",
  WARNING: "border-l-yellow-600",
  ERROR: "border-l-red-600",
};
