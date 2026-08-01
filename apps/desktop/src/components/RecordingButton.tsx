import { CircleNotch, Microphone, Stop, Waveform } from "@phosphor-icons/react";
import { useRef } from "react";

export type RecordingButtonVariant = "mini" | "normal";
export type RecordingPhase =
  | "idle"
  | "preparing"
  | "recording"
  | "stopping"
  | "processing"
  | "error";

export interface RecordingButtonProps {
  variant?: RecordingButtonVariant;
  prominent?: boolean;
  phase: RecordingPhase;
  elapsedSeconds?: number;
  message?: string;
  disabled?: boolean;
  onStart: () => void | Promise<void>;
  onStop: () => void | Promise<void>;
}

const holdThresholdMs = 350;

export function RecordingButton({
  variant = "normal",
  prominent = false,
  phase,
  elapsedSeconds = 0,
  message = "",
  disabled = false,
  onStart,
  onStop,
}: RecordingButtonProps) {
  const pressStartedAt = useRef<number | null>(null);
  const startedThisPress = useRef(false);
  const stoppedThisPress = useRef(false);
  const isActive = phase === "preparing" || phase === "recording";
  const isUnavailable = disabled || phase === "stopping" || phase === "processing";
  const formattedTime = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`;

  const startPress = (timestamp: number) => {
    if (isUnavailable) return;
    pressStartedAt.current = timestamp;
    stoppedThisPress.current = false;
    if (isActive) {
      stoppedThisPress.current = true;
      startedThisPress.current = false;
      void onStop();
      return;
    }
    startedThisPress.current = true;
    void onStart();
  };

  const finishPress = (timestamp: number, cancelled = false) => {
    if (stoppedThisPress.current) {
      pressStartedAt.current = null;
      stoppedThisPress.current = false;
      return;
    }
    const startedAt = pressStartedAt.current;
    const shouldStop =
      startedThisPress.current &&
      (cancelled || (startedAt !== null && timestamp - startedAt >= holdThresholdMs));
    pressStartedAt.current = null;
    startedThisPress.current = false;
    if (shouldStop) void onStop();
  };

  const normalLabel =
    phase === "preparing"
      ? "Preparing microphone"
      : phase === "recording"
        ? "Recording on device"
        : phase === "stopping"
          ? "Finishing recording"
          : phase === "processing"
            ? "Saving and transcribing"
            : phase === "error"
              ? "Recording needs attention"
              : "Hold briefly or tap to record";
  const miniLabel =
    phase === "preparing"
      ? "Preparing"
      : phase === "recording"
        ? "Recording"
        : phase === "stopping"
          ? "Finishing"
          : phase === "processing"
            ? "Processing"
            : phase === "error"
              ? "Needs attention"
              : "Record a thought";
  const label = variant === "mini" ? miniLabel : normalLabel;
  const hint =
    phase === "recording"
      ? "Release after a hold, or tap to stop"
      : phase === "preparing"
        ? "Opening the microphone locally…"
        : phase === "stopping"
          ? "Saving the original audio first…"
          : phase === "processing"
            ? "Your audio is safe on this Mac"
            : phase === "error"
              ? message || "Try recording again."
              : "Hold for a quick thought · tap for a longer one";

  return (
    <button
      type="button"
      className={`recording-button recording-button--${variant} ${prominent ? "prominent" : ""} ${phase === "recording" ? "recording" : ""} ${phase === "error" ? "error" : ""}`}
      aria-label={`${label}. ${hint}`}
      aria-pressed={isActive}
      aria-busy={["preparing", "stopping", "processing"].includes(phase)}
      aria-disabled={isUnavailable}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        startPress(event.timeStamp);
      }}
      onPointerUp={(event) => finishPress(event.timeStamp)}
      onPointerCancel={(event) => finishPress(event.timeStamp, true)}
      onKeyDown={(event) => {
        if (event.repeat || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        startPress(event.timeStamp);
      }}
      onKeyUp={(event) => {
        if (event.key !== " ") return;
        event.preventDefault();
        finishPress(event.timeStamp);
      }}
      onClick={(event) => event.preventDefault()}
    >
      <span className="recording-button__icon" aria-hidden="true">
        {phase === "preparing" || phase === "processing" ? (
          <CircleNotch className="spin" weight="bold" />
        ) : phase === "recording" ? (
          <Waveform weight="bold" />
        ) : phase === "stopping" ? (
          <Stop weight="fill" />
        ) : (
          <Microphone weight="fill" />
        )}
      </span>
      <span className="recording-button__copy">
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <span className="recording-button__timer" aria-hidden={phase !== "recording"}>
        {phase === "recording" ? formattedTime : ""}
      </span>
    </button>
  );
}
