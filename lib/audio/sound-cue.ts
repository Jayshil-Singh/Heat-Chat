/**
 * HEAT CHAT — AUDIO CUE SYNTHESIZER
 * 
 * Generates a clean, zero-network, dual-tone chime using Web Audio API.
 * Autoplay-policy safe with deduplication locking.
 */

let audioCtx: AudioContext | null = null;
let lastPlayedAt = 0;
const DEDUP_WINDOW_MS = 300;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Plays a gentle, pleasant dual-tone chime (587.33 Hz [D5] -> 880 Hz [A5]).
 * Catches suspended AudioContext states gracefully without throwing errors.
 */
export async function playNotificationSound(): Promise<void> {
  const now = Date.now();
  if (now - lastPlayedAt < DEDUP_WINDOW_MS) {
    return; // Rate limit duplicate rapid triggers
  }
  lastPlayedAt = now;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => {});
    }

    if (ctx.state !== "running") {
      return; // Autoplay blocked, fail silently
    }

    const t = ctx.currentTime;

    // Master Gain
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.12, t);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    masterGain.connect(ctx.destination);

    // Oscillator 1 (Initial note: 587.33Hz)
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, t);
    osc1.frequency.exponentialRampToValueAtTime(880, t + 0.12);

    osc1.connect(masterGain);
    osc1.start(t);
    osc1.stop(t + 0.35);

    // Oscillator 2 (Soft harmonic overtone: 1174.66Hz)
    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(1174.66, t);

    const overtoneGain = ctx.createGain();
    overtoneGain.gain.setValueAtTime(0.04, t);
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);

    osc2.connect(overtoneGain);
    overtoneGain.connect(ctx.destination);

    osc2.start(t);
    osc2.stop(t + 0.25);
  } catch {
    // Fail silently without crashing the chat UI
  }
}

/**
 * Preview / Test sound button trigger (always attempts to resume context on user gesture).
 */
export async function playTestSound(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    await playNotificationSound();
    return true;
  } catch {
    return false;
  }
}
