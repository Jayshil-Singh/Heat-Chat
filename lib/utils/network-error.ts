/**
 * Heat Chat — Network Error Classification Utility
 * Normalizes and categorizes network, database, and RPC failures into user-friendly states.
 * Guarantees zero raw Supabase or PostgREST error leakage to the client UI.
 * Safe during SSR (where window/navigator may be undefined).
 */

export type NetworkErrorType =
  | "NETWORK_OFFLINE"
  | "NETWORK_CONNECTION_CLOSED"
  | "NETWORK_TIMEOUT"
  | "AUTH_EXPIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "UNKNOWN";

export interface ClassifiedNetworkError {
  type: NetworkErrorType;
  message: string;
  isRetryable: boolean;
  status?: number;
  originalError?: unknown;
}

/**
 * Classifies an unknown error into a deterministic error type, safe user-facing message, and retryable flag.
 */
export function classifyNetworkError(error: unknown): ClassifiedNetworkError {
  // 1. SSR-safe check for navigator offline
  if (typeof window !== "undefined" && typeof navigator !== "undefined" && navigator.onLine === false) {
    return {
      type: "NETWORK_OFFLINE",
      message: "You're offline. Changes will sync when you're back online.",
      isRetryable: true,
      originalError: error,
    };
  }

  if (!error) {
    return {
      type: "UNKNOWN",
      message: "An unexpected error occurred. Please try again.",
      isRetryable: true,
    };
  }

  // Extract raw error string or properties
  const errObj = typeof error === "object" ? (error as Record<string, any>) : {};
  const rawMessage = String(errObj.message || errObj.error_description || errObj.details || error || "").toLowerCase();
  const rawCode = String(errObj.code || "").toUpperCase();
  const status = typeof errObj.status === "number" ? errObj.status : undefined;

  // 2. Offline / Failed to fetch detection
  if (
    rawMessage.includes("failed to fetch") ||
    rawMessage.includes("network error") ||
    rawMessage.includes("networkrequestfailed") ||
    rawMessage.includes("offline") ||
    rawCode === "ENOTFOUND" ||
    rawCode === "EAI_AGAIN"
  ) {
    // If navigator says offline or fetch dropped completely
    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    return {
      type: isOffline ? "NETWORK_OFFLINE" : "NETWORK_CONNECTION_CLOSED",
      message: isOffline
        ? "You're offline. Changes will sync when you're back online."
        : "Connection interrupted. Retrying…",
      isRetryable: true,
      status,
      originalError: error,
    };
  }

  // 3. Connection closed / reset detection
  if (
    rawMessage.includes("connection_closed") ||
    rawMessage.includes("err_connection_closed") ||
    rawMessage.includes("err_connection_reset") ||
    rawMessage.includes("connection reset") ||
    rawMessage.includes("socket closed") ||
    rawMessage.includes("connection refused") ||
    rawCode === "ECONNRESET" ||
    rawCode === "ECONNREFUSED"
  ) {
    return {
      type: "NETWORK_CONNECTION_CLOSED",
      message: "Connection interrupted. Retrying…",
      isRetryable: true,
      status,
      originalError: error,
    };
  }

  // 4. Timeout detection
  if (
    rawMessage.includes("timeout") ||
    rawMessage.includes("timed out") ||
    rawMessage.includes("aborterror") ||
    rawCode === "ETIMEDOUT" ||
    status === 504 ||
    status === 408
  ) {
    return {
      type: "NETWORK_TIMEOUT",
      message: "Request timed out. Please check your connection.",
      isRetryable: true,
      status: status || 408,
      originalError: error,
    };
  }

  // 5. Authentication / session expired detection
  // IMPORTANT: P0001 with message "UNAUTHENTICATED" is an explicit auth gate from our
  // SECURITY DEFINER RPCs (discover_people, send_friend_request, etc.).
  // Other P0001 codes are controlled server-side exceptions and must NOT be classified
  // as auth failures — they are server errors (see step 9a below).
  if (
    status === 401 ||
    rawCode === "PGRST301" ||
    rawMessage.includes("jwt expired") ||
    rawMessage.includes("token is expired") ||
    rawMessage.includes("invalid refresh token") ||
    rawMessage.includes("session expired") ||
    // P0001 with explicit UNAUTHENTICATED message from our RPCs
    (rawCode === "P0001" && rawMessage.includes("unauthenticated"))
  ) {
    return {
      type: "AUTH_EXPIRED",
      message: "Your session expired. Please sign in again.",
      isRetryable: false,
      status: 401,
      originalError: error,
    };
  }

  // 6. Permission / Forbidden detection
  if (
    status === 403 ||
    rawCode === "42501" || // Postgres insufficient_privilege
    rawMessage.includes("permission denied") ||
    rawMessage.includes("violates row-level security") ||
    rawMessage.includes("forbidden") ||
    rawMessage.includes("not allowed")
  ) {
    return {
      type: "FORBIDDEN",
      message: "You don't have permission to perform this action.",
      isRetryable: false,
      status: 403,
      originalError: error,
    };
  }

  // 7. Not found detection
  if (
    status === 404 ||
    rawCode === "PGRST116" || // PostgREST: JSON object requested, multiple (or no) rows returned
    rawMessage.includes("not found") ||
    rawMessage.includes("does not exist")
  ) {
    return {
      type: "NOT_FOUND",
      message: "The requested resource could not be found.",
      isRetryable: false,
      status: 404,
      originalError: error,
    };
  }

  // 8. Rate limited detection
  if (
    status === 429 ||
    rawMessage.includes("rate limit") ||
    rawMessage.includes("too many requests") ||
    rawMessage.includes("rate_limit_exceeded")
  ) {
    return {
      type: "RATE_LIMITED",
      message: "Too many requests. Please wait a moment and try again.",
      isRetryable: true,
      status: 429,
      originalError: error,
    };
  }

  // 9a. P0001 — controlled server-side exception (non-auth)
  // Our SECURITY DEFINER RPCs raise P0001 for expected business-logic errors
  // like RATE_LIMIT_EXCEEDED, BLOCKED, TARGET_NOT_DISCOVERABLE, etc.
  // These are transient server errors, not auth failures or unknown crashes.
  if (rawCode === "P0001") {
    return {
      type: "SERVER_ERROR",
      message: "Server is temporarily unavailable. Please try again later.",
      isRetryable: true,
      status: status || 500,
      originalError: error,
    };
  }

  // 9b. Server error detection (5xx and Postgres engine errors)
  if (
    (typeof status === "number" && status >= 500 && status <= 599) ||
    rawCode.startsWith("42") ||
    rawCode.startsWith("XX") ||
    rawCode.startsWith("58") ||
    rawMessage.includes("internal server error") ||
    rawMessage.includes("bad gateway") ||
    rawMessage.includes("service unavailable")
  ) {
    return {
      type: "SERVER_ERROR",
      message: "Server is temporarily unavailable. Please try again later.",
      isRetryable: true,
      status: status || 500,
      originalError: error,
    };
  }

  // 10. Default / Unknown
  return {
    type: "UNKNOWN",
    message: "Something went wrong. Please try again.",
    isRetryable: true,
    status,
    originalError: error,
  };
}
