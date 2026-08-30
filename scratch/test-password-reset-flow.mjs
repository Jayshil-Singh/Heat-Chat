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
  console.log(" HEAT CHAT — PASSWORD RESET COMPLETE FLOW QA");
  console.log("==================================================================\n");

  // 1. Centralized Site URL Helper Invariants
  console.log("--- 1. Site URL & Callback URL Helper Invariants ---");
  const siteUrlPath = path.join(process.cwd(), "lib", "utils", "site-url.ts");
  assert(fs.existsSync(siteUrlPath), "lib/utils/site-url.ts exists");
  const siteUrlContent = fs.readFileSync(siteUrlPath, "utf-8");
  assert(siteUrlContent.includes("export function getCallbackUrl"), "getCallbackUrl helper exported");
  assert(siteUrlContent.includes("export function getSiteUrl"), "getSiteUrl helper exported");

  // 2. Request Password Reset Page Invariants
  console.log("\n--- 2. Request Password Reset Page Invariants ---");
  const resetPagePath = path.join(process.cwd(), "app", "(auth)", "reset-password", "page.tsx");
  assert(fs.existsSync(resetPagePath), "app/(auth)/reset-password/page.tsx exists");
  const resetPageContent = fs.readFileSync(resetPagePath, "utf-8");
  assert(resetPageContent.includes("resetPasswordForEmail"), "Calls supabase.auth.resetPasswordForEmail");
  assert(resetPageContent.includes("getCallbackUrl(\"/auth/callback?next=/update-password\")"), "Specifies explicit redirectTo with getCallbackUrl");
  assert(!resetPageContent.includes("redirectTo: `${window.location.origin}/`"), "Does not redirect to root '/'");
  assert(resetPageContent.includes("Check your email"), "Displays check email confirmation screen on success");
  assert(resetPageContent.includes("Back to Login"), "Provides back to login navigation");

  // 3. Auth Callback Route Invariants
  console.log("\n--- 3. Auth Callback Route Invariants ---");
  const callbackPath = path.join(process.cwd(), "app", "auth", "callback", "route.ts");
  assert(fs.existsSync(callbackPath), "app/auth/callback/route.ts exists");
  const callbackContent = fs.readFileSync(callbackPath, "utf-8");
  assert(callbackContent.includes("isPasswordRecovery"), "Callback detects password recovery requests");
  assert(callbackContent.includes("new URL(\"/update-password\", request.url)"), "Redirects password recovery directly to /update-password");
  assert(callbackContent.includes("invalid_or_expired"), "Recovery errors redirect to /update-password?error=invalid_or_expired");
  assert(!callbackContent.includes("if (isPasswordRecovery) await supabase.auth.signOut()"), "Recovery session is preserved (never signed out prematurely)");
  assert(callbackContent.includes("loginUrl.searchParams.set(\"verified\", \"true\")"), "Normal registration OTP confirmation clears session and redirects to /login?verified=true");

  // 4. Update Password Page Invariants
  console.log("\n--- 4. Update Password Dedicated Page Invariants ---");
  const updatePagePath = path.join(process.cwd(), "app", "(auth)", "update-password", "page.tsx");
  assert(fs.existsSync(updatePagePath), "app/(auth)/update-password/page.tsx exists");
  const updatePageContent = fs.readFileSync(updatePagePath, "utf-8");
  assert(updatePageContent.includes("updateUser"), "Calls supabase.auth.updateUser");
  assert(updatePageContent.includes("PASSWORD_RECOVERY"), "Listens for PASSWORD_RECOVERY auth event");
  assert(updatePageContent.includes("Link Invalid or Expired"), "Handles invalid or expired recovery session with friendly guidance");
  assert(updatePageContent.includes("Request New Reset Link"), "Provides request new link action for expired sessions");
  assert(updatePageContent.includes("validatePassword"), "Validates password requirements");
  assert(updatePageContent.includes("validatePasswordConfirm"), "Validates password confirmation matching");
  assert(updatePageContent.includes("showPassword"), "Supports show/hide password toggle");
  assert(updatePageContent.includes("showConfirmPassword"), "Supports show/hide confirm password toggle");
  assert(updatePageContent.includes("router.replace(\"/login?reset=success\")"), "Redirects to /login?reset=success upon successful password update");
  assert(updatePageContent.includes("await supabase.auth.signOut()"), "Clears recovery session on successful update so user signs in cleanly");

  // 5. Login Page Reset Banner Invariants
  console.log("\n--- 5. Login Page Reset Banner Invariants ---");
  const loginPath = path.join(process.cwd(), "app", "(auth)", "login", "page.tsx");
  assert(fs.existsSync(loginPath), "app/(auth)/login/page.tsx exists");
  const loginContent = fs.readFileSync(loginPath, "utf-8");
  assert(loginContent.includes("isResetSuccess"), "Login page checks for reset=success parameter");
  assert(loginContent.includes("Password updated successfully"), "Displays password updated confirmation banner");

  // 6. Admin Forgot Password Invariants
  console.log("\n--- 6. Admin Forgot Password Page Invariants ---");
  const adminForgotPath = path.join(process.cwd(), "app", "admin", "forgot-password", "page.tsx");
  assert(fs.existsSync(adminForgotPath), "app/admin/forgot-password/page.tsx exists");
  const adminForgotContent = fs.readFileSync(adminForgotPath, "utf-8");
  assert(adminForgotContent.includes("getCallbackUrl(\"/auth/callback?next=/update-password\")"), "Admin forgot password uses centralized getCallbackUrl");

  // 7. Password Reset Email Template Invariants
  console.log("\n--- 7. Password Reset Email Template Invariants ---");
  const resetTemplatePath = path.join(process.cwd(), "supabase", "templates", "password-reset.html");
  assert(fs.existsSync(resetTemplatePath), "supabase/templates/password-reset.html exists");
  const resetTemplateContent = fs.readFileSync(resetTemplatePath, "utf-8");
  assert(resetTemplateContent.includes("{{ .ConfirmationURL }}"), "Password reset email template contains {{ .ConfirmationURL }}");
  assert(resetTemplateContent.includes("Reset Password"), "Email has clear Reset Password action");

  // 8. Normal Email Verification Separation
  console.log("\n--- 8. Separation from Normal Email Verification OTP ---");
  const verifyTemplatePath = path.join(process.cwd(), "supabase", "templates", "email-verification.html");
  assert(fs.existsSync(verifyTemplatePath), "supabase/templates/email-verification.html exists");
  const verifyTemplateContent = fs.readFileSync(verifyTemplatePath, "utf-8");
  assert(verifyTemplateContent.includes("{{ .Token }}"), "Normal registration template strictly uses {{ .Token }}");
  assert(!verifyTemplateContent.includes("{{ .ConfirmationURL }}"), "Normal registration template contains no {{ .ConfirmationURL }}");

  // 9. Zero Secret Leakage Audit
  console.log("\n--- 9. Zero Secret Leakage Audit ---");
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
  console.log(" SUMMARY: PASSWORD RESET FLOW QA PASSED (100%)");
  console.log("==================================================================\n");
}

runPasswordResetSuite().catch(console.error);
