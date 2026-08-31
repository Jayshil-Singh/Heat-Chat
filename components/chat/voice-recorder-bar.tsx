"use client";

import * as React from "react";
import {
  Square,
  Pause,
  Play,
  Trash2,
  Send,
  Loader2,
  RotateCcw,
  MicOff,
} from "lucide-react";
import type { VoiceRecorderResult } from "@/hooks/use-voice-recorder";

// ─── Props ───────────────────────────────────────────────────────────────────

interface VoiceRecorderBarProps {
  recorder: VoiceRecorderResult;
  /** Called when the user confirms sending the finished recording */
  onSend: (blob: Blob, mimeType: string, durationSeconds: number) => void;
  /** Called when the user discards / cancels */
  onDiscard: () => void;
  disabled?: boolean;
  /** Upload state driven by the parent (message-composer) */
  uploadState?: "idle" | "uploading" | "failed";
  uploadError?: string;
  /** Called when the user taps Retry after an upload failure */
  onRetry?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(totalSeconds: number): string {
  const s = Math.floor(totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

const WAVEFORM_BARS = 38;

// ─── Shared button base classes ───────────────────────────────────────────────

const iconBtn =
  "h-11 w-11 shrink-0 flex items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 disabled:opacity-40 disabled:cursor-not-allowed";

// ─── Component ───────────────────────────────────────────────────────────────

export function VoiceRecorderBar({
  recorder,
  onSend,
  onDiscard,
  disabled = false,
  uploadState = "idle",
  uploadError,
  onRetry,
}: VoiceRecorderBarProps) {
  const { state, durationSeconds, waveformPeaks, blob, mimeType, error } =
    recorder;

  // ── Audio element for preview playback ─────────────────────────────────────
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = React.useRef<string | null>(null);
  const frozenDuration = React.useRef(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [playbackSecs, setPlaybackSecs] = React.useState(0);

  // When the recorder stops, lock in the duration and wire up the blob URL
  React.useEffect(() => {
    if (state === "stopped" && blob) {
      frozenDuration.current = durationSeconds;
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.src = blobUrlRef.current;
        audioRef.current.load();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, blob]);

  // Release blob URL on unmount
  React.useEffect(() => {
    // Capture the ref value so the cleanup closure holds a stable reference
    // (satisfies react-hooks/exhaustive-deps for ref.current in cleanup)
    const audioEl = audioRef.current;
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      audioEl?.pause();
    };
  }, []);

  const togglePlayback = () => {
    const el = audioRef.current;
    if (!el || !blobUrlRef.current) return;
    isPlaying ? el.pause() : el.play().catch(() => {});
  };

  // ── Derived booleans ────────────────────────────────────────────────────────
  const isRequesting = state === "requesting";
  const isRecording = state === "recording";
  const isPaused = state === "paused";
  const isStopped = state === "stopped";
  const isError = state === "error";
  const isUploading = uploadState === "uploading";
  const isUploadFailed = uploadState === "failed";

  // ── Waveform display peaks ──────────────────────────────────────────────────
  const displayPeaks = React.useMemo(() => {
    const peaks = [...waveformPeaks];
    while (peaks.length < WAVEFORM_BARS) peaks.unshift(0);
    return peaks.slice(peaks.length - WAVEFORM_BARS);
  }, [waveformPeaks]);

  // ── Timer value ─────────────────────────────────────────────────────────────
  const timerValue = isStopped
    ? isPlaying
      ? playbackSecs
      : frozenDuration.current || durationSeconds
    : durationSeconds;

  // ── Send handler ────────────────────────────────────────────────────────────
  const handleSend = () => {
    if (blob && isStopped) {
      onSend(blob, mimeType, Math.round(frozenDuration.current || durationSeconds));
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Hidden audio element for preview playback */}
      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setPlaybackSecs(0);
        }}
        onTimeUpdate={() => {
          if (audioRef.current) setPlaybackSecs(audioRef.current.currentTime);
        }}
        preload="auto"
        aria-hidden="true"
        className="hidden"
      />

      <div
        className="flex items-center gap-1.5 px-3 w-full min-w-0"
        style={{ paddingTop: "0.5rem", paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {/* ── LEFT: Discard ───────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={onDiscard}
          disabled={disabled || isRequesting || isUploading}
          aria-label="Discard recording"
          className={`${iconBtn} text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30`}
        >
          <Trash2 className="h-5 w-5" />
        </button>

        {/* ── CENTER: Status + Timer + Waveform ───────────────────────────── */}
        <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">

          {/* REQUESTING: spinner + label */}
          {isRequesting && (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-zinc-400 shrink-0" />
              <span className="text-sm text-zinc-500 dark:text-zinc-400 truncate select-none">
                Preparing microphone…
              </span>
            </>
          )}

          {/* ERROR: mic-off + message */}
          {isError && !isRequesting && (
            <>
              <MicOff className="h-4 w-4 text-red-500 shrink-0" />
              <span
                className="text-sm text-red-500 dark:text-red-400 truncate"
                role="alert"
              >
                {error || "Voice recording unavailable."}
              </span>
            </>
          )}

          {/* UPLOAD FAILED: error text */}
          {isUploadFailed && (
            <span
              className="text-sm text-red-500 dark:text-red-400 truncate"
              role="alert"
            >
              {uploadError || "Upload failed. Please retry."}
            </span>
          )}

          {/* UPLOADING: spinner + label */}
          {isUploading && (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-heat-500 shrink-0" />
              <span className="text-sm text-zinc-500 dark:text-zinc-400 truncate select-none">
                Sending…
              </span>
            </>
          )}

          {/* NORMAL STATES: recording / paused / stopped */}
          {!isRequesting && !isError && !isUploading && !isUploadFailed && (
            <>
              {/* Recording dot */}
              {(isRecording || isPaused) && (
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    isRecording
                      ? "bg-red-500 animate-pulse"
                      : "bg-zinc-400 dark:bg-zinc-500"
                  }`}
                  aria-hidden="true"
                />
              )}

              {/* PAUSED label */}
              {isPaused && (
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 shrink-0 select-none">
                  Paused
                </span>
              )}

              {/* STOPPED: inline play/pause button */}
              {isStopped && (
                <button
                  type="button"
                  onClick={togglePlayback}
                  disabled={disabled || !blob}
                  aria-label={isPlaying ? "Pause playback" : "Play voice message"}
                  className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-heat-100 hover:bg-heat-200 dark:bg-heat-950/50 dark:hover:bg-heat-950/80 text-heat-600 dark:text-heat-400 transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500"
                >
                  {isPlaying ? (
                    <Pause className="h-3.5 w-3.5 fill-current" />
                  ) : (
                    <Play className="h-3.5 w-3.5 fill-current translate-x-px" />
                  )}
                </button>
              )}

              {/* Timer */}
              <span
                className="text-xs font-semibold tabular-nums text-zinc-600 dark:text-zinc-300 shrink-0 min-w-[38px] select-none"
                aria-label={`Duration: ${formatDuration(timerValue)}`}
                aria-live={isRecording ? "off" : undefined}
              >
                {formatDuration(timerValue)}
              </span>

              {/* Waveform — flex-1, min-w-0, overflow-hidden so it never pushes buttons off */}
              <div
                className="flex items-center gap-px h-7 flex-1 min-w-0 overflow-hidden"
                aria-hidden="true"
              >
                {displayPeaks.map((peak, i) => (
                  <div
                    key={i}
                    className={`rounded-full transition-all duration-75 ${
                      isRecording
                        ? "bg-heat-500"
                        : isPaused
                        ? "bg-zinc-400 dark:bg-zinc-600"
                        : isStopped
                        ? "bg-heat-400/80"
                        : "bg-zinc-300 dark:bg-zinc-700"
                    }`}
                    style={{
                      width: "2px",
                      flexShrink: 0,
                      flexGrow: 1,
                      maxWidth: "5px",
                      height: `${Math.max(3, Math.round(peak * 26))}px`,
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT: Action buttons ────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center gap-1">

          {/* Error state: Retry mic */}
          {isError && (
            <button
              type="button"
              onClick={() => recorder.start()}
              disabled={disabled}
              aria-label="Retry recording"
              className={`${iconBtn} text-zinc-500 hover:text-heat-600 hover:bg-heat-50 dark:hover:bg-zinc-800`}
            >
              <RotateCcw className="h-5 w-5" />
            </button>
          )}

          {/* Upload failed: Retry */}
          {isUploadFailed && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={disabled}
              aria-label="Retry sending voice message"
              className="h-11 px-3 shrink-0 flex items-center justify-center rounded-full text-sm font-medium text-heat-600 dark:text-heat-400 hover:bg-heat-50 dark:hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500"
            >
              Retry
            </button>
          )}

          {/* RECORDING: Pause button */}
          {isRecording && (
            <button
              type="button"
              onClick={recorder.pause}
              disabled={disabled}
              aria-label="Pause recording"
              className={`${iconBtn} text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800`}
            >
              <Pause className="h-5 w-5" />
            </button>
          )}

          {/* PAUSED: Resume button */}
          {isPaused && (
            <button
              type="button"
              onClick={recorder.resume}
              disabled={disabled}
              aria-label="Resume recording"
              className={`${iconBtn} text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800`}
            >
              <Play className="h-5 w-5 fill-current translate-x-px" />
            </button>
          )}

          {/* RECORDING / PAUSED: Stop button */}
          {(isRecording || isPaused) && (
            <button
              type="button"
              onClick={recorder.stop}
              disabled={disabled}
              aria-label="Stop recording"
              className={`${iconBtn} bg-red-500 hover:bg-red-600 text-white shadow-sm`}
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          )}

          {/* STOPPED + not uploading: Send button */}
          {isStopped && !isUploading && !isUploadFailed && (
            <button
              type="button"
              onClick={handleSend}
              disabled={disabled || !blob}
              aria-label="Send voice message"
              className={`${iconBtn} bg-heat-500 hover:bg-heat-600 text-white shadow-sm`}
            >
              <Send className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
