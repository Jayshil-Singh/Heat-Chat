import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    // Call RPC or query admin_user_roles directly
    const { data: isAvailable, error } = await supabase.rpc("admin_is_bootstrap_available");

    if (error) {
      // Fallback query if RPC encounters schema cache issues
      const { data: primaryAdmins } = await supabase
        .from("admin_user_roles")
        .select("id")
        .eq("is_primary_superadmin", true)
        .limit(1);

      const available = !primaryAdmins || primaryAdmins.length === 0;
      return NextResponse.json({ bootstrapAvailable: available });
    }

    return NextResponse.json({ bootstrapAvailable: Boolean(isAvailable) });
  } catch (error) {
    console.error("Error checking bootstrap status:", error);
    return NextResponse.json({ error: "Failed to check setup status" }, { status: 500 });
  }
}
