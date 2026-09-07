"use client";

import * as React from "react";
import { Play, Pause, Volume2, VolumeX, Mic, Music, Loader2, AlertCircle } from "lucide-react";

export interface VoiceMessagePlayerProps {
  src: string;
  durationSeconds?: number | null;
  fileName?: string;
  isVoice?: boolean;
  isCurrentUser?: boolean;
}

function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || isNaN(totalSeconds) || !isFinite(totalSeconds)) {
    return "0:00";
  }
  const s = Math.floor(totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function VoiceMessagePlayer({
  src,
  durationSeconds,
  fileName,
  isVoice = true,
  isCurrentUser = false,
}: VoiceMessagePlayerProps) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState<number>(durationSeconds || 0);
  const [isMuted, setIsMuted] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [hasError, setHasError] = React.useState(false);

  // Update duration if durationSeconds prop changes
  React.useEffect(() => {
    if (durationSeconds && durationSeconds > 0) {
      setDuration(durationSeconds);
    }
  }, [durationSeconds]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || hasError) return;

    if (isPlaying) {
      audio.pause();
    } else {
      try {
        await audio.play();
      } catch {
        setIsPlaying(false);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (audio) {
      setCurrentTime(audio.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    setIsLoading(false);
    if (audio && audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
      setDuration(audio.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };

  const effectiveDuration = duration > 0 ? duration : durationSeconds || 0;
  const progressPercent = effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;
  const displayLabel = isVoice ? "Voice message" : fileName || "Audio clip";

  return (
    <div
      className="mt-1.5 w-full max-w-full min-w-0 rounded-xl bg-zinc-100/90 dark:bg-zinc-800/90 p-2.5 sm:p-3 text-zinc-900 dark:text-zinc-100 shadow-2xs border border-zinc-200/50 dark:border-zinc-700/50"
      role="region"
      aria-label={`${displayLabel} audio player`}
    >
      {/* Hidden native audio element */}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={() => setIsLoading(false)}
        onEnded={handleEnded}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
        className="hidden"
      />

      {/* Header row: Icon + Label + Duration */}
      <div className="flex items-center gap-1.5 sm:gap-2 mb-2 min-w-0">
        {isVoice ? (
          <Mic className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-heat-500 shrink-0" aria-hidden="true" />
        ) : (
          <Music className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-heat-500 shrink-0" aria-hidden="true" />
        )}
        <span className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0 text-zinc-800 dark:text-zinc-200">
          {displayLabel}
        </span>
        <span
          className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 tabular-nums shrink-0 font-medium"
          aria-label={`Total duration: ${formatDuration(effectiveDuration)}`}
        >
          {formatDuration(effectiveDuration)}
        </span>
      </div>

      {/* Controls row: Play/Pause | Current Time | Fluid Scrubber | Volume */}
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={togglePlay}
          disabled={hasError}
          aria-label={isPlaying ? "Pause audio" : "Play audio"}
          className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full bg-heat-500 hover:bg-heat-600 active:scale-95 text-white shadow-xs transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : hasError ? (
            <AlertCircle className="h-3.5 w-3.5 text-white" />
          ) : isPlaying ? (
            <Pause className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current translate-x-0.5" />
          )}
        </button>

        {/* Current Time display */}
        <span
          className="text-[11px] sm:text-xs font-semibold tabular-nums text-zinc-600 dark:text-zinc-300 shrink-0 min-w-[28px] select-none"
          aria-label={`Current position: ${formatDuration(currentTime)}`}
        >
          {formatDuration(currentTime)}
        </span>

        {/* Fluid Seek Bar */}
        <div className="relative flex-1 min-w-0 flex items-center h-6">
          <input
            type="range"
            min={0}
            max={effectiveDuration || 1}
            step={0.05}
            value={currentTime}
            onChange={handleSeek}
            disabled={hasError || effectiveDuration <= 0}
            aria-label="Seek timeline"
            aria-valuemin={0}
            aria-valuemax={effectiveDuration || 1}
            aria-valuenow={currentTime}
            aria-valuetext={`${formatDuration(currentTime)} of ${formatDuration(effectiveDuration)}`}
            className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-heat-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 disabled:opacity-40"
            style={{
              background: `linear-gradient(to right, rgb(249 115 22) ${progressPercent}%, rgb(228 228 231) ${progressPercent}%)`,
            }}
          />
        </div>

        {/* Volume / Mute Button */}
        <button
          type="button"
          onClick={toggleMute}
          disabled={hasError}
          aria-label={isMuted ? "Unmute audio" : "Mute audio"}
          className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500"
        >
          {isMuted ? (
            <VolumeX className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          ) : (
            <Volume2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
