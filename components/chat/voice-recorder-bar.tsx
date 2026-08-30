"use client";

import * as React from "react";
import { Mic, Square, Pause, Play, Trash2, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VoiceRecorderResult } from "@/hooks/use-voice-recorder";

interface VoiceRecorderBarProps {
  recorder: VoiceRecorderResult;
  /** Called when the user confirms sending the finished recording */
  onSend: (blob: Blob, mimeType: string, durationSeconds: number) => void;
  /** Called when the user cancels/discards */
  onDiscard: () => void;
  disabled?: boolean;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const WAVEFORM_BARS = 40;

export function VoiceRecorderBar({
  recorder,
  onSend,
  onDiscard,
  disabled = false,
}: VoiceRecorderBarProps) {
  const { state, durationSeconds, waveformPeaks, blob, mimeType, error } = recorder;

  const handleSend = () => {
    if (blob && state === "stopped") {
      onSend(blob, mimeType, Math.round(durationSeconds));
    }
  };

  const isRecording = state === "recording";
  const isPaused = state === "paused";
  const isStopped = state === "stopped";
  const isRequesting = state === "requesting";

  // Build display peaks: pad or truncate to WAVEFORM_BARS
  const displayPeaks = React.useMemo(() => {
    const peaks = [...waveformPeaks];
    while (peaks.length < WAVEFORM_BARS) peaks.unshift(0);
    return peaks.slice(peaks.length - WAVEFORM_BARS);
  }, [waveformPeaks]);

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-900/80 border-t border-zinc-200 dark:border-zinc-800 rounded-b-xl">
      {/* Discard */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onDiscard}
        disabled={disabled || isRequesting}
        aria-label="Discard recording"
        className="shrink-0 text-zinc-400 hover:text-red-500 h-8 w-8"
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      {/* Waveform + duration */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        {/* Animated recording indicator */}
        {(isRecording || isPaused) && (
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${
              isRecording
                ? "bg-red-500 animate-pulse"
                : "bg-zinc-400"
            }`}
            aria-label={isRecording ? "Recording" : "Paused"}
          />
        )}

        {/* Waveform bars */}
        <div
          className="flex items-end gap-px h-6 flex-1 min-w-0 overflow-hidden"
          aria-hidden="true"
        >
          {displayPeaks.map((peak, i) => (
            <div
              key={i}
              className={`w-px rounded-full transition-all duration-75 ${
                isRecording
                  ? "bg-heat-500"
                  : isStopped
                  ? "bg-heat-400"
                  : "bg-zinc-400"
              }`}
              style={{
                height: `${Math.max(2, Math.round(peak * 24))}px`,
                flexShrink: 0,
                flexGrow: 1,
              }}
            />
          ))}
        </div>

        {/* Duration */}
        <span
          className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0 min-w-[36px]"
          aria-label={`Duration: ${formatDuration(durationSeconds)}`}
        >
          {formatDuration(durationSeconds)}
        </span>
      </div>

      {/* Requesting mic indicator */}
      {isRequesting && (
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400 shrink-0" />
      )}

      {/* Error */}
      {state === "error" && error && (
        <p className="text-xs text-red-500 max-w-[160px] truncate" title={error}>
          {error}
        </p>
      )}

      {/* Controls: Pause/Resume | Stop | Send */}
      {(isRecording || isPaused) && (
        <Button
          variant="ghost"
          size="icon"
          onClick={isRecording ? recorder.pause : recorder.resume}
          disabled={disabled}
          aria-label={isRecording ? "Pause recording" : "Resume recording"}
          className="shrink-0 h-8 w-8 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          {isRecording ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
      )}

      {(isRecording || isPaused) && (
        <Button
          variant="ghost"
          size="icon"
          onClick={recorder.stop}
          disabled={disabled}
          aria-label="Stop recording"
          className="shrink-0 h-8 w-8 text-red-500 hover:text-red-600"
        >
          <Square className="h-4 w-4 fill-current" />
        </Button>
      )}

      {isStopped && (
        <Button
          onClick={handleSend}
          disabled={disabled || !blob}
          size="icon"
          aria-label="Send voice message"
          className="shrink-0 h-8 w-8 bg-heat-500 hover:bg-heat-600 text-white rounded-full"
        >
          <Send className="h-4 w-4" />
        </Button>
      )}

      {/* Mic icon for idle/error */}
      {(state === "idle" || state === "error") && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => recorder.start()}
          disabled={disabled}
          aria-label="Start recording"
          className="shrink-0 h-8 w-8 text-heat-500"
        >
          <Mic className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
