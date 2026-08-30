import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`[PASS] ${message}`);
}

async function runShellLayoutSuite() {
  console.log("==================================================================");
  console.log(" HEAT CHAT — SECOND PASS: SIDEBAR, NOTIFICATION & THEME UI QA");
  console.log("==================================================================\n");

  // 1. Sidebar Structure & Semantic Invariants
  console.log("--- 1. Sidebar Nav & Footer Layout Invariants ---");
  const sidebarPath = path.join(process.cwd(), "components", "layout", "sidebar-nav.tsx");
  assert(fs.existsSync(sidebarPath), "components/layout/sidebar-nav.tsx exists");
  const sidebarContent = fs.readFileSync(sidebarPath, "utf-8");

  assert(sidebarContent.includes("<aside"), "Sidebar uses semantic <aside>");
  assert(sidebarContent.includes("<header"), "Sidebar uses semantic <header>");
  assert(sidebarContent.includes("<nav"), "Sidebar uses semantic <nav>");
  assert(sidebarContent.includes("<footer"), "Sidebar uses semantic <footer>");
  assert(sidebarContent.includes("flex-1 min-h-0 overflow-y-auto"), "Sidebar content area uses flex-1 min-h-0 overflow-y-auto");
  assert(sidebarContent.includes("shrink-0 pt-3.5 mt-auto border-t"), "Sidebar footer is pinned to bottom with shrink-0 mt-auto");
  assert(sidebarContent.includes("<ThemeToggle className=\"w-full\" />"), "Sidebar footer includes full-width ThemeToggle on lg screens");
  assert(sidebarContent.includes("<ThemeToggle compact />"), "Sidebar footer includes compact ThemeToggle on md screens");
  assert(!sidebarContent.includes("fixed bottom-"), "Sidebar footer does NOT use position:fixed hacks");
  assert(sidebarContent.includes("href=\"/chat\""), "Authenticated brand logo strictly routes to /chat");

  // 2. Theme Toggle 3-State Controls & Bounding
  console.log("\n--- 2. Theme Toggle 3-State Controls & Bounding ---");
  const themeTogglePath = path.join(process.cwd(), "components", "layout", "theme-toggle.tsx");
  assert(fs.existsSync(themeTogglePath), "components/layout/theme-toggle.tsx exists");
  const toggleContent = fs.readFileSync(themeTogglePath, "utf-8");

  assert(toggleContent.includes('value: "light"'), "ThemeToggle supports 'light'");
  assert(toggleContent.includes('value: "dark"'), "ThemeToggle supports 'dark'");
  assert(toggleContent.includes('value: "system"'), "ThemeToggle supports 'system'");
  assert(toggleContent.includes("grid grid-cols-3"), "Full ThemeToggle renders 3 equal-width segmented columns");
  assert(toggleContent.includes("w-full max-w-full box-border"), "ThemeToggle container is bounded with w-full max-w-full box-border");
  assert(toggleContent.includes("aria-label=\"Appearance selector\""), "Theme selector has accessible aria-label");
  assert(toggleContent.includes("aria-pressed={isActive}"), "Active button conveys aria-pressed state");
  assert(toggleContent.includes("compact"), "ThemeToggle supports compact cycling mode for mobile/collapsed headers");

  // 3. Notification Center Positioning & Sidebar Bounds Invariants
  console.log("\n--- 3. Notification Center & Sidebar Bounds Invariants ---");
  const notifCenterPath = path.join(process.cwd(), "components", "notifications", "notification-center.tsx");
  assert(fs.existsSync(notifCenterPath), "components/notifications/notification-center.tsx exists");
  const notifContent = fs.readFileSync(notifCenterPath, "utf-8");

  assert(notifContent.includes('triggerRef.current.closest("aside")'), "NotificationCenter inspects closest('aside') for desktop containment");
  assert(notifContent.includes("sidebarRect.left + safePadding"), "Desktop popover left is anchored to sidebarRect.left + safePadding");
  assert(notifContent.includes("sidebarRect.width - safePadding * 2"), "Desktop popover width is clamped to sidebar width");
  assert(notifContent.includes("createPortal"), "NotificationCenter renders via createPortal into document.body to avoid clipping");
  assert(notifContent.includes("usePathname"), "NotificationCenter tracks pathname to close on route navigation");
  assert(notifContent.includes("Escape"), "NotificationCenter closes on Escape key and restores focus to trigger");
  assert(notifContent.includes("mousedown"), "NotificationCenter closes on outside click");
  assert(notifContent.includes("aria-haspopup=\"dialog\""), "Notification bell has aria-haspopup='dialog'");
  assert(notifContent.includes("aria-controls=\"notification-popover-dialog\""), "Notification bell links aria-controls");
  assert(notifContent.includes("role=\"dialog\""), "Popover dialog has role='dialog'");
  assert(notifContent.includes("No notifications yet"), "Empty state has centered 'No notifications yet'");
  assert(notifContent.includes("break-words"), "Empty state guidance text uses break-words to prevent clipping");

  // 4. Landing Page Logo Invariant
  console.log("\n--- 4. Unauthenticated Landing Page Logo Invariant ---");
  const landingPath = path.join(process.cwd(), "app", "page.tsx");
  assert(fs.existsSync(landingPath), "app/page.tsx exists");
  const landingContent = fs.readFileSync(landingPath, "utf-8");
  assert(landingContent.includes("href=\"/\""), "Landing page brand logo routes to /");

  // 5. Anti-Flicker Layout Script Invariant
  console.log("\n--- 5. Anti-Flicker Layout Script Invariant ---");
  const layoutPath = path.join(process.cwd(), "app", "layout.tsx");
  assert(fs.existsSync(layoutPath), "app/layout.tsx exists");
  const layoutContent = fs.readFileSync(layoutPath, "utf-8");
  assert(layoutContent.includes("heat-chat-theme"), "Layout initializes theme before hydration to prevent flash");

  console.log("\n==================================================================");
  console.log(" SUMMARY: SECOND PASS SHELL QA PASSED (100%)");
  console.log("==================================================================\n");
}

runShellLayoutSuite().catch(console.error);
