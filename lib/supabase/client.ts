import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) must be configured."
    );
  }

  if (supabaseUrl.includes("placeholder.supabase.co")) {
    throw new Error(
      "Invalid Supabase URL: placeholder.supabase.co is not a valid project URL. Set NEXT_PUBLIC_SUPABASE_URL to your active Supabase project (e.g. https://rmvpdcftfdeizitnrvkw.supabase.co)."
    );
  }

  if (!browserClient) {
    browserClient = createBrowserClient<Database>(supabaseUrl, supabasePublishableKey);
  }

  return browserClient;
}
