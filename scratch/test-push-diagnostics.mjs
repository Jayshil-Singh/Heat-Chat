import assert from "node:assert";

// Test cleanKey logic
function cleanKey(raw) {
  if (!raw) return "";
  let v = raw.trim();
  if (v.length >= 2) {
    if (
      (v[0] === '"' && v[v.length - 1] === '"') ||
      (v[0] === "'" && v[v.length - 1] === "'")
    ) {
      v = v.slice(1, -1).trim();
    }
  }
  return v;
}

// Test classifyPushProvider logic
function classifyPushProvider(endpoint) {
  try {
    const host = new URL(endpoint).hostname.toLowerCase();
    if (host.includes("googleapis.com") || host.includes("fcm")) return "fcm_google";
    if (host.includes("push.apple.com")) return "apple_apns";
    if (host.includes("mozilla")) return "mozilla";
    if (host.includes("notify.windows.com")) return "windows_wns";
    return "webpush_other";
  } catch {
    return "invalid_endpoint";
  }
}

// Test classifyPushError logic
function classifyPushError(statusCode) {
  if (statusCode === 404 || statusCode === 410) return "subscription_expired";
  if (statusCode === 401) return "vapid_auth";
  if (statusCode === 403) return "forbidden";
  if (statusCode === 400) return "bad_request";
  if (statusCode === 413) return "payload_too_large";
  if (statusCode === 429) return "rate_limited";
  if (statusCode >= 500) return "push_service_error";
  return "unknown_error";
}

console.log("Testing cleanKey...");
assert.strictEqual(cleanKey('"my-secret"'), "my-secret");
assert.strictEqual(cleanKey("'my-secret'"), "my-secret");
assert.strictEqual(cleanKey("  my-secret  "), "my-secret");
assert.strictEqual(cleanKey(null), "");
assert.strictEqual(cleanKey(undefined), "");

console.log("Testing classifyPushProvider...");
assert.strictEqual(classifyPushProvider("https://fcm.googleapis.com/fcm/send/abc"), "fcm_google");
assert.strictEqual(classifyPushProvider("https://web.push.apple.com/QN495..."), "apple_apns");
assert.strictEqual(classifyPushProvider("https://updates.push.services.mozilla.com/wpush/v2/abc"), "mozilla");
assert.strictEqual(classifyPushProvider("https://wns2-sn1p.notify.windows.com/w/?token=abc"), "windows_wns");
assert.strictEqual(classifyPushProvider("invalid-url"), "invalid_endpoint");

console.log("Testing classifyPushError...");
assert.strictEqual(classifyPushError(401), "vapid_auth");
assert.strictEqual(classifyPushError(403), "forbidden");
assert.strictEqual(classifyPushError(404), "subscription_expired");
assert.strictEqual(classifyPushError(410), "subscription_expired");
assert.strictEqual(classifyPushError(400), "bad_request");
assert.strictEqual(classifyPushError(429), "rate_limited");
assert.strictEqual(classifyPushError(500), "push_service_error");
assert.strictEqual(classifyPushError(503), "push_service_error");

console.log("All unit assertions passed!");
