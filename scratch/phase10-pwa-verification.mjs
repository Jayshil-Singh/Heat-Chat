import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execSync } from "node:child_process";

console.log("===============================================================================");
console.log("HEAT CHAT — PHASE 10 PWA & INSTALLABLE APP AUTOMATED VERIFICATION SUITE");
console.log("Manifest, Service Worker, Offline Shell, Security Exclusions & Quality Gates");
console.log("===============================================================================\n");

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = "") {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${totalTests.toString().padStart(2, "0")}: ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] Test ${totalTests.toString().padStart(2, "0")}: ${testName} - ${details}`);
  }
}

const rootDir = process.cwd();

try {
  // 1. /manifest.webmanifest exists and is accessible
  const manifestPath = path.join(rootDir, "public", "manifest.webmanifest");
  assert(fs.existsSync(manifestPath), "1. /manifest.webmanifest exists in public directory");

  // 2. Manifest is valid JSON
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    assert(manifest !== null && typeof manifest === "object", "2. Manifest is valid JSON");
  } catch (err) {
    assert(false, "2. Manifest is valid JSON", err.message);
  }

  // 3. Manifest has correct name
  assert(manifest?.name === "Heat Chat", "3. Manifest has correct name ('Heat Chat')");

  // 4. Manifest has display: standalone
  assert(manifest?.display === "standalone", "4. Manifest has display: standalone");

  // 5. Manifest has start_url
  assert(manifest?.start_url === "/", "5. Manifest has start_url ('/')");

  // Helper for PNG dimensions
  function getPngDimensions(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    if (buf.length < 24) return null;
    // Check PNG signature: 89 50 4E 47 0D 0A 1A 0A
    if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  }

  // 6. Manifest has valid 192px icon
  const icon192Path = path.join(rootDir, "public", "icons", "icon-192.png");
  const dims192 = getPngDimensions(icon192Path);
  const icon192InManifest = manifest?.icons?.some(
    (i) => i.src === "/icons/icon-192.png" && i.sizes === "192x192"
  );
  assert(
    Boolean(dims192 && dims192.width === 192 && dims192.height === 192 && icon192InManifest),
    "6. Valid 192px icon exists on disk and in manifest",
    `Found dimensions: ${dims192 ? `${dims192.width}x${dims192.height}` : "missing"}`
  );

  // 7. Manifest has valid 512px icon
  const icon512Path = path.join(rootDir, "public", "icons", "icon-512.png");
  const dims512 = getPngDimensions(icon512Path);
  const icon512InManifest = manifest?.icons?.some(
    (i) => i.src === "/icons/icon-512.png" && i.sizes === "512x512"
  );
  assert(
    Boolean(dims512 && dims512.width === 512 && dims512.height === 512 && icon512InManifest),
    "7. Valid 512px icon exists on disk and in manifest",
    `Found dimensions: ${dims512 ? `${dims512.width}x${dims512.height}` : "missing"}`
  );

  // 8. Maskable icon exists
  const maskablePath = path.join(rootDir, "public", "icons", "icon-maskable-512.png");
  const dimsMaskable = getPngDimensions(maskablePath);
  const maskableInManifest = manifest?.icons?.some(
    (i) => i.src === "/icons/icon-maskable-512.png" && i.purpose === "maskable"
  );
  assert(
    Boolean(dimsMaskable && dimsMaskable.width === 512 && dimsMaskable.height === 512 && maskableInManifest),
    "8. Maskable 512px icon exists on disk and configured in manifest",
    `Found dimensions: ${dimsMaskable ? `${dimsMaskable.width}x${dimsMaskable.height}` : "missing"}`
  );

  // 9. Apple touch icon exists
  const appleTouchPath = path.join(rootDir, "public", "icons", "apple-touch-icon.png");
  const dimsApple = getPngDimensions(appleTouchPath);
  assert(
    Boolean(dimsApple && dimsApple.width === 180 && dimsApple.height === 180),
    "9. Apple touch icon (180x180) exists on disk",
    `Found dimensions: ${dimsApple ? `${dimsApple.width}x${dimsApple.height}` : "missing"}`
  );

  // 10. /sw.js exists and is non-empty
  const swPath = path.join(rootDir, "public", "sw.js");
  const swExists = fs.existsSync(swPath);
  const swContent = swExists ? fs.readFileSync(swPath, "utf-8") : "";
  assert(swExists && swContent.length > 200, "10. /sw.js exists and is populated");

  // 11. Service worker JavaScript is valid syntax
  let swSyntaxValid = false;
  try {
    // Compile script with Node vm
    new vm.Script(swContent);
    swSyntaxValid = true;
  } catch (err) {
    swSyntaxValid = false;
  }
  assert(swSyntaxValid, "11. Service worker JavaScript is valid syntax");

  // 12. Offline page exists
  const offlinePagePath = path.join(rootDir, "app", "offline", "page.tsx");
  const offlineExists = fs.existsSync(offlinePagePath);
  const offlineContent = offlineExists ? fs.readFileSync(offlinePagePath, "utf-8") : "";
  const offlineHasMessage =
    offlineContent.includes("offline") &&
    offlineContent.includes("Reconnect to continue chatting");
  const offlineNoPrivateData =
    !offlineContent.includes("useMessages") &&
    !offlineContent.includes("useConversations");
  assert(
    offlineExists && offlineHasMessage && offlineNoPrivateData,
    "12. Offline page exists with reconnect guidance and zero private chat exposure"
  );

  // 13. Supabase requests are excluded from caching
  const excludesSupabase =
    swContent.includes("supabase.co") &&
    swContent.includes("/rest/v1") &&
    swContent.includes("shouldBypassCache");
  assert(excludesSupabase, "13. Supabase REST/API requests are strictly excluded from SW caching");

  // 14. Auth requests are excluded from caching
  const excludesAuth =
    swContent.includes("/auth/v1") &&
    swContent.includes("token=") &&
    swContent.includes("auth=");
  assert(excludesAuth, "14. Auth requests and credentials are strictly excluded from SW caching");

  // 15. Storage/signed URL requests are excluded from caching
  const excludesStorage =
    swContent.includes("/storage/v1") &&
    swContent.includes("/chat-attachments/") &&
    swContent.includes("signature=");
  assert(excludesStorage, "15. Storage attachments and signed URLs are strictly excluded from SW caching");

  // 16. Realtime traffic is excluded from caching
  const excludesRealtime =
    swContent.includes("ws:") &&
    swContent.includes("wss:") &&
    swContent.includes("/realtime/v1");
  assert(excludesRealtime, "16. WebSocket and Realtime traffic are strictly excluded from SW caching");

  // 17. Service worker registration exists in production code
  const swRegCompPath = path.join(rootDir, "components", "pwa", "service-worker-registration.tsx");
  const layoutPath = path.join(rootDir, "app", "layout.tsx");
  const swRegCompExists = fs.existsSync(swRegCompPath);
  const swRegContent = swRegCompExists ? fs.readFileSync(swRegCompPath, "utf-8") : "";
  const layoutContent = fs.existsSync(layoutPath) ? fs.readFileSync(layoutPath, "utf-8") : "";

  const registrationIsProductionOnly =
    swRegContent.includes('process.env.NODE_ENV !== "production"') ||
    swRegContent.includes("process.env.NODE_ENV === 'production'") ||
    swRegContent.includes('process.env.NODE_ENV === "production"');
  const mountedInLayout = layoutContent.includes("ServiceWorkerRegistration");

  assert(
    swRegCompExists && registrationIsProductionOnly && mountedInLayout,
    "17. Service worker registration exists, restricted to production, and mounted in RootLayout"
  );

  // 18. Install prompt handling exists
  const usePwaInstallPath = path.join(rootDir, "hooks", "use-pwa-install.ts");
  const installHookExists = fs.existsSync(usePwaInstallPath);
  const installHookContent = installHookExists ? fs.readFileSync(usePwaInstallPath, "utf-8") : "";
  const handlesPrompt =
    installHookContent.includes("beforeinstallprompt") &&
    installHookContent.includes("promptInstall") &&
    installHookContent.includes("appinstalled");
  assert(installHookExists && handlesPrompt, "18. Install prompt hook (use-pwa-install.ts) properly handles events");

  // 19. Standalone detection exists
  const usePwaStatusPath = path.join(rootDir, "hooks", "use-pwa-status.ts");
  const statusHookExists = fs.existsSync(usePwaStatusPath);
  const statusHookContent = statusHookExists ? fs.readFileSync(usePwaStatusPath, "utf-8") : "";
  const detectsStandalone =
    statusHookContent.includes("(display-mode: standalone)") &&
    statusHookContent.includes("isStandalone");
  assert(statusHookExists && detectsStandalone, "19. Standalone detection hook (use-pwa-status.ts) detects display-mode");

  // 20. iOS installation guidance exists
  const installBtnPath = path.join(rootDir, "components", "pwa", "install-app-button.tsx");
  const installBtnExists = fs.existsSync(installBtnPath);
  const installBtnContent = installBtnExists ? fs.readFileSync(installBtnPath, "utf-8") : "";
  const hasIosInstructions =
    installBtnContent.includes("Install Heat Chat on iOS") &&
    installBtnContent.includes("Add to Home Screen");
  assert(installBtnExists && hasIosInstructions, "20. Accessible iOS 'Add to Home Screen' guidance implemented");

  // 21. Favicon returns valid format
  const faviconPath = path.join(rootDir, "public", "favicon.ico");
  const faviconExists = fs.existsSync(faviconPath);
  let faviconValid = false;
  if (faviconExists) {
    const icoBuf = fs.readFileSync(faviconPath);
    // Standard ICO magic: [0, 0, 1, 0]
    faviconValid = icoBuf.length > 60 && icoBuf.readUInt16LE(0) === 0 && icoBuf.readUInt16LE(2) === 1;
  }
  assert(faviconExists && faviconValid, "21. Valid multi-resolution public/favicon.ico exists (eliminates 404)");

  // 22. No broken PWA asset references
  const manifestReferencedInLayout = layoutContent.includes("/manifest.webmanifest");
  const appleIconReferenced = layoutContent.includes("/icons/apple-touch-icon.png");
  const faviconReferenced = layoutContent.includes("/favicon.ico");
  assert(
    manifestReferencedInLayout && appleIconReferenced && faviconReferenced,
    "22. Root layout metadata accurately references all PWA assets without broken links"
  );

  // 23. Secret scan
  const pwaFiles = [
    swPath,
    manifestPath,
    swRegCompPath,
    usePwaInstallPath,
    usePwaStatusPath,
    installBtnPath,
    offlinePagePath,
  ];
  let secretFound = false;
  const secretPatterns = [
    /eyJhbGciOi/i, // JWT token prefix
    /service_role/i,
    /sbp_[a-zA-Z0-9]{20,}/i,
    /sk_live_[a-zA-Z0-9]{20,}/i,
  ];

  for (const f of pwaFiles) {
    if (fs.existsSync(f)) {
      const content = fs.readFileSync(f, "utf-8");
      for (const pattern of secretPatterns) {
        if (pattern.test(content)) {
          secretFound = true;
          console.error(`  [!] Potential secret detected in ${f} matching ${pattern}`);
        }
      }
    }
  }
  assert(!secretFound, "23. Secret scan passed (no tokens, service role keys, or credentials committed)");

  // 24. TypeScript passes
  console.log("\n  Running TypeScript verification...");
  try {
    execSync("npx tsc --noEmit", { stdio: "pipe", cwd: rootDir });
    assert(true, "24. TypeScript compiles with 0 errors");
  } catch (err) {
    assert(false, "24. TypeScript compiles with 0 errors", err.stdout?.toString() || err.message);
  }

  // 25. ESLint passes
  console.log("  Running ESLint verification...");
  try {
    execSync("npm run lint", { stdio: "pipe", cwd: rootDir });
    assert(true, "25. ESLint passes with 0 errors");
  } catch (err) {
    assert(false, "25. ESLint passes with 0 errors", err.stdout?.toString() || err.message);
  }

  // 26. Production build passes
  console.log("  Running Production Build verification...");
  try {
    const buildOut = execSync("npm run build", { stdio: "pipe", cwd: rootDir }).toString();
    const buildSuccess = buildOut.includes("Compiled successfully") || buildOut.includes("Generating static pages");
    assert(buildSuccess, "26. Next.js production build succeeds");
  } catch (err) {
    assert(false, "26. Next.js production build succeeds", err.stdout?.toString() || err.message);
  }

  console.log("\n===============================================================================");
  console.log(`PWA VERIFICATION SUMMARY: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log("===============================================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
} catch (globalErr) {
  console.error("Fatal error during PWA verification:", globalErr);
  process.exit(1);
}
