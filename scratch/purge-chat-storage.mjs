import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
let SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_URL=") && !SUPABASE_URL) {
      SUPABASE_URL = trimmed.split("=")[1].trim().replace(/^["']|["']$/g, "");
    } else if (trimmed.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) {
      SUPABASE_KEY = trimmed.split("=")[1].trim().replace(/^["']|["']$/g, "");
    } else if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=") && !SUPABASE_KEY) {
      SUPABASE_KEY = trimmed.split("=")[1].trim().replace(/^["']|["']$/g, "");
    }
  }
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[ERROR] Missing Supabase URL or Key.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

const BUCKET_NAME = "chat-attachments";

async function listAllFilesRecursively(folder = "") {
  let allFiles = [];
  let page = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(folder, {
        limit,
        offset: page * limit,
        sortBy: { column: "name", order: "asc" }
      });

    if (error) {
      // If folder cannot be listed or empty, break
      break;
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const item of data) {
      const fullPath = folder ? `${folder}/${item.name}` : item.name;
      // In Supabase storage, folders have id === null or metadata === null
      if (item.id === null || !item.metadata) {
        const nested = await listAllFilesRecursively(fullPath);
        allFiles = allFiles.concat(nested);
      } else {
        allFiles.push(fullPath);
      }
    }

    if (data.length < limit) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return allFiles;
}

async function purgeChatStorage() {
  console.log("==================================================================");
  console.log(" HEAT CHAT — CHAT-ATTACHMENTS STORAGE PURGE VIA STORAGE API");
  console.log("==================================================================\n");

  console.log(`--- 1. Checking bucket '${BUCKET_NAME}' ---`);
  const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
  
  if (bErr) {
    console.log(`Note: listBuckets() restricted (${bErr.message}). Testing bucket directly.`);
  } else if (buckets) {
    const found = buckets.find(b => b.name === BUCKET_NAME);
    if (found) {
      console.log(`[PASS] Bucket '${BUCKET_NAME}' exists (public = ${found.public})`);
    }
  }

  console.log(`\n--- 2. Recursively enumerating objects in '${BUCKET_NAME}' ---`);
  const filePaths = await listAllFilesRecursively("");
  console.log(`Found ${filePaths.length} object(s) to purge.`);

  if (filePaths.length > 0) {
    console.log(`\n--- 3. Purging ${filePaths.length} object(s) via Storage API ---`);
    // Delete in chunks of 100
    const chunkSize = 100;
    for (let i = 0; i < filePaths.length; i += chunkSize) {
      const chunk = filePaths.slice(i, i + chunkSize);
      const { data: delData, error: delErr } = await supabase.storage
        .from(BUCKET_NAME)
        .remove(chunk);

      if (delErr) {
        console.error(`[ERROR] Failed to delete batch starting at index ${i}:`, delErr.message);
        process.exit(1);
      }
      console.log(`Deleted chunk ${i / chunkSize + 1} (${chunk.length} items).`);
    }
  }

  console.log(`\n--- 4. Verifying zero objects remain in '${BUCKET_NAME}' ---`);
  const remainingFiles = await listAllFilesRecursively("");
  
  if (remainingFiles.length === 0) {
    console.log(`[PASS] Verified 0 objects remain in '${BUCKET_NAME}'.`);
  } else {
    console.error(`[FAIL] Expected 0 objects, but ${remainingFiles.length} object(s) remain.`);
    process.exit(1);
  }

  console.log("\n==================================================================");
  console.log(" SUMMARY: STORAGE PURGE COMPLETED SUCCESSFULLY (0 OBJECTS)");
  console.log("==================================================================\n");
}

purgeChatStorage().catch(err => {
  console.error("[FATAL ERROR]", err.message);
  process.exit(1);
});
