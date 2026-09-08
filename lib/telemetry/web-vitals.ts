/**
 * Heat Chat — Web Vitals & Performance Telemetry Hardening
 * Defensive validation for Core Web Vitals to completely isolate telemetry from UI rendering.
 * Strictly prevents `TypeError: Cannot read properties of undefined (reading 'startTime')`.
 */

export interface SafeMetric {
  id: string;
  name: string;
  value: number;
  startTime: number;
  rating?: "good" | "needs-improvement" | "poor";
  delta?: number;
  entries?: PerformanceEntry[];
  navigationType?: string;
  attribution?: Record<string, unknown>;
}

/**
 * Validates whether a metric object has the required fields and valid numeric startTime.
 * Returns false for malformed, undefined, or partial metric entries.
 */
export function validateMetric(metric: unknown): metric is SafeMetric {
  if (!metric || typeof metric !== "object") {
    return false;
  }

  // Critical validation: typeof metric?.startTime === "number"
  if (typeof (metric as any)?.startTime !== "number" || Number.isNaN((metric as any).startTime)) {
    return false;
  }

  const m = metric as Record<string, unknown>;

  if (typeof m.name !== "string" || !m.name) {
    return false;
  }

  if (typeof m.value !== "number" || Number.isNaN(m.value)) {
    return false;
  }

  if (typeof m.startTime !== "number" || Number.isNaN(m.startTime)) {
    return false;
  }

  if (typeof m.id !== "string" || !m.id) {
    return false;
  }

  return true;
}

/**
 * Safely processes a web vitals metric with full defensive isolation.
 * Guarantees zero unhandled exceptions or UI disruption.
 */
export function processSafeMetric(metric: unknown): SafeMetric | null {
  try {
    if (!validateMetric(metric)) {
      return null;
    }

    // Sanitize entries if present
    const entries = Array.isArray(metric.entries)
      ? metric.entries.filter((e) => e && typeof e === "object" && typeof (e as any).startTime === "number")
      : [];

    return {
      id: metric.id,
      name: metric.name,
      value: metric.value,
      startTime: metric.startTime,
      rating: metric.rating,
      delta: metric.delta,
      entries,
      navigationType: metric.navigationType,
      attribution: metric.attribution && typeof metric.attribution === "object" ? metric.attribution : undefined,
    };
  } catch {
    // Suppress telemetry processing failure completely
    return null;
  }
}
