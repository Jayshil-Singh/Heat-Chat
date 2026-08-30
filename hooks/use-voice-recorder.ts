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

const SUPPORTED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
];

function getBestMimeType(): string {
  if (typeof window === "undefined" || !window.MediaRecorder) return "audio/webm";
  for (const type of SUPPORTED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
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
  const [mimeType] = React.useState(() => getBestMimeType());

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const durationIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const waveformIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = React.useRef(0);

  const stopIntervals = () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (waveformIntervalRef.current) {
      clearInterval(waveformIntervalRef.current);
      waveformIntervalRef.current = null;
    }
  };

  const releaseStream = () => {
    stopIntervals();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    mediaRecorderRef.current = null;
  };

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      releaseStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startIntervals = () => {
    // Duration ticker
    durationIntervalRef.current = setInterval(() => {
      durationRef.current += 0.1;
      setDurationSeconds(Math.round(durationRef.current * 10) / 10);
      if (durationRef.current >= MAX_DURATION_SECONDS) {
        stop();
      }
    }, 100);

    // Waveform sampler
    const dataArray = analyserRef.current
      ? new Uint8Array(analyserRef.current.frequencyBinCount)
      : null;

    waveformIntervalRef.current = setInterval(() => {
      if (!analyserRef.current || !dataArray) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      // Average across bass + mid-range frequencies
      const slice = dataArray.slice(0, 64);
      const avg = slice.reduce((s, v) => s + v, 0) / slice.length / 255;
      setWaveformPeaks((prev) => {
        const next = [...prev, avg];
        return next.length > MAX_PEAKS ? next.slice(next.length - MAX_PEAKS) : next;
      });
    }, SAMPLE_INTERVAL_MS);
  };

  const start = async () => {
    if (state === "recording") return;

    // Resume from paused
    if (state === "paused" && mediaRecorderRef.current) {
      mediaRecorderRef.current.resume();
      setState("recording");
      startIntervals();
      return;
    }

    setState("requesting");
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      // Set up Web Audio for waveform analysis
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      chunksRef.current = [];
      durationRef.current = 0;
      setDurationSeconds(0);
      setWaveformPeaks([]);
      setBlob(null);

      const options = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const finalBlob = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });
        setBlob(finalBlob);
        releaseStream();
        setState("stopped");
      };

      recorder.start(100); // collect chunks every 100ms
      setState("recording");
      startIntervals();
    } catch (err: any) {
      releaseStream();
      const msg =
        err?.name === "NotAllowedError"
          ? "Microphone access was denied. Please allow microphone permissions and try again."
          : err?.name === "NotFoundError"
          ? "No microphone found. Please connect a microphone."
          : err?.message || "Failed to start recording.";
      setError(msg);
      setState("error");
    }
  };

  const pause = () => {
    if (state !== "recording" || !mediaRecorderRef.current) return;
    mediaRecorderRef.current.pause();
    stopIntervals();
    setState("paused");
  };

  const resume = () => {
    if (state !== "paused" || !mediaRecorderRef.current) return;
    mediaRecorderRef.current.resume();
    setState("recording");
    startIntervals();
  };

  const stop = () => {
    if (!mediaRecorderRef.current) return;
    if (
      mediaRecorderRef.current.state === "recording" ||
      mediaRecorderRef.current.state === "paused"
    ) {
      stopIntervals();
      mediaRecorderRef.current.stop();
    }
  };

  const discard = () => {
    if (mediaRecorderRef.current) {
      try {
        if (
          mediaRecorderRef.current.state === "recording" ||
          mediaRecorderRef.current.state === "paused"
        ) {
          mediaRecorderRef.current.stop();
        }
      } catch {}
    }
    releaseStream();
    chunksRef.current = [];
    durationRef.current = 0;
    setDurationSeconds(0);
    setWaveformPeaks([]);
    setBlob(null);
    setError(null);
    setState("idle");
  };

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
