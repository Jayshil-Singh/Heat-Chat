import { NextResponse } from "next/server";
import { DEFAULT_VAPID_PUBLIC_KEY } from "@/lib/notifications/push";

export async function GET() {
  const key =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    process.env.VAPID_PUBLIC_KEY ||
    DEFAULT_VAPID_PUBLIC_KEY;

  if (!key || typeof key !== "string" || key.trim().length === 0) {
    return NextResponse.json(
      { error: "VAPID public key not configured", code: "VAPID_PUBLIC_KEY_MISSING" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      publicKey: key.trim(),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    }
  );
}
