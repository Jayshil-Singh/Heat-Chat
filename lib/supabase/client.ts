import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "Supabase credentials not found in environment. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local"
      );
    }
  }

  // Fallback to avoid crashes during early setup/build if env vars are pending
  const url = supabaseUrl || "https://placeholder.supabase.co";
  const key = supabasePublishableKey || "placeholder-key";

  if (!browserClient) {
    browserClient = createBrowserClient<Database>(url, key);
  }

  return browserClient;
}
