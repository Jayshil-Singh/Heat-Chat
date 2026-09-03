import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testPostgrestQuery() {
  console.log("=== TESTING POSTGREST QUERY FOR SAVED MESSAGES ===");
  const { data, error } = await supabase
    .from("starred_messages")
    .select(`
      id,
      created_at,
      message:messages (
        id,
        conversation_id,
        sender_id,
        content,
        message_type,
        deleted_at,
        created_at,
        edited_at,
        conversation:conversations (
          id,
          type,
          name
        ),
        sender:profiles!messages_sender_id_fkey (
          id,
          display_name,
          username,
          avatar_url
        ),
        attachments (
          id,
          file_name,
          file_type,
          file_size,
          storage_path,
          width,
          height,
          duration_seconds,
          thumbnail_path
        )
      )
    `)
    .limit(0);

  if (error) {
    console.error("PostgREST query error:", error);
  } else {
    console.log("PostgREST query is VALID! No error!");
  }
}

testPostgrestQuery().catch(console.error);
