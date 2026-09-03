import fs from "node:fs";
import path from "node:path";

function findRoutes(dir, list = []) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      findRoutes(full, list);
    } else if (item.name === "route.ts" || item.name === "route.js") {
      list.push(full.replace(/\\/g, "/"));
    }
  }
  return list;
}

const routes = [...findRoutes("app/api"), ...findRoutes("app/auth")].sort();

console.log(`Analyzing ${routes.length} API routes...\n`);

const auditResults = [];

for (const route of routes) {
  const code = fs.readFileSync(route, "utf8");
  const relPath = route.replace(/^(app\/api|app)/, "");

  const methods = [];
  for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
    if (new RegExp(`export\\s+async\\s+function\\s+${m}\\b`).test(code)) {
      methods.push(m);
    }
  }

  const hasAuthCheck = /getUser\(\)|verifyAdmin|requireAdmin|getAdminSession|auth\.uid\(\)/.test(code);
  const hasInputValidation = /isValidUuid|UUID_REGEX|z\.object|typeof\s+\w+\s*!==|JSON\.parse|searchParams\.get|Number\.isInteger|parseInt/.test(code);
  const hasMembershipCheck = /is_conversation_member|conversation_members|isMember|verifyMembership|is_member/.test(code);
  const hasRoleCheck = /role\s*===|role\s*!==|['"]owner['"]|['"]admin['"]|['"]moderator['"]|isSuperAdmin|is_conversation_admin|is_conversation_moderator/.test(code);
  const usesClientUserId = /body\.userId|body\.senderId|body\.authorId/.test(code);
  const hasRlsReliance = /supabase\.(?:from|rpc)/.test(code);
  const hasRateLimiting = /rateLimit|checkRateLimit|THROTTLE/.test(code);
  const isPublicRoute = /login|register|reset-password|callback|invite-links|join|setup\/status/.test(route) && !route.includes("admin/auth/me");

  auditResults.push({
    route: relPath,
    methods: methods.join(", "),
    hasAuthCheck,
    hasInputValidation,
    hasMembershipCheck,
    hasRoleCheck,
    usesClientUserId,
    hasRlsReliance,
    hasRateLimiting,
    isPublicRoute,
  });
}

console.log("=== ROUTES WITH UNVERIFIED CLIENT USER ID ===");
const clientUserRoutes = auditResults.filter(r => r.usesClientUserId);
if (clientUserRoutes.length === 0) {
  console.log("  NONE! All routes derive or verify user identity securely.");
} else {
  for (const r of clientUserRoutes) {
    console.log(`  ALERT: ${r.route} references body.userId/senderId/authorId!`);
  }
}

console.log("\n=== CONVERSATION / GROUP ROUTES WITHOUT MEMBERSHIP CHECK ===");
const convRoutesWithoutMemberCheck = auditResults.filter(r => 
  (r.route.includes("/conversations/") || r.route.includes("/groups/")) && 
  !r.hasMembershipCheck && 
  !r.isPublicRoute &&
  !r.route.includes("/join/")
);
if (convRoutesWithoutMemberCheck.length === 0) {
  console.log("  NONE! All conversation/group routes enforce membership verification.");
} else {
  for (const r of convRoutesWithoutMemberCheck) {
    console.log(`  CHECK: ${r.route} (${r.methods})`);
  }
}

console.log("\n=== NON-ADMIN ROUTES MISSING AUTH CHECK ===");
const unauthRoutes = auditResults.filter(r => !r.hasAuthCheck && !r.isPublicRoute);
if (unauthRoutes.length === 0) {
  console.log("  NONE! All protected routes invoke getUser() or admin verification.");
} else {
  for (const r of unauthRoutes) {
    console.log(`  ALERT: ${r.route} (${r.methods})`);
  }
}
