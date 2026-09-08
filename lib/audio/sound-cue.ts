/**
 * HEAT CHAT — AUDIO CUE SYNTHESIZER
 * 
 * Generates a clean, zero-network, dual-tone chime using Web Audio API.
 * Autoplay-policy safe with deduplication locking.
 */

let audioCtx: AudioContext | null = null;
let lastPlayedAt = 0;
const BURST_COALESCE_MS = 1500;
const MAX_SOUND_CACHE_ENTRIES = 250;
const SOUND_DEDUPE_TTL_MS = 5 * 60 * 1000;

// Bounded in-memory sound deduplication cache
const soundDedupeCache = new Map<string, number>();

export function clearSoundCache(): void {
  soundDedupeCache.clear();
  lastPlayedAt = 0;
}

function checkAndRecordSoundDedupe(soundId?: string): boolean {
  if (!soundId) return false;
  const now = Date.now();

  const prev = soundDedupeCache.get(soundId);
  if (prev && now - prev < SOUND_DEDUPE_TTL_MS) {
    return true; // Already played for this sound ID
  }

  // Prune expired entries
  if (soundDedupeCache.size >= MAX_SOUND_CACHE_ENTRIES) {
    const expiredKeys: string[] = [];
    soundDedupeCache.forEach((time, key) => {
      if (now - time >= SOUND_DEDUPE_TTL_MS) expiredKeys.push(key);
    });
    expiredKeys.forEach((k) => soundDedupeCache.delete(k));

    if (soundDedupeCache.size >= MAX_SOUND_CACHE_ENTRIES) {
      const oldestKeys = Array.from(soundDedupeCache.keys()).slice(0, 50);
      oldestKeys.forEach((k) => soundDedupeCache.delete(k));
    }
  }

  soundDedupeCache.set(soundId, now);
  return false;
}

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
 * Triggers safe haptic vibration if supported, tab is visible, and reduced-motion is not requested.
 */
export function triggerHapticFeedback(): void {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !("vibrate" in navigator)) {
    return;
  }

  try {
    // Check reduced motion preference
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    if (document.visibilityState !== "visible") {
      return;
    }

    navigator.vibrate([30, 40, 30]);
  } catch {
    // Fail silently without throwing
  }
}

/**
 * Plays a gentle, pleasant dual-tone chime (587.33 Hz [D5] -> 880 Hz [A5]).
 * Catches suspended AudioContext states gracefully without throwing errors.
 * Coalesces rapid triggers within 1500ms and verifies tab visibility.
 */
export async function playNotificationSound(soundId?: string, isTest: boolean = false): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  // Sound only plays when tab is visible (unless user explicitly triggered test)
  if (!isTest && document.visibilityState !== "visible") {
    return;
  }

  // Deduplication check on sound ID
  if (soundId && checkAndRecordSoundDedupe(soundId)) {
    return;
  }

  const now = Date.now();
  if (!isTest && now - lastPlayedAt < BURST_COALESCE_MS) {
    return; // Coalesce burst triggers
  }
  lastPlayedAt = now;

  // Optional haptic vibration for supported mobile devices
  triggerHapticFeedback();

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

    // Safely disconnect audio nodes on completion to prevent memory leaks
    const cleanupNodes = () => {
      try {
        const osc = osc1;
        const gain = masterGain;
        osc.disconnect();
        gain.disconnect();
        osc2.disconnect();
        overtoneGain.disconnect();
      } catch {}
    };
    osc1.onended = cleanupNodes;
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
    await playNotificationSound(undefined, true);
    return true;
  } catch {
    return false;
  }
}
