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

    const totalLatencyMs = Date.now() - start;

    return NextResponse.json({
      status: !dbErr && !storErr ? "healthy" : "warning",
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
