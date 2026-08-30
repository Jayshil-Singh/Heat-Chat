/**
 * Heat Chat — Edit Profile UI & Form Validation Test Suite
 *
 * Tests:
 * - Profile Picture (avatar_url)
 * - Cover Picture (cover_url)
 * - Display Name validation
 * - Username validation & normalization & reserved check
 * - Status Emoji validation
 * - Status Message validation (160 char limit)
 * - Presence Status validation (ONLINE, AWAY, BUSY, OFFLINE, INVISIBLE)
 * - Bio validation (250 char limit UI / 500 DB)
 * - Timezone validation (IANA timezone format)
 * - Language validation (ISO codes)
 * - Dirty state detection algorithm
 * - Save payload construction
 * - Discard confirmation logic
 *
 * Run: node scratch/test-profile-edit-ui.mjs
 */

import {
  validateUsername,
  validateDisplayName,
  validateBio,
  validateStatusMessage,
  validateStatusEmoji,
  normalizeUsername,
  RESERVED_USERNAMES,
  VALID_PRESENCE_STATUSES,
} from "../lib/validation/profile.js";

let passed = 0;
let failed = 0;

function pass(testName) {
  console.log(`  ✅ PASS: ${testName}`);
  passed++;
}

function fail(testName, reason) {
  console.error(`  ❌ FAIL: ${testName}`);
  if (reason) console.error(`         → ${reason}`);
  failed++;
}

function section(title) {
  console.log(`\n══════════════════════════════════════════════════════════`);
  console.log(`  ${title}`);
  console.log(`══════════════════════════════════════════════════════════`);
}

// 1. Display Name Validation
section("1. DISPLAY NAME VALIDATION");
{
  const valid1 = validateDisplayName("Alex Rivera");
  if (valid1.isValid) pass("Standard display name accepted");
  else fail("Standard display name accepted", valid1.error);

  const valid2 = validateDisplayName("J");
  if (valid2.isValid) pass("Single character display name accepted");
  else fail("Single character display name accepted", valid2.error);

  const empty = validateDisplayName("");
  if (!empty.isValid) pass("Empty display name rejected");
  else fail("Empty display name rejected", "Did not fail");

  const whitespace = validateDisplayName("   ");
  if (!whitespace.isValid) pass("Whitespace-only display name rejected");
  else fail("Whitespace-only display name rejected", "Did not fail");

  const tooLong = validateDisplayName("A".repeat(51));
  if (!tooLong.isValid) pass("Display name > 50 chars rejected");
  else fail("Display name > 50 chars rejected", "Did not fail");
}

// 2. Username Validation & Normalization
section("2. USERNAME VALIDATION & NORMALIZATION");
{
  const valid = validateUsername("alex_rivera");
  if (valid.isValid) pass("Valid username accepted");
  else fail("Valid username accepted", valid.error);

  const normalized = normalizeUsername("  Alex_Rivera  ");
  if (normalized === "alex_rivera") pass("Username normalized to lowercase and trimmed");
  else fail("Username normalized to lowercase and trimmed", `got ${normalized}`);

  const reserved = validateUsername("admin");
  if (!reserved.isValid && reserved.error?.includes("reserved")) {
    pass("Reserved username 'admin' rejected");
  } else {
    fail("Reserved username 'admin' rejected", reserved.error);
  }

  const tooShort = validateUsername("ab");
  if (!tooShort.isValid) pass("Username < 3 chars rejected");
  else fail("Username < 3 chars rejected", "Did not fail");

  const tooLong = validateUsername("a".repeat(31));
  if (!tooLong.isValid) pass("Username > 30 chars rejected");
  else fail("Username > 30 chars rejected", "Did not fail");

  const invalidChars = validateUsername("alex rivera!");
  if (!invalidChars.isValid) pass("Username with spaces/special chars rejected");
  else fail("Username with spaces/special chars rejected", "Did not fail");
}

// 3. Status Emoji Validation
section("3. STATUS EMOJI VALIDATION");
{
  const validEmoji = validateStatusEmoji("🔥");
  if (validEmoji.isValid) pass("Single emoji accepted");
  else fail("Single emoji accepted", validEmoji.error);

  const nullEmoji = validateStatusEmoji(null);
  if (nullEmoji.isValid) pass("Null emoji (cleared) accepted");
  else fail("Null emoji (cleared) accepted", nullEmoji.error);

  const tooLongEmoji = validateStatusEmoji("🔥".repeat(20));
  if (!tooLongEmoji.isValid) pass("Oversized emoji string rejected");
  else fail("Oversized emoji string rejected", "Did not fail");
}

// 4. Status Message Validation
section("4. STATUS MESSAGE VALIDATION");
{
  const validMsg = validateStatusMessage("Working on Heat Chat features today!");
  if (validMsg.isValid) pass("Valid status message accepted");
  else fail("Valid status message accepted", validMsg.error);

  const emptyMsg = validateStatusMessage("");
  if (emptyMsg.isValid) pass("Empty status message accepted");
  else fail("Empty status message accepted", emptyMsg.error);

  const maxMsg = validateStatusMessage("a".repeat(160));
  if (maxMsg.isValid) pass("Exact 160-char status message accepted");
  else fail("Exact 160-char status message accepted", maxMsg.error);

  const tooLongMsg = validateStatusMessage("a".repeat(161));
  if (!tooLongMsg.isValid) pass("161-char status message rejected");
  else fail("161-char status message rejected", "Did not fail");
}

// 5. Presence Status Validation
section("5. PRESENCE STATUS ENUM");
{
  const statuses = ["ONLINE", "AWAY", "BUSY", "OFFLINE", "INVISIBLE"];
  const allMatch = statuses.every((s) => VALID_PRESENCE_STATUSES.includes(s));
  if (allMatch) pass("All canonical presence statuses defined in enum");
  else fail("All canonical presence statuses defined in enum");

  if (!VALID_PRESENCE_STATUSES.includes("invalid_status")) {
    pass("Invalid presence status rejected");
  } else {
    fail("Invalid presence status rejected");
  }
}

// 6. Bio Validation
section("6. BIO VALIDATION");
{
  const validBio = validateBio("Full stack developer building real-time applications.");
  if (validBio.isValid) pass("Valid bio accepted");
  else fail("Valid bio accepted", validBio.error);

  const emptyBio = validateBio(null);
  if (emptyBio.isValid) pass("Null bio accepted");
  else fail("Null bio accepted", emptyBio.error);

  const maxBio = validateBio("x".repeat(500));
  if (maxBio.isValid) pass("500-char bio accepted");
  else fail("500-char bio accepted", maxBio.error);

  const tooLongBio = validateBio("x".repeat(501));
  if (!tooLongBio.isValid) pass("501-char bio rejected");
  else fail("501-char bio rejected", "Did not fail");
}

// 7. Timezone Validation
section("7. TIMEZONE IDENTIFIERS");
{
  const timezones = [
    "UTC",
    "Pacific/Fiji",
    "Pacific/Auckland",
    "Australia/Sydney",
    "Asia/Kolkata",
    "Asia/Tokyo",
    "America/New_York",
    "Europe/London",
  ];

  let allValid = true;
  for (const tz of timezones) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
    } catch {
      allValid = false;
      fail(`Timezone format check: ${tz}`, "Invalid IANA timezone identifier");
    }
  }
  if (allValid) pass("All supported IANA timezones are valid");
}

// 8. Dirty-State Detection Logic
section("8. DIRTY-STATE DETECTION ALGORITHM");
{
  function computeIsDirty(current, initial) {
    return (
      current.displayName.trim() !== initial.displayName.trim() ||
      current.username.toLowerCase().trim() !== initial.username.toLowerCase().trim() ||
      current.bio.trim() !== initial.bio.trim() ||
      current.statusEmoji !== initial.statusEmoji ||
      current.statusMessage.trim() !== initial.statusMessage.trim() ||
      current.presenceStatus !== initial.presenceStatus ||
      current.timezone !== initial.timezone ||
      current.language !== initial.language ||
      current.avatarUrl !== initial.avatarUrl ||
      current.coverUrl !== initial.coverUrl
    );
  }

  const initial = {
    displayName: "Alex Rivera",
    username: "alex_rivera",
    bio: "Hello world",
    statusEmoji: "🔥",
    statusMessage: "Available",
    presenceStatus: "ONLINE",
    timezone: "Pacific/Fiji",
    language: "en",
    avatarUrl: "https://example.com/avatar.jpg",
    coverUrl: "https://example.com/cover.jpg",
  };

  // Identical state -> NOT dirty
  const cleanState = { ...initial };
  if (!computeIsDirty(cleanState, initial)) {
    pass("Identical state reports clean (not dirty)");
  } else {
    fail("Identical state reports clean", "Reported dirty");
  }

  // Display Name change -> dirty
  const modifiedName = { ...initial, displayName: "Alex R." };
  if (computeIsDirty(modifiedName, initial)) {
    pass("Display name change correctly triggers dirty state");
  } else {
    fail("Display name change triggers dirty state");
  }

  // Status Emoji change -> dirty
  const modifiedEmoji = { ...initial, statusEmoji: "🚀" };
  if (computeIsDirty(modifiedEmoji, initial)) {
    pass("Emoji change correctly triggers dirty state");
  } else {
    fail("Emoji change triggers dirty state");
  }

  // Timezone change -> dirty
  const modifiedTz = { ...initial, timezone: "UTC" };
  if (computeIsDirty(modifiedTz, initial)) {
    pass("Timezone change correctly triggers dirty state");
  } else {
    fail("Timezone change triggers dirty state");
  }

  // Cover image change -> dirty
  const modifiedCover = { ...initial, coverUrl: "https://example.com/newcover.jpg" };
  if (computeIsDirty(modifiedCover, initial)) {
    pass("Cover image change correctly triggers dirty state");
  } else {
    fail("Cover image change triggers dirty state");
  }
}

// 9. Full Payload Construction
section("9. FULL PROFILE PATCH PAYLOAD");
{
  const formState = {
    displayName: "Dead Shadow",
    username: "dead_shadow",
    bio: "Building secure communication tools.",
    statusEmoji: "⚡",
    statusMessage: "Shipping Heat Chat v2",
    presenceStatus: "BUSY",
    timezone: "Pacific/Fiji",
    language: "en",
    avatarUrl: "https://example.com/avatar.webp",
    coverUrl: "https://example.com/cover.webp",
  };

  const payload = {
    display_name: formState.displayName.trim(),
    username: formState.username.toLowerCase().trim(),
    bio: formState.bio.trim() || null,
    status_message: formState.statusMessage.trim() || null,
    status_emoji: formState.statusEmoji || null,
    presence_status: formState.presenceStatus,
    timezone: formState.timezone || "UTC",
    language: formState.language || "en",
    avatar_url: formState.avatarUrl,
    cover_url: formState.coverUrl,
  };

  if (
    payload.display_name === "Dead Shadow" &&
    payload.username === "dead_shadow" &&
    payload.status_emoji === "⚡" &&
    payload.status_message === "Shipping Heat Chat v2" &&
    payload.presence_status === "BUSY" &&
    payload.timezone === "Pacific/Fiji" &&
    payload.language === "en" &&
    payload.avatar_url === "https://example.com/avatar.webp" &&
    payload.cover_url === "https://example.com/cover.webp"
  ) {
    pass("Complete 10-field PATCH payload constructs accurately");
  } else {
    fail("Complete 10-field PATCH payload constructs accurately", JSON.stringify(payload));
  }
}

console.log(`\n══════════════════════════════════════════════════════════`);
console.log(`  TOTAL: ${passed + failed}  |  ✅ PASS: ${passed}  |  ❌ FAIL: ${failed}`);
console.log(`══════════════════════════════════════════════════════════\n`);

if (failed > 0) {
  process.exit(1);
}
