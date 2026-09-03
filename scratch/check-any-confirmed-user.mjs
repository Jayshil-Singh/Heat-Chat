import { createClient } from "@supabase/supabase-js";

const client = createClient(
  "https://rmvpdcftfdeizitnrvkw.supabase.co",
  "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU",
  { auth: { persistSession: false } }
);

async function test() {
  console.log("Checking admin roles...");
  const { data: roles, error: rolesErr } = await client.from("admin_user_roles").select("*").limit(5);
  console.log("admin_user_roles:", roles, rolesErr?.message);

  console.log("Checking system settings...");
  const { data: settings, error: setErr } = await client.from("system_settings").select("*").limit(5);
  console.log("system_settings:", settings, setErr?.message);
}

test();
