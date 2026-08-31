import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

/**
 * Returns the validated Supabase URL and public key.
 * Throws a clear, actionable error only when both conditions are true:
 *  1. We're running in the browser (window is defined) — server-side prerendering
 *     of static pages (/_not-found, etc.) does NOT need the browser client.
 *  2. The required environment variables are absent or invalid.
 *
 * This prevents Vercel prerender failures for pages that don't use Supabase auth
 * while still failing loudly in the browser when misconfigured.
 */
function getSupabaseConfig(): { url: string; key: string } | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // During SSR/prerender: env vars are baked in via .env.production.
  // If they're missing here it means the Vercel project dashboard also lacks them.
  // Log a clear server-side warning rather than throwing (which breaks SSR builds).
  if (!supabaseUrl || !supabaseKey) {
    if (typeof window === "undefined") {
      // Server context — log and return null so the module can be imported safely.
      // Pages that actually call Supabase APIs will fail at the API layer, not at import.
      console.error(
        "[Heat Chat] CONFIGURATION ERROR: NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) " +
        "must be set in Vercel project environment variables or .env.production. " +
        "Supabase client will NOT function until these are configured."
      );
      return null;
    }
    // Browser context — throw so the developer sees the error immediately.
    throw new Error(
      "[Heat Chat] Missing Supabase environment variables: " +
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
      "(or NEXT_PUBLIC_SUPABASE_ANON_KEY) must be configured in your Vercel project."
    );
  }

  if (supabaseUrl.includes("placeholder.supabase.co")) {
    const msg =
      "[Heat Chat] Invalid Supabase URL: placeholder.supabase.co is not a real project. " +
      "Set NEXT_PUBLIC_SUPABASE_URL=https://rmvpdcftfdeizitnrvkw.supabase.co in Vercel.";
    if (typeof window === "undefined") {
      console.error(msg);
      return null;
    }
    throw new Error(msg);
  }

  return { url: supabaseUrl, key: supabaseKey };
}

export function createClient() {
  const config = getSupabaseConfig();

  if (!config) {
    // SSR context with missing config — return a stub that throws on first use.
    // This keeps static prerendering alive while making misconfiguration obvious
    // the moment any code actually attempts a Supabase API call at runtime.
    return new Proxy({} as ReturnType<typeof createBrowserClient<Database>>, {
      get(_target, prop) {
        if (prop === "then") return undefined; // not a Promise
        throw new Error(
          `[Heat Chat] Supabase client is not configured. ` +
          `NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set ` +
          `in your Vercel project environment variables. ` +
          `Attempted to access: supabase.${String(prop)}`
        );
      },
    });
  }

  if (!browserClient) {
    browserClient = createBrowserClient<Database>(config.url, config.key);
  }

  return browserClient;
}
