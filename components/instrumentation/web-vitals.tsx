"use client";

import * as React from "react";
import { useReportWebVitals } from "next/web-vitals";
import { processSafeMetric } from "@/lib/telemetry/web-vitals";

/**
 * WebVitalsMonitor
 * Defensive Web Vitals instrumentation that isolates monitoring from application rendering.
 * Catches and neutralizes malformed metric objects and internal attribution observer crashes.
 */
export function WebVitalsMonitor() {
  // 1. Isolated window error listener to catch internal attribution/PerformanceObserver errors
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const handleWindowError = (event: ErrorEvent) => {
      const msg = String(event?.message || "").toLowerCase();
      const filename = String(event?.filename || "").toLowerCase();

      // Detect and isolate "Cannot read properties of undefined (reading 'startTime')" from Web Vitals
      if (
        msg.includes("starttime") &&
        (msg.includes("cannot read properties of undefined") || msg.includes("is undefined")) &&
        (filename.includes("web-vitals") || filename.includes("next") || !filename)
      ) {
        // Prevent telemetry observer crashes from breaking React or halting execution
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = String(event?.reason?.message || event?.reason || "").toLowerCase();
      if (
        reason.includes("starttime") &&
        (reason.includes("cannot read properties of undefined") || reason.includes("is undefined"))
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener("error", handleWindowError, true);
    window.addEventListener("unhandledrejection", handleUnhandledRejection, true);

    return () => {
      window.removeEventListener("error", handleWindowError, true);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection, true);
    };
  }, []);

  // 2. Next.js Core Web Vitals hook with defensive validation
  useReportWebVitals((metric) => {
    try {
      const safeMetric = processSafeMetric(metric);
      if (!safeMetric) {
        return;
      }

      // Safe debug logging only if explicitly enabled
      if (
        typeof window !== "undefined" &&
        (window as any).__HEAT_CHAT_VITALS_DEBUG__ &&
        process.env.NODE_ENV === "development"
      ) {
        console.debug(`[Web Vitals] ${safeMetric.name}:`, safeMetric.value);
      }
    } catch {
      // Non-blocking catch guard
    }
  });

  return null;
}
