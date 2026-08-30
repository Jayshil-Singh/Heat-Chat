import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "NO_FILE_PROVIDED" }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "INVALID_FILE_TYPE", message: "Only JPEG, PNG, WebP, and GIF images are allowed." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "FILE_TOO_LARGE", message: "Avatar image cannot exceed 5 MB." },
        { status: 400 }
      );
    }

    // Determine extension
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const filePath = `${user.id}/${fileName}`;

    // Convert file to array buffer for upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Fetch existing profile to get old avatar path
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .single();

    // Upload new avatar
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("[Heat Chat] Avatar storage upload error:", uploadError.message);
      return NextResponse.json({ error: "AVATAR_UPLOAD_FAILED" }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(filePath);

    // Update profile
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        avatar_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("[Heat Chat] Profile avatar update error:", updateError.message);
      // Clean up newly uploaded file
      await supabase.storage.from("avatars").remove([filePath]);
      return NextResponse.json({ error: "PROFILE_UPDATE_FAILED" }, { status: 500 });
    }

    // Clean up old avatar if it was in the avatars bucket
    if (currentProfile?.avatar_url && currentProfile.avatar_url.includes("/avatars/")) {
      try {
        const oldPath = currentProfile.avatar_url.split("/avatars/").pop();
        if (oldPath && oldPath.startsWith(`${user.id}/`)) {
          await supabase.storage.from("avatars").remove([oldPath]);
        }
      } catch (cleanupErr) {
        console.warn("[Heat Chat] Failed to clean up old avatar:", cleanupErr);
      }
    }

    return NextResponse.json({
      success: true,
      avatarUrl: publicUrl,
    });
  } catch (err: any) {
    console.error("[Heat Chat] POST /api/profile/avatar error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
