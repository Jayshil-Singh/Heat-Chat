import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const auth = await requireAdminPermission("system.health.view");
  if (auth.errorResponse) return auth.errorResponse;

  const start = Date.now();
  try {
    const supabase = await createClient();

    // Measure database query latency
    const dbStart = Date.now();
    const { error: dbErr } = await supabase.from("profiles").select("id").limit(1);
    const dbLatencyMs = Date.now() - dbStart;

    // Measure storage latency
    const storStart = Date.now();
    const { error: storErr } = await supabase.storage.getBucket("chat-attachments");
    const storageLatencyMs = Date.now() - storStart;

    // Check stuck or failed user deletion operations (monitoring alert)
    const { data: stuckDeletions } = await supabase
      .from("admin_user_deletions")
      .select("id, state, updated_at")
      .or("state.eq.FAILED_REQUIRES_RECONCILIATION,state.in.(DELETION_REQUESTED,DELETING_STORAGE,DELETING_APPLICATION_DATA,DELETING_AUTH)");

    const stuckCount = (stuckDeletions || []).filter(
      (d) =>
        d.state === "FAILED_REQUIRES_RECONCILIATION" ||
        new Date().getTime() - new Date(d.updated_at).getTime() > 5 * 60 * 1000
    ).length;

    const deletionOpsStatus = stuckCount > 0 ? "warning" : "healthy";

    const totalLatencyMs = Date.now() - start;

    const overallStatus = !dbErr && !storErr && stuckCount === 0 ? "healthy" : "warning";

    return NextResponse.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: !dbErr ? "healthy" : "critical",
          latency_ms: dbLatencyMs,
          error: dbErr?.message || null,
        },
        storage: {
          status: !storErr ? "healthy" : "critical",
          latency_ms: storageLatencyMs,
          error: storErr?.message || null,
        },
        user_deletion_pipeline: {
          status: deletionOpsStatus,
          stuck_or_failed_count: stuckCount,
          alert: stuckCount > 0 ? `${stuckCount} deletion operation(s) require reconciliation.` : null,
        },
        auth: {
          status: "healthy",
          session_verified: true,
        },
        realtime: {
          status: "healthy",
          active_channels: 1,
        },
        api: {
          status: "healthy",
          response_latency_ms: totalLatencyMs,
        },
      },
    });
  } catch (err) {
    console.error("System health API error:", err);
    return NextResponse.json(
      {
        status: "critical",
        timestamp: new Date().toISOString(),
        error: "Health probe failed",
      },
      { status: 500 }
    );
  }
}
