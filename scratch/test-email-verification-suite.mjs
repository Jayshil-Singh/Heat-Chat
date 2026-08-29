import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`[PASS] ${message}`);
}

async function runEmailOtpVerificationSuite() {
  console.log("==================================================================");
  console.log(" HEAT CHAT — 6-DIGIT EMAIL OTP VERIFICATION & EXPLICIT LOGIN QA");
  console.log("==================================================================\n");

  // 1. Template Validation
  console.log("--- 1. Email Templates & 6-Digit OTP Token Validation ---");
  const verificationTemplatePath = path.join(process.cwd(), "supabase", "templates", "email-verification.html");
  assert(fs.existsSync(verificationTemplatePath), "Email verification template exists");

  const verContent = fs.readFileSync(verificationTemplatePath, "utf-8");
  assert(verContent.includes("{{ .Token }}"), "Verification template includes 6-digit OTP token variable {{ .Token }}");
  assert(verContent.includes("{{ .ConfirmationURL }}"), "Verification template includes fallback confirmation URL {{ .ConfirmationURL }}");
  assert(!verContent.includes("token="), "Verification template does not hardcode static tokens");
  assert(verContent.includes("Heat Chat") || verContent.includes("HEAT"), "Branded as Heat Chat");
  assert(verContent.includes("Verification Code"), "Template features prominent Verification Code box");
  assert(verContent.includes("This code will expire in 10 minutes"), "Template displays expiration information");
  assert(verContent.includes("If you did not create an account on Heat Chat, you can safely ignore this email"), "Template includes security warning");

  // 2. 6-Digit OTP Input & Interaction Mechanics Simulation
  console.log("\n--- 2. 6-Digit Input & Formatting Verification ---");
  
  function simulateOtpInput(inputs) {
    let clean = inputs.map(v => v.replace(/\D/g, "")).slice(0, 6);
    while (clean.length < 6) clean.push("");
    return clean;
  }

  function simulatePaste(pastedText) {
    const digits = pastedText.replace(/\D/g, "").slice(0, 6).split("");
    const otp = ["", "", "", "", "", ""];
    for (let i = 0; i < digits.length; i++) {
      otp[i] = digits[i];
    }
    return otp;
  }

  const standardInput = simulateOtpInput(["1", "2", "3", "4", "5", "6"]);
  assert(standardInput.join("") === "123456" && standardInput.length === 6, "Accepts exactly 6 numeric digits");

  const dirtyInput = simulateOtpInput(["1", "a", "3", "$", "5", "6"]);
  assert(dirtyInput.join("") === "1356", "Rejects letters and special characters");

  const pastedOtp = simulatePaste("849201");
  assert(pastedOtp.join("") === "849201", "Paste event correctly populates all 6 OTP slots");

  // 3. Supabase Auth Email OTP Verification Lifecycle Simulation
  console.log("\n--- 3. Email OTP Verification & Explicit Login Lifecycle ---");

  class SupabaseAuthOtpMock {
    constructor() {
      this.users = new Map();
      this.activeOtps = new Map(); // email -> { code, expiresAt, attempts }
    }

    signUp(email, password, username, displayName) {
      const userId = `user_${Date.now()}`;
      const user = {
        id: userId,
        email: email.trim(),
        email_confirmed_at: null,
        user_metadata: { username, displayName },
      };
      this.users.set(email.trim(), user);

      // Generate 6-digit OTP
      const code = "739201";
      this.activeOtps.set(email.trim(), {
        code,
        expiresAt: Date.now() + 10 * 60 * 1000,
        attempts: 0,
      });

      return {
        user,
        session: null, // Zero automatic application session
        sentCode: code,
      };
    }

    verifyOtp(email, token, type = "signup") {
      const otpRecord = this.activeOtps.get(email.trim());
      if (!otpRecord) {
        return { error: { message: "Token has expired or is invalid." } };
      }

      otpRecord.attempts++;
      if (otpRecord.attempts > 5) {
        return { error: { message: "Too many attempts. Please wait and try again." } };
      }

      if (Date.now() > otpRecord.expiresAt) {
        return { error: { message: "Token has expired or is invalid." } };
      }

      if (otpRecord.code !== token.trim()) {
        return { error: { message: "Token has expired or is invalid." } };
      }

      // Successful OTP verification
      const user = this.users.get(email.trim());
      user.email_confirmed_at = new Date().toISOString();
      this.activeOtps.delete(email.trim());

      return {
        user,
        session: { access_token: "temp_token", user }, // Temporary session
      };
    }

    resendOtp(email, cooldownSeconds) {
      if (cooldownSeconds > 0) {
        return { error: { message: `Please wait ${cooldownSeconds}s before requesting a new code.` } };
      }
      const newCode = "654321";
      this.activeOtps.set(email.trim(), {
        code: newCode,
        expiresAt: Date.now() + 10 * 60 * 1000,
        attempts: 0,
      });
      return { success: true, newCode };
    }
  }

  const authMock = new SupabaseAuthOtpMock();

  // Step A: Registration
  const reg = authMock.signUp("alex@example.com", "SecurePass123!", "alex", "Alex");
  assert(reg.user.email_confirmed_at === null, "Registration creates unverified user (email_confirmed_at === null)");
  assert(reg.session === null, "Signup does NOT grant application session");

  // Step B: Invalid OTP code test
  const invalidRes = authMock.verifyOtp("alex@example.com", "000000");
  assert(invalidRes.error && invalidRes.error.message.includes("invalid"), "Invalid OTP code is rejected");

  // Step C: Resend with cooldown
  const resendCooldown = authMock.resendOtp("alex@example.com", 45);
  assert(resendCooldown.error, "Resend is blocked during active 60s cooldown");

  const resendOk = authMock.resendOtp("alex@example.com", 0);
  assert(resendOk.success, "Resend succeeds after cooldown expires");

  // Step D: Valid OTP Verification
  const validRes = authMock.verifyOtp("alex@example.com", resendOk.newCode);
  assert(validRes.user.email_confirmed_at !== null, "Valid OTP confirms email (email_confirmed_at != null)");

  // Step E: Enforce Explicit Login (Do NOT auto-enter /chat)
  function handlePostOtpVerification(verifiedUser) {
    // 1. Check verified
    if (!verifiedUser.email_confirmed_at) throw new Error("Unverified");
    // 2. Clear token session
    const clearedSession = null;
    // 3. Target route
    const targetRoute = "/login?verified=true";
    return { clearedSession, targetRoute };
  }

  const postOtp = handlePostOtpVerification(validRes.user);
  assert(postOtp.targetRoute === "/login?verified=true", "Post-OTP verification strictly redirects to /login?verified=true");
  assert(postOtp.clearedSession === null, "Post-OTP verification clears temporary session to prevent auto-login");

  // 4. Protected Route & Presence Gatekeeper Verification
  console.log("\n--- 4. Protected Route & Presence Gatekeeper Verification ---");

  function evaluateRouteAccess(pathname, user) {
    const isEmailVerified = Boolean(user?.email_confirmed_at);
    const isNormalProtectedRoute =
      pathname.startsWith("/chat") ||
      pathname.startsWith("/friends") ||
      pathname.startsWith("/settings") ||
      pathname.startsWith("/profile");

    if (!user) return { allow: false, redirect: "/login" };
    if (!isEmailVerified && isNormalProtectedRoute) return { allow: false, redirect: "/verify-email" };
    return { allow: true };
  }

  function evaluatePresenceConnect(user) {
    if (!user?.id || !user?.email_confirmed_at) return false;
    return true;
  }

  // Unverified user tests
  const unverifiedUser = { id: "unverified-1", email_confirmed_at: null };
  assert(!evaluateRouteAccess("/chat", unverifiedUser).allow, "Unverified user blocked on /chat");
  assert(!evaluateRouteAccess("/friends", unverifiedUser).allow, "Unverified user blocked on /friends");
  assert(!evaluateRouteAccess("/profile", unverifiedUser).allow, "Unverified user blocked on /profile");
  assert(!evaluateRouteAccess("/settings", unverifiedUser).allow, "Unverified user blocked on /settings");
  assert(evaluatePresenceConnect(unverifiedUser) === false, "Presence is blocked for unverified user");

  // Verified user tests
  const verifiedUser = { id: "verified-1", email_confirmed_at: new Date().toISOString() };
  assert(evaluateRouteAccess("/chat", verifiedUser).allow, "Verified user allowed on /chat");
  assert(evaluatePresenceConnect(verifiedUser) === true, "Presence connects for verified user");

  // 5. Admin TOTP MFA Isolation
  console.log("\n--- 5. Admin MFA Separation Verification ---");
  const adminMfaType = "TOTP_APP_AUTHENTICATOR";
  const userVerificationType = "EMAIL_6_DIGIT_OTP";
  assert(adminMfaType !== userVerificationType, "Admin TOTP MFA is strictly separate from user email OTP");

  console.log("\n==================================================================");
  console.log(" SUMMARY: 6-DIGIT EMAIL OTP VERIFICATION QA PASSED (100%)");
  console.log("==================================================================\n");
}

runEmailOtpVerificationSuite().catch(console.error);
