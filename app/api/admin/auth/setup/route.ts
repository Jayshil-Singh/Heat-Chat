import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, password, userId } = body;

    const supabase = await createClient();

    // 1. Verify bootstrap is still available
    const { data: isAvailable } = await supabase.rpc("admin_is_bootstrap_available");
    if (isAvailable === false) {
      return NextResponse.json(
        {
          error: "BOOTSTRAP_CLOSED",
          message: "Initial administrator setup has already been completed.",
        },
        { status: 409 }
      );
    }

    // 2. If userId is provided, complete activation via RPC
    if (userId) {
      const { data: userAuth, error: authErr } = await supabase.auth.getUser();
      if (authErr || !userAuth.user || userAuth.user.id !== userId) {
        return NextResponse.json(
          { error: "UNAUTHORIZED", message: "Authenticated session does not match target user." },
          { status: 401 }
        );
      }

      if (!userAuth.user.email_confirmed_at) {
        return NextResponse.json(
          { error: "EMAIL_NOT_VERIFIED", message: "Email address must be confirmed before activation." },
          { status: 400 }
        );
      }

      const { data: success, error: rpcErr } = await supabase.rpc("admin_bootstrap_primary_superadmin", {
        p_user_id: userId,
        p_display_name: name || userAuth.user.user_metadata?.display_name || null,
      });

      if (rpcErr || !success) {
        return NextResponse.json(
          { error: "BOOTSTRAP_FAILED", message: rpcErr?.message || "Failed to bootstrap Primary SuperAdmin." },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Primary SuperAdmin activated successfully.",
      });
    }

    // 3. Initial registration step
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "MISSING_FIELDS", message: "Name, email, and password are required." },
        { status: 400 }
      );
    }

    const { data: signUpData, error: signErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          display_name: name.trim(),
          username: email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, ""),
        },
      },
    });

    if (signErr) {
      return NextResponse.json(
        { error: "SIGNUP_FAILED", message: signErr.message },
        { status: 400 }
      );
    }

    const user = signUpData.user;
    const isConfirmed = Boolean(user?.email_confirmed_at);

    // If auto-confirmed (e.g. local dev / test), bootstrap immediately
    if (user && isConfirmed) {
      await supabase.rpc("admin_bootstrap_primary_superadmin", {
        p_user_id: user.id,
        p_display_name: name.trim(),
      });
    }

    return NextResponse.json({
      success: true,
      userId: user?.id,
      email: user?.email,
      isEmailVerified: isConfirmed,
      message: isConfirmed
        ? "SuperAdmin registered and verified."
        : "SuperAdmin registered. Please verify your email to continue setup.",
    });
  } catch (error) {
    console.error("Error in admin setup:", error);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "An unexpected error occurred during administrator setup." },
      { status: 500 }
    );
  }
}
