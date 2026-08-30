import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`[PASS] ${message}`);
}

async function runPasswordResetSuite() {
  console.log("==================================================================");
  console.log(" HEAT CHAT — PASSWORD RESET COMPLETE FLOW & SINGLE CARD LAYOUT QA");
  console.log("==================================================================\n");

  // 1. Centralized Site URL Helper Invariants
  console.log("--- 1. Site URL & Callback URL Helper Invariants ---");
  const siteUrlPath = path.join(process.cwd(), "lib", "utils", "site-url.ts");
  assert(fs.existsSync(siteUrlPath), "lib/utils/site-url.ts exists");
  const siteUrlContent = fs.readFileSync(siteUrlPath, "utf-8");
  assert(siteUrlContent.includes("export function getCallbackUrl"), "getCallbackUrl helper exported");
  assert(siteUrlContent.includes("export function getSiteUrl"), "getSiteUrl helper exported");

  // 2. Auth Layout Single-Card & min-h-dvh Invariants
  console.log("\n--- 2. Auth Layout Single-Card & Viewport Invariants ---");
  const layoutPath = path.join(process.cwd(), "app", "(auth)", "layout.tsx");
  assert(fs.existsSync(layoutPath), "app/(auth)/layout.tsx exists");
  const layoutContent = fs.readFileSync(layoutPath, "utf-8");
  assert(layoutContent.includes("min-h-dvh"), "AuthLayout uses min-h-dvh for optimal mobile/desktop viewport handling");
  assert(layoutContent.includes("rounded-3xl border border-zinc-200/80 bg-white"), "AuthLayout renders single primary card container");
  assert(layoutContent.includes("Heat Chat"), "AuthLayout renders top brand header");

  // 3. Request Password Reset Page Invariants
  console.log("\n--- 3. Request Password Reset Page Invariants ---");
  const resetPagePath = path.join(process.cwd(), "app", "(auth)", "reset-password", "page.tsx");
  assert(fs.existsSync(resetPagePath), "app/(auth)/reset-password/page.tsx exists");
  const resetPageContent = fs.readFileSync(resetPagePath, "utf-8");
  assert(resetPageContent.includes("resetPasswordForEmail"), "Calls supabase.auth.resetPasswordForEmail");
  // redirectTo must be plain /auth/callback (no ?next= suffix) so it exactly matches
  // the Supabase Redirect URL allowlist entry — Supabase rejects redirectTo URLs
  // that don't match the allowlist, and may not match when a query string is present.
  // The callback route detects type=recovery and routes to /update-password.
  assert(resetPageContent.includes("getCallbackUrl(\"/auth/callback\")"), "Specifies explicit redirectTo with getCallbackUrl (plain /auth/callback, no query string)");
  assert(!resetPageContent.includes("min-h-screen"), "reset-password page does NOT declare nested min-h-screen");
  assert(!resetPageContent.includes("min-h-dvh"), "reset-password page does NOT declare nested min-h-dvh");
  assert(!resetPageContent.includes("rounded-3xl border"), "reset-password page does NOT declare nested outer card");
  assert(resetPageContent.includes("Check your email"), "Displays check email confirmation screen on success");
  assert(resetPageContent.includes("Back to Login"), "Provides back to login navigation");

  // 4. Auth Callback Route Invariants
  console.log("\n--- 4. Auth Callback Route Invariants ---");
  const callbackPath = path.join(process.cwd(), "app", "auth", "callback", "route.ts");
  assert(fs.existsSync(callbackPath), "app/auth/callback/route.ts exists");
  const callbackContent = fs.readFileSync(callbackPath, "utf-8");
  assert(callbackContent.includes("isPasswordRecovery"), "Callback detects password recovery requests");
  assert(callbackContent.includes("new URL(\"/update-password\", request.url)"), "Redirects password recovery directly to /update-password");
  assert(callbackContent.includes("invalid_or_expired"), "Recovery errors redirect to /update-password?error=invalid_or_expired");
  assert(!callbackContent.includes("if (isPasswordRecovery) await supabase.auth.signOut()"), "Recovery session is preserved (never signed out prematurely)");
  assert(callbackContent.includes("loginUrl.searchParams.set(\"verified\", \"true\")"), "Normal registration OTP confirmation clears session and redirects to /login?verified=true");

  // 5. Update Password Dedicated Page Invariants
  console.log("\n--- 5. Update Password Dedicated Page Invariants ---");
  const updatePagePath = path.join(process.cwd(), "app", "(auth)", "update-password", "page.tsx");
  assert(fs.existsSync(updatePagePath), "app/(auth)/update-password/page.tsx exists");
  const updatePageContent = fs.readFileSync(updatePagePath, "utf-8");
  assert(updatePageContent.includes("updateUser"), "Calls supabase.auth.updateUser");
  assert(updatePageContent.includes("PASSWORD_RECOVERY"), "Listens for PASSWORD_RECOVERY auth event");
  assert(!updatePageContent.includes("min-h-screen"), "update-password page does NOT declare nested min-h-screen");
  assert(!updatePageContent.includes("min-h-dvh"), "update-password page does NOT declare nested min-h-dvh");
  assert(!updatePageContent.includes("rounded-3xl border"), "update-password page does NOT declare nested outer card");
  assert(updatePageContent.includes("Link Invalid or Expired"), "Handles invalid or expired recovery session with friendly guidance");
  assert(updatePageContent.includes("Request New Reset Link"), "Provides request new link action for expired sessions");
  assert(updatePageContent.includes("validatePassword"), "Validates password requirements");
  assert(updatePageContent.includes("validatePasswordConfirm"), "Validates password confirmation matching");
  assert(updatePageContent.includes("showPassword"), "Supports show/hide password toggle");
  assert(updatePageContent.includes("showConfirmPassword"), "Supports show/hide confirm password toggle");
  assert(updatePageContent.includes("router.replace(\"/login?reset=success\")"), "Redirects to /login?reset=success upon successful password update");
  assert(updatePageContent.includes("await supabase.auth.signOut()"), "Clears recovery session on successful update so user signs in cleanly");

  // 6. Login Page Reset Banner Invariants
  console.log("\n--- 6. Login Page Reset Banner Invariants ---");
  const loginPath = path.join(process.cwd(), "app", "(auth)", "login", "page.tsx");
  assert(fs.existsSync(loginPath), "app/(auth)/login/page.tsx exists");
  const loginContent = fs.readFileSync(loginPath, "utf-8");
  assert(loginContent.includes("isResetSuccess"), "Login page checks for reset=success parameter");
  assert(loginContent.includes("Password updated successfully"), "Displays password updated confirmation banner");

  // 7. Admin Forgot Password Invariants
  console.log("\n--- 7. Admin Forgot Password Page Invariants ---");
  const adminForgotPath = path.join(process.cwd(), "app", "admin", "forgot-password", "page.tsx");
  assert(fs.existsSync(adminForgotPath), "app/admin/forgot-password/page.tsx exists");
  const adminForgotContent = fs.readFileSync(adminForgotPath, "utf-8");
  assert(adminForgotContent.includes("getCallbackUrl(\"/auth/callback\")"), "Admin forgot password uses centralized getCallbackUrl (plain /auth/callback)");

  // 8. Password Reset Email Template Invariants
  console.log("\n--- 8. Password Reset Email Template Invariants ---");
  const resetTemplatePath = path.join(process.cwd(), "supabase", "templates", "password-reset.html");
  assert(fs.existsSync(resetTemplatePath), "supabase/templates/password-reset.html exists");
  const resetTemplateContent = fs.readFileSync(resetTemplatePath, "utf-8");
  assert(resetTemplateContent.includes("{{ .ConfirmationURL }}"), "Password reset email template contains {{ .ConfirmationURL }}");
  assert(resetTemplateContent.includes("Reset Password"), "Email has clear Reset Password action");

  // 9. Separation from Normal Email Verification OTP
  console.log("\n--- 9. Separation from Normal Email Verification OTP ---");
  const verifyTemplatePath = path.join(process.cwd(), "supabase", "templates", "email-verification.html");
  assert(fs.existsSync(verifyTemplatePath), "supabase/templates/email-verification.html exists");
  const verifyTemplateContent = fs.readFileSync(verifyTemplatePath, "utf-8");
  assert(verifyTemplateContent.includes("{{ .Token }}"), "Normal registration template strictly uses {{ .Token }}");
  assert(!verifyTemplateContent.includes("{{ .ConfirmationURL }}"), "Normal registration template contains no {{ .ConfirmationURL }}");

  // 10. Zero Secret Leakage Audit
  console.log("\n--- 10. Zero Secret Leakage Audit ---");
  const filesToAudit = [
    "app/(auth)/reset-password/page.tsx",
    "app/(auth)/update-password/page.tsx",
    "app/(auth)/login/page.tsx",
    "app/auth/callback/route.ts",
    "app/admin/forgot-password/page.tsx",
  ];
  for (const rel of filesToAudit) {
    const full = path.join(process.cwd(), rel);
    const content = fs.readFileSync(full, "utf-8");
    assert(!content.includes("SMTP_PASSWORD"), `${rel} does not leak SMTP_PASSWORD`);
    assert(!content.includes("SUPABASE_SERVICE_ROLE_KEY"), `${rel} does not leak service role key`);
  }

  console.log("\n==================================================================");
  console.log(" SUMMARY: PASSWORD RESET FLOW & SINGLE-CARD QA PASSED (100%)");
  console.log("==================================================================\n");
}

runPasswordResetSuite().catch(console.error);
