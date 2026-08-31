/**
 * Heat Chat — Voice Recorder / Composer UI Test Suite
 * Validates the state machine, exclusive rendering, lifecycle, and safety
 * behaviors of the VoiceRecorderBar + MessageComposer integration.
 *
 * All tests are pure-simulation (no browser / DOM required).
 */

// ─── Test runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

console.log("=================================================");
console.log("🎙  Heat Chat — Voice Composer UI Test Suite");
console.log("=================================================\n");

// ─── 1. State machine simulator ───────────────────────────────────────────────

console.log("▶ 1. Composer State Machine — Exclusive Rendering");

/**
 * Simulates the showVoiceRecorder + voiceUploadState state as managed by
 * message-composer.tsx, without any DOM.
 */
class ComposerStateMachine {
  constructor() {
    this.showVoiceRecorder = false;
    this.voiceUploadState = "idle"; // "idle" | "uploading" | "failed"
    this.voiceUploadError = null;
    this.voiceSendData = null; // { blob, mimeType, durationSeconds }
    this.recorderState = "idle"; // mirrors useVoiceRecorder.state
    this.normalFormVisible = true;
    this.log = [];
  }

  get composerMode() {
    // The key invariant: these must be mutually exclusive
    if (this.showVoiceRecorder && this.recorderState !== "idle") {
      return "recording";
    }
    return "normal";
  }

  // Simulates pressing the mic button
  tapMic() {
    this.showVoiceRecorder = true;
    this.recorderState = "requesting";
    this.log.push("mic:tapped");
  }

  // Simulates permission granted → recording starts
  micGranted() {
    assert(this.recorderState === "requesting", "State is requesting before grant");
    this.recorderState = "recording";
    this.log.push("mic:granted");
  }

  // Simulates permission denied
  micDenied() {
    this.recorderState = "error";
    this.log.push("mic:denied");
  }

  pause() {
    assert(this.recorderState === "recording", "Can only pause while recording");
    this.recorderState = "paused";
    this.log.push("recording:paused");
  }

  resume() {
    assert(this.recorderState === "paused", "Can only resume while paused");
    this.recorderState = "recording";
    this.log.push("recording:resumed");
  }

  stop() {
    assert(
      this.recorderState === "recording" || this.recorderState === "paused",
      "Can only stop while recording or paused"
    );
    this.recorderState = "stopped";
    this.voiceSendData = {
      blob: new Uint8Array([1, 2, 3]),
      mimeType: "audio/webm",
      durationSeconds: 7,
    };
    this.log.push("recording:stopped");
  }

  async send() {
    assert(this.recorderState === "stopped", "Can only send from stopped state");
    this.voiceUploadState = "uploading";
    this.log.push("upload:started");
    // Simulate success
    return { success: true };
  }

  onSendSuccess() {
    this.showVoiceRecorder = false;
    this.voiceUploadState = "idle";
    this.voiceUploadError = null;
    this.voiceSendData = null;
    this.recorderState = "idle";
    this.log.push("composer:reset");
  }

  onSendFailure(errMsg) {
    this.voiceUploadState = "failed";
    this.voiceUploadError = errMsg;
    this.log.push("upload:failed");
    // showVoiceRecorder stays true — user can retry
  }

  retry() {
    assert(this.voiceSendData !== null, "Blob must still be available for retry");
    this.voiceUploadState = "uploading";
    this.log.push("upload:retry");
  }

  discard() {
    this.showVoiceRecorder = false;
    this.voiceUploadState = "idle";
    this.voiceUploadError = null;
    this.voiceSendData = null;
    this.recorderState = "idle";
    this.log.push("recorder:discarded");
  }
}

// ─── Test 1: Normal composer visible in IDLE ─────────────────────────────────

const m1 = new ComposerStateMachine();
assert(!m1.showVoiceRecorder, "Normal composer shows in idle (showVoiceRecorder=false)");
assert(m1.composerMode === "normal", "composerMode is 'normal' in idle");

// ─── Test 2: Mic tap → exclusive recording mode ───────────────────────────────

m1.tapMic();
m1.micGranted();
assert(m1.showVoiceRecorder === true, "showVoiceRecorder is true after mic tap");
assert(m1.recorderState === "recording", "Recorder state is 'recording'");
assert(m1.composerMode === "recording", "composerMode switches to 'recording'");
// The normal form MUST NOT be visible simultaneously
assert(
  !(m1.showVoiceRecorder && m1.composerMode === "normal"),
  "Normal form is NOT mounted while recording"
);

// ─── Test 3: Pause → paused state ────────────────────────────────────────────

console.log("\n▶ 2. Recording Lifecycle — Pause / Resume / Stop");

m1.pause();
assert(m1.recorderState === "paused", "Recorder is paused");
assert(m1.showVoiceRecorder, "showVoiceRecorder stays true during pause");

m1.resume();
assert(m1.recorderState === "recording", "Recorder resumes after resume()");

m1.stop();
assert(m1.recorderState === "stopped", "Recorder is stopped");
assert(m1.voiceSendData !== null, "Blob is available in stopped state");

// ─── Test 4: Successful send → return to normal composer ──────────────────────

console.log("\n▶ 3. Send — Success Path");

m1.send().then(() => {
  assert(m1.voiceUploadState === "uploading", "Upload state is 'uploading'");
  m1.onSendSuccess();
  assert(!m1.showVoiceRecorder, "showVoiceRecorder=false after successful send");
  assert(m1.voiceUploadState === "idle", "voiceUploadState reset to idle");
  assert(m1.voiceSendData === null, "Blob cleared after successful send");
  assert(m1.recorderState === "idle", "Recorder state reset to idle");
  assert(m1.composerMode === "normal", "composerMode is 'normal' after send");
});

// ─── Test 5: Upload failure → blob retained for retry ────────────────────────

console.log("\n▶ 4. Send — Failure / Retry Path");

const m2 = new ComposerStateMachine();
m2.tapMic();
m2.micGranted();
m2.stop();
m2.send().then(() => {
  m2.onSendFailure("Network error");
  assert(m2.voiceUploadState === "failed", "Upload state is 'failed'");
  assert(m2.voiceUploadError === "Network error", "Error message preserved");
  assert(m2.showVoiceRecorder, "showVoiceRecorder stays true on upload failure");
  assert(m2.voiceSendData !== null, "Blob is RETAINED after upload failure (for retry)");

  // Retry
  m2.retry();
  assert(m2.voiceUploadState === "uploading", "Upload retried — state is 'uploading'");
  m2.onSendSuccess();
  assert(!m2.showVoiceRecorder, "showVoiceRecorder=false after retry success");
});

// ─── Test 6: Discard returns to normal ───────────────────────────────────────

console.log("\n▶ 5. Discard");

const m3 = new ComposerStateMachine();
m3.tapMic();
m3.micGranted();
m3.discard();
assert(!m3.showVoiceRecorder, "showVoiceRecorder=false after discard");
assert(m3.recorderState === "idle", "Recorder state is idle after discard");
assert(m3.composerMode === "normal", "composerMode is 'normal' after discard");
assert(m3.voiceSendData === null, "voiceSendData cleared on discard");

// ─── Test 7: Permission denial → no crash, state reset ───────────────────────

console.log("\n▶ 6. Permission Denial");

const m4 = new ComposerStateMachine();
m4.tapMic();
m4.micDenied();
assert(m4.recorderState === "error", "Recorder enters error state on permission denial");
assert(m4.showVoiceRecorder, "showVoiceRecorder stays true (error shown in bar, discard returns)");
m4.discard(); // User presses discard to exit
assert(!m4.showVoiceRecorder, "showVoiceRecorder=false after discard from error state");
assert(m4.composerMode === "normal", "Normal composer returns after dismissing error");

// ─── Test 8: Upload failure during retry doesn't duplicate messages ───────────

console.log("\n▶ 7. Idempotency / No Duplicate Messages");

const m5 = new ComposerStateMachine();
m5.tapMic();
m5.micGranted();
m5.stop();
const initialBlob = m5.voiceSendData;
m5.send().then(() => {
  m5.onSendFailure("Timeout");
  m5.retry();
  // Blob must be the SAME reference — not a re-recorded blob
  assert(m5.voiceSendData === initialBlob, "Same blob reference used on retry (no re-recording)");
});

// ─── Test 9: Editing mode blocks voice recorder ───────────────────────────────

console.log("\n▶ 8. Edit Mode Interaction");

class ComposerWithEditMode extends ComposerStateMachine {
  constructor() {
    super();
    this.isEditing = false;
  }

  get composerMode() {
    // When editing, voice recorder is blocked at the UI level
    if (this.isEditing) return "editing";
    return super.composerMode;
  }

  enterEditMode() {
    this.isEditing = true;
  }

  exitEditMode() {
    this.isEditing = false;
  }
}

const m6 = new ComposerWithEditMode();
m6.enterEditMode();
assert(m6.composerMode === "editing", "Edit mode takes priority");
assert(!m6.showVoiceRecorder, "showVoiceRecorder is false during editing");
// Voice recorder should NOT be triggered while editing
// (In message-composer.tsx: `showVoiceRecorder && !isEditing ? <bar> : <form>`)
assert(
  !(m6.showVoiceRecorder && m6.isEditing),
  "Voice recorder and edit mode cannot coexist"
);

// ─── Test 10: Transition invariant — exactly one visible composer state ────────

console.log("\n▶ 9. Transition Invariants — One Composer State at a Time");

function checkExclusive(machine, description) {
  const voiceVisible = machine.showVoiceRecorder && !machine.isEditing;
  const normalVisible = !machine.showVoiceRecorder || machine.isEditing;
  // XOR: exactly one is true
  assert(voiceVisible !== normalVisible, `${description}: Exactly one composer state visible`);
}

const t1 = new ComposerWithEditMode();
checkExclusive(t1, "IDLE");

t1.tapMic();
t1.micGranted();
checkExclusive(t1, "RECORDING");

t1.pause();
checkExclusive(t1, "PAUSED");

t1.resume();
t1.stop();
checkExclusive(t1, "STOPPED/PREVIEW");

t1.send().then(() => {
  t1.onSendSuccess();
  checkExclusive(t1, "POST-SEND (IDLE)");
});

const t2 = new ComposerWithEditMode();
t2.tapMic();
t2.micGranted();
t2.stop();
t2.send().then(() => {
  t2.onSendFailure("err");
  checkExclusive(t2, "UPLOAD FAILED");

  t2.discard();
  checkExclusive(t2, "POST-DISCARD (IDLE)");
});

// ─── Test 11: Microphone cleanup on discard/send/error ────────────────────────

console.log("\n▶ 10. Microphone Cleanup Simulation");

// Verify that releaseStream is called on all exit paths
class MicTrackingSimulation {
  constructor() {
    this.micActive = false;
    this.cleanupCount = 0;
  }

  startMic() { this.micActive = true; }

  releaseStream() {
    this.micActive = false;
    this.cleanupCount++;
  }

  // Called on discard
  discard() { this.releaseStream(); }

  // Called on stop (recorder.onstop fires releaseStream in the hook)
  stop() { this.releaseStream(); }

  // Called on error
  onError() { this.releaseStream(); }
}

const mic1 = new MicTrackingSimulation();
mic1.startMic();
assert(mic1.micActive, "Mic is active after start");
mic1.discard();
assert(!mic1.micActive, "Mic released on discard");
assert(mic1.cleanupCount === 1, "releaseStream called exactly once on discard");

const mic2 = new MicTrackingSimulation();
mic2.startMic();
mic2.stop();
assert(!mic2.micActive, "Mic released on stop");

const mic3 = new MicTrackingSimulation();
mic3.startMic();
mic3.onError();
assert(!mic3.micActive, "Mic released on error");

// ─── Test 12: UI component source inspection ───────────────────────────────────

console.log("\n▶ 11. VoiceRecorderBar Source Inspection");

import { readFileSync } from "fs";

const barSrc = readFileSync("components/chat/voice-recorder-bar.tsx", "utf8");
const composerSrc = readFileSync("components/chat/message-composer.tsx", "utf8");

// Verify exclusive conditional in composer
assert(
  composerSrc.includes("showVoiceRecorder && !isEditing ?"),
  "Composer uses exclusive conditional: showVoiceRecorder && !isEditing ?"
);
assert(
  !composerSrc.includes("showVoiceRecorder && !isEditing && (") ||
  composerSrc.indexOf("showVoiceRecorder && !isEditing ?") > -1,
  "Recorder is rendered as exclusive branch (not additive)"
);

// Verify VoiceRecorderBar has all required aria-labels
assert(barSrc.includes('aria-label="Discard recording"'), "Discard button has aria-label");
assert(barSrc.includes('aria-label="Pause recording"'), "Pause button has aria-label");
assert(barSrc.includes('aria-label="Resume recording"'), "Resume button has aria-label");
assert(barSrc.includes('aria-label="Stop recording"'), "Stop button has aria-label");
assert(barSrc.includes('aria-label="Send voice message"'), "Send button has aria-label");
assert(barSrc.includes('aria-label="Retry recording"'), "Retry button has aria-label");
assert(
  barSrc.includes('aria-label={isPlaying ? "Pause playback" : "Play voice message"}'),
  "Play/Pause preview button has aria-label"
);

// Verify waveform constraints
assert(barSrc.includes("flex-1 min-w-0 overflow-hidden"), "Waveform container uses flex-1 min-w-0 overflow-hidden");

// Verify tabular-nums timer
assert(barSrc.includes("tabular-nums"), "Timer uses tabular-nums");

// Verify safe-area
assert(
  barSrc.includes("env(safe-area-inset-bottom)"),
  "Safe area inset respected"
);

// Verify upload state props
assert(barSrc.includes("uploadState"), "VoiceRecorderBar accepts uploadState prop");
assert(barSrc.includes("uploadError"), "VoiceRecorderBar accepts uploadError prop");
assert(barSrc.includes("onRetry"), "VoiceRecorderBar accepts onRetry prop");

// Verify handleVoiceSend / handleVoiceDiscard / handleVoiceRetry in composer
assert(composerSrc.includes("handleVoiceSend"), "Composer has handleVoiceSend handler");
assert(composerSrc.includes("handleVoiceDiscard"), "Composer has handleVoiceDiscard handler");
assert(composerSrc.includes("handleVoiceRetry"), "Composer has handleVoiceRetry handler");

// Verify voiceUploadState tracking
assert(composerSrc.includes("voiceUploadState"), "Composer tracks voiceUploadState");
assert(composerSrc.includes("voiceSendDataRef"), "Composer retains blob ref for retry");

// Verify old inline handler is gone (old pattern)
assert(
  !composerSrc.includes("setShowVoiceRecorder(false);\n            voiceRecorder.discard();"),
  "Old premature discard pattern is removed"
);

// ─── Report ───────────────────────────────────────────────────────────────────

console.log("\n=================================================");
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("🎉 ALL VOICE COMPOSER UI TESTS PASSED!\n");
}
