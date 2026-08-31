/**
 * Heat Chat — Pointer Events, Overlay Detection & UI Interaction Test Suite
 */

import fs from "node:fs";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

console.log("==================================================================");
console.log(" Heat Chat — UI Interaction & Pointer-Event Overlay Audit");
console.log("==================================================================\n");

// ── 1. Dialog & Modal Unmounting Guard Audit ───────────────────────────────────
console.log("--- 1. Dialog & Modal Unmounting Guard Audit ---");
const modalFiles = [
  { file: "components/ui/dialog.tsx", guard: "if (!isOpen) return null" },
  { file: "components/search/command-palette.tsx", guard: "if (!isOpen) return null" },
  { file: "components/search/search-dialog.tsx", guard: "<Dialog isOpen={isOpen}" },
  { file: "components/chat/create-group-dialog.tsx", guard: "if (!isOpen) return null" },
  { file: "components/chat/starred-messages-dialog.tsx", guard: "if (!isOpen) return null" },
  { file: "components/chat/group-details-dialog.tsx", guard: "if (!isOpen) return null" },
  { file: "components/chat/media-gallery-dialog.tsx", guard: "if (!isOpen) return null" },
  { file: "components/chat/image-viewer.tsx", guard: "if (!isOpen || !currentAttachment) return null" },
  { file: "components/messages/message-forward-dialog.tsx", guard: "<Dialog\n      isOpen={isOpen}" },
  { file: "components/reports/report-dialog.tsx", guard: "<Dialog" },
  { file: "components/profile/user-profile-dialog.tsx", guard: "<Dialog" },
];

for (const { file, guard } of modalFiles) {
  assert(fs.existsSync(file), `File ${file} exists`);
  const content = fs.readFileSync(file, "utf-8");
  assert(
    content.includes(guard) || content.includes(guard.replace(/\n\s*/g, " ")),
    `${file} contains conditional unmount guard (${guard})`
  );
}

// ── 2. Notification Center & Toast Overlay Audit ──────────────────────────────
console.log("\n--- 2. Notification Center & Toast Overlay Audit ---");
const notifCenterContent = fs.readFileSync("components/notifications/notification-center.tsx", "utf-8");
assert(
  notifCenterContent.includes("const popoverContent = isOpen && coords && ("),
  "NotificationCenter popover only renders into DOM when isOpen && coords are truthy"
);

const toastContent = fs.readFileSync("components/notifications/notification-toast.tsx", "utf-8");
assert(
  toastContent.includes("if (toasts.length === 0) return null"),
  "NotificationToast unmounts completely when toasts array is empty"
);
assert(
  toastContent.includes("pointer-events-none") && toastContent.includes("pointer-events-auto"),
  "NotificationToast container is pointer-events-none while individual toasts are pointer-events-auto"
);

// ── 3. Global CSS Pointer Events Audit ─────────────────────────────────────────
console.log("\n--- 3. Global CSS & Body Styling Audit ---");
const globalsCss = fs.readFileSync("app/globals.css", "utf-8");
assert(
  !globalsCss.includes("pointer-events: none") && !globalsCss.includes("pointer-events:none"),
  "app/globals.css has NO global pointer-events: none"
);

// ── 4. App Shell & Layout Hierarchy Audit ──────────────────────────────────────
console.log("\n--- 4. App Shell & Layout Hierarchy Audit ---");
const appShellContent = fs.readFileSync("components/layout/app-shell.tsx", "utf-8");
assert(
  !appShellContent.includes("fixed inset-0 z-50 bg-") && !appShellContent.includes("fixed inset-0 bg-"),
  "AppShell has NO permanent blocking backdrop overlay"
);
assert(
  appShellContent.includes("<SidebarNav"),
  "AppShell renders SidebarNav on desktop"
);
assert(
  appShellContent.includes("<MobileTabBar"),
  "AppShell renders MobileTabBar on mobile"
);

// ── 5. Production Domain Route Tests ──────────────────────────────────────────
console.log("\n--- 5. Production Domain Live Route Tests ---");
const PROD_URL = "https://heat-chat-beta.vercel.app";

try {
  const [loginRes, manifestRes] = await Promise.all([
    fetch(`${PROD_URL}/login`),
    fetch(`${PROD_URL}/manifest.json`),
  ]);

  assert(loginRes.status === 200, `Production /login returns HTTP 200 (status: ${loginRes.status})`);
  assert(manifestRes.status === 200, `Production /manifest.json returns HTTP 200 (status: ${manifestRes.status})`);
} catch (err) {
  assert(false, `Network test failed: ${err.message}`);
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log("\n==================================================================");
console.log(` Results: ${passed} Passed, ${failed} Failed`);
console.log("==================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("🎉 ALL POINTER-EVENT & UI INTERACTION TESTS PASSED!\n");
}
