"use client";

import * as React from "react";

export type VoiceRecorderState =
  | "idle"
  | "requesting"
  | "recording"
  | "paused"
  | "stopped"
  | "error";

export interface VoiceRecorderResult {
  state: VoiceRecorderState;
  /** Duration of current recording in seconds */
  durationSeconds: number;
  /** Sampled waveform amplitudes (0–1) for visualisation */
  waveformPeaks: number[];
  /** The final recorded Blob (available in "stopped" state) */
  blob: Blob | null;
  /** MIME type used (e.g. "audio/webm;codecs=opus") */
  mimeType: string;
  /** Human-readable error description */
  error: string | null;
  /** Start / resume recording */
  start: () => Promise<void>;
  /** Pause recording */
  pause: () => void;
  /** Resume from paused state */
  resume: () => void;
  /** Finalise — produces blob */
  stop: () => void;
  /** Discard recording and return to idle */
  discard: () => void;
}

const CANDIDATE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
  "audio/aac",
];

export function selectSupportedMimeType(): string {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
    return "";
  }
  if (typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }
  for (const candidate of CANDIDATE_MIME_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    } catch {
      // Continue search
    }
  }
  return "";
}

/** Max recording duration: 5 minutes */
const MAX_DURATION_SECONDS = 300;
/** Waveform sample interval: 100ms */
const SAMPLE_INTERVAL_MS = 100;
/** Number of waveform peaks to keep in state */
const MAX_PEAKS = 60;

export function useVoiceRecorder(): VoiceRecorderResult {
  const [state, setState] = React.useState<VoiceRecorderState>("idle");
  const [durationSeconds, setDurationSeconds] = React.useState(0);
  const [waveformPeaks, setWaveformPeaks] = React.useState<number[]>([]);
  const [blob, setBlob] = React.useState<Blob | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [mimeType, setMimeType] = React.useState<string>("");

  const stateRef = React.useRef<VoiceRecorderState>("idle");
  stateRef.current = state;

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const durationIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const waveformIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Timing refs
  const startTimeRef = React.useRef<number>(0);
  const pausedDurationRef = React.useRef<number>(0);
  const pauseStartRef = React.useRef<number>(0);
  const durationRef = React.useRef<number>(0);
  const mimeTypeRef = React.useRef<string>("");

  const stopIntervals = React.useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (waveformIntervalRef.current) {
      clearInterval(waveformIntervalRef.current);
      waveformIntervalRef.current = null;
    }
  }, []);

  const releaseStream = React.useCallback(() => {
    stopIntervals();
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {}
        });
      } catch {}
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      try {
        audioContextRef.current.close().catch(() => {});
      } catch {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    mediaRecorderRef.current = null;
  }, [stopIntervals]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      releaseStream();
    };
  }, [releaseStream]);

  const startWaveform = React.useCallback(() => {
    if (waveformIntervalRef.current) clearInterval(waveformIntervalRef.current);
    const analyser = analyserRef.current;
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    waveformIntervalRef.current = setInterval(() => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      // Average across bass + mid-range frequencies
      const slice = dataArray.slice(0, Math.min(64, dataArray.length));
      const avg = slice.reduce((s, v) => s + v, 0) / (slice.length || 1) / 255;
      setWaveformPeaks((prev) => {
        const next = [...prev, avg];
        return next.length > MAX_PEAKS ? next.slice(next.length - MAX_PEAKS) : next;
      });
    }, SAMPLE_INTERVAL_MS);
  }, []);

  const startTimer = React.useCallback((isNew: boolean) => {
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    if (isNew) {
      startTimeRef.current = Date.now();
      pausedDurationRef.current = 0;
      pauseStartRef.current = 0;
      durationRef.current = 0;
      setDurationSeconds(0);
    }

    durationIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - startTimeRef.current - pausedDurationRef.current;
      const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
      if (elapsedSec !== durationRef.current) {
        durationRef.current = elapsedSec;
        setDurationSeconds(elapsedSec);
      }
      if (elapsedSec >= MAX_DURATION_SECONDS) {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          try {
            mediaRecorderRef.current.stop();
          } catch {}
        }
      }
    }, 1000);
  }, []);

  const pause = React.useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    try {
      recorder.pause();
    } catch (err) {
      console.warn("Failed to pause recorder:", err);
    }
    pauseStartRef.current = Date.now();
    stopIntervals();
    setState("paused");
  }, [stopIntervals]);

  const resume = React.useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    try {
      recorder.resume();
    } catch (err) {
      console.warn("Failed to resume recorder:", err);
    }
    if (pauseStartRef.current > 0) {
      pausedDurationRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = 0;
    }
    setState("recording");
    startTimer(false);
    startWaveform();
  }, [startTimer, startWaveform]);

  const stop = React.useCallback(() => {
    stopIntervals();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch (err) {
        console.error("Error stopping MediaRecorder:", err);
      }
    }
  }, [stopIntervals]);

  const discard = React.useCallback(() => {
    stopIntervals();
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      try {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      } catch {}
      recorder.onstart = null;
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
    }
    releaseStream();
    chunksRef.current = [];
    startTimeRef.current = 0;
    pausedDurationRef.current = 0;
    pauseStartRef.current = 0;
    durationRef.current = 0;
    setDurationSeconds(0);
    setWaveformPeaks([]);
    setBlob(null);
    setError(null);
    setState("idle");
  }, [releaseStream, stopIntervals]);

  const start = React.useCallback(async () => {
    if (stateRef.current === "recording") return;

    if (stateRef.current === "paused" && mediaRecorderRef.current) {
      resume();
      return;
    }

    // Clean up previous state
    discard();

    setState("requesting");
    setError(null);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      setError("Audio recording is not supported in this browser environment.");
      setState("error");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
    } catch (err: any) {
      releaseStream();
      const errName = err?.name || "";
      const msg =
        errName === "NotAllowedError" || errName === "PermissionDeniedError"
          ? "Microphone access was denied. Please allow microphone permissions and try again."
          : errName === "NotFoundError" || errName === "DevicesNotFoundError"
          ? "No microphone found. Please connect a microphone and try again."
          : errName === "NotReadableError" || errName === "TrackStartError"
          ? "Microphone is in use by another application."
          : err?.message || "Failed to access microphone.";
      setError(msg);
      setState("error");
      return;
    }

    // Initialize AudioContext for waveform visualization (gracefully degrade if unavailable)
    try {
      const AudioCtxClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        const audioCtx = new AudioCtxClass();
        audioContextRef.current = audioCtx;
        if (audioCtx.state === "suspended") {
          await audioCtx.resume().catch(() => {});
        }
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);
        analyserRef.current = analyser;
      }
    } catch (audioErr) {
      console.warn("AudioContext setup failed, live waveform disabled:", audioErr);
    }

    chunksRef.current = [];
    setDurationSeconds(0);
    setWaveformPeaks([]);
    setBlob(null);

    // Dynamic MIME type selection with fallback
    const candidateMime = selectSupportedMimeType();
    let recorder: MediaRecorder;
    try {
      if (candidateMime) {
        recorder = new MediaRecorder(stream, { mimeType: candidateMime });
      } else {
        recorder = new MediaRecorder(stream);
      }
    } catch (recErr) {
      console.warn(
        "MediaRecorder initialization with preferred MIME failed, falling back to default:",
        recErr
      );
      try {
        recorder = new MediaRecorder(stream);
      } catch (fatalErr: any) {
        releaseStream();
        setError(
          "Could not initialize audio recording: " +
            (fatalErr?.message || "unsupported browser")
        );
        setState("error");
        return;
      }
    }

    mediaRecorderRef.current = recorder;
    const resolvedMime = recorder.mimeType || candidateMime || "audio/webm";
    mimeTypeRef.current = resolvedMime;
    setMimeType(resolvedMime);

    recorder.onstart = () => {
      setState("recording");
      startTimer(true);
      startWaveform();
    };

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onerror = (e: Event) => {
      console.error("MediaRecorder runtime error:", e);
      stopIntervals();
      releaseStream();
      setError("Recording failed due to a device or encoder error.");
      setState("error");
    };

    recorder.onstop = () => {
      stopIntervals();
      const chunks = chunksRef.current;
      const actualMime = recorder.mimeType || mimeTypeRef.current || "audio/webm";
      const finalBlob = new Blob(chunks, { type: actualMime });
      if (finalBlob.size === 0) {
        releaseStream();
        setError("No audio was recorded. Please check your microphone and try again.");
        setState("error");
        return;
      }
      setBlob(finalBlob);
      releaseStream();
      setState("stopped");
    };

    try {
      // Collect chunks every 250ms for smooth emission
      recorder.start(250);
    } catch (startErr: any) {
      stopIntervals();
      releaseStream();
      setError(startErr?.message || "Failed to start recording.");
      setState("error");
    }
  }, [discard, releaseStream, resume, startTimer, startWaveform, stopIntervals]);

  return {
    state,
    durationSeconds,
    waveformPeaks,
    blob,
    mimeType,
    error,
    start,
    pause,
    resume,
    stop,
    discard,
  };
}
