"use client";

import { useMemo } from "react";
import { getTimeScaleConfig, WATERFALL } from "./waterfall-constants";

interface TimelineHeaderProps {
  durationMs: number;
}

interface TimeMarker {
  position: number;
  label: string;
}

/**
 * Timeline header with auto-scaled time markers.
 * Positioned above the waterfall rows.
 */
export function TimelineHeader({ durationMs }: TimelineHeaderProps) {
  const markers = useMemo((): TimeMarker[] => {
    const config = getTimeScaleConfig(durationMs);
    const result: TimeMarker[] = [];

    for (let ms = 0; ms <= durationMs; ms += config.interval) {
      result.push({
        position: (ms / durationMs) * 100,
        label: config.format(ms),
      });
    }

    return result;
  }, [durationMs]);

  return (
    <div
      className="relative h-8 border-b bg-muted/30 flex-shrink-0"
      style={{ marginLeft: WATERFALL.NAME_COLUMN_WIDTH }}
    >
      {markers.map((marker, index) => (
        <div
          key={index}
          className="absolute top-0 h-full border-l border-muted-foreground/20"
          style={{ left: `${marker.position}%` }}
        >
          <span className="absolute top-1 left-1 text-xs text-muted-foreground font-mono">
            {marker.label}
          </span>
        </div>
      ))}
    </div>
  );
}
