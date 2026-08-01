const mimeCandidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

export interface AudioCapability {
  supported: boolean;
  hasMediaDevices: boolean;
  hasGetUserMedia: boolean;
  hasMediaRecorder: boolean;
  hasWebAudio: boolean;
  secureContext: boolean;
}

export interface MicrophoneAccessResult {
  state: "granted" | "denied" | "unsupported";
  capability: AudioCapability;
  message: string;
}

export interface AudioCaptureHandle {
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
  abort(): void | Promise<void>;
}

interface AudioCaptureCallbacks {
  onStopped: (blob: Blob) => void | Promise<void>;
  onSnapshot?: (blob: Blob) => void | Promise<void>;
  onError?: (error: unknown) => void;
}

function supportedMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return mimeCandidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

export function getAudioCapability(): AudioCapability {
  const hasMediaDevices = Boolean(navigator.mediaDevices);
  const hasGetUserMedia = Boolean(navigator.mediaDevices?.getUserMedia);
  const hasMediaRecorder = typeof MediaRecorder !== "undefined";
  const hasWebAudio = Boolean(window.AudioContext || window.webkitAudioContext);
  return {
    supported: hasGetUserMedia && (hasMediaRecorder || hasWebAudio),
    hasMediaDevices,
    hasGetUserMedia,
    hasMediaRecorder,
    hasWebAudio,
    secureContext: window.isSecureContext,
  };
}

export async function requestMicrophoneAccess(): Promise<MicrophoneAccessResult> {
  const capability = getAudioCapability();
  if (!capability.hasGetUserMedia) {
    return { state: "unsupported", capability, message: "This runtime does not expose microphone capture. Use the native desktop app to record." };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    if (!capability.hasMediaRecorder && !capability.hasWebAudio) {
      return { state: "unsupported", capability, message: "Microphone access is available, but this runtime has no compatible audio encoder." };
    }
    return { state: "granted", capability, message: "Microphone access granted. Burrowise records only while a capture control visibly shows that it is active." };
  } catch (error) {
    const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
    return {
      state: denied ? "denied" : "unsupported",
      capability,
      message: denied ? "Microphone access was not granted. You can enable it later in System Settings." : (error instanceof Error ? error.message : "The microphone could not be opened."),
    };
  }
}

function encodeWave(chunks: Float32Array[], sampleRate: number): Blob {
  const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, sampleCount * 2, true);
  let offset = 44;
  chunks.forEach((chunk) => chunk.forEach((sample) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }));
  return new Blob([buffer], { type: "audio/wav" });
}

async function createWebAudioCapture(stream: MediaStream, { onStopped, onSnapshot, onError }: AudioCaptureCallbacks): Promise<AudioCaptureHandle> {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Web Audio is unavailable in this runtime.");
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let processor: ScriptProcessorNode | null = null;
  const chunks: Float32Array[] = [];
  let started = false;
  let finished = false;
  let nextSnapshotSamples = 0;
  let snapshotRunning = false;

  const close = async () => {
    processor?.disconnect();
    source?.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    if (context && context.state !== "closed") await context.close();
  };

  return {
    async start() {
      if (started || finished) return;
      context = new AudioContextClass();
      await context.resume();
      source = context.createMediaStreamSource(stream);
      processor = context.createScriptProcessor(4096, 1, 1);
      nextSnapshotSamples = context.sampleRate * 3;
      let recordedSamples = 0;
      processor.addEventListener("audioprocess", (event) => {
        const chunk = new Float32Array(event.inputBuffer.getChannelData(0));
        chunks.push(chunk);
        recordedSamples += chunk.length;
        if (onSnapshot && recordedSamples >= nextSnapshotSamples && !snapshotRunning) {
          nextSnapshotSamples = recordedSamples + context!.sampleRate * 3;
          snapshotRunning = true;
          Promise.resolve(onSnapshot(encodeWave([...chunks], context!.sampleRate)))
            .catch(() => undefined)
            .finally(() => { snapshotRunning = false; });
        }
      });
      source.connect(processor);
      processor.connect(context.destination);
      started = true;
    },
    async stop() {
      if (finished) return;
      finished = true;
      if (!started || !context) {
        await close();
        return;
      }
      const sampleRate = context.sampleRate;
      await close();
      try {
        await onStopped(encodeWave(chunks, sampleRate));
      } catch (error) {
        onError?.(error);
      }
    },
    async abort() {
      if (finished) return;
      finished = true;
      await close();
    },
  };
}

export async function createAudioCapture({ onStopped, onSnapshot, onError }: AudioCaptureCallbacks): Promise<AudioCaptureHandle> {
  const capability = getAudioCapability();
  if (!capability.hasGetUserMedia) {
    throw new Error("Microphone capture is unavailable in this runtime. Open the native desktop app or grant access during onboarding.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
  });
  // PCM WAV is intentionally preferred when Web Audio is available. It is larger
  // than compressed MediaRecorder output, but Apple Speech can consume it
  // reliably and the original recording remains an ordinary, portable file.
  if (capability.hasWebAudio) {
    return createWebAudioCapture(stream, { onStopped, onSnapshot, onError });
  }
  if (typeof MediaRecorder === "undefined") {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("Microphone access is available, but no compatible audio recorder is installed in this runtime.");
  }
  const mimeType = supportedMimeType();
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks: Blob[] = [];
  let dataEvents = 0;
  let snapshotRunning = false;
  let started = false;
  let finished = false;
  let aborted = false;
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
      dataEvents += 1;
      if (onSnapshot && dataEvents % 12 === 0 && !snapshotRunning) {
        snapshotRunning = true;
        Promise.resolve(onSnapshot(new Blob([...chunks], { type: recorder.mimeType || mimeType || "audio/webm" })))
          .catch(() => undefined)
          .finally(() => { snapshotRunning = false; });
      }
    }
  });
  recorder.addEventListener("error", (event) => {
    const recorderError = (event as Event & { error?: DOMException }).error;
    onError?.(recorderError || new Error("Recording failed."));
  });
  recorder.addEventListener("stop", async () => {
    stream.getTracks().forEach((track) => track.stop());
    if (aborted) return;
    try {
      await onStopped(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }));
    } catch (error) {
      onError?.(error);
    }
  });
  return {
    start() {
      if (started || finished) return;
      recorder.start(250);
      started = true;
    },
    stop() {
      if (finished) return;
      finished = true;
      if (started && recorder.state !== "inactive") recorder.stop();
      else stream.getTracks().forEach((track) => track.stop());
    },
    abort() {
      if (finished) return;
      finished = true;
      aborted = true;
      if (started && recorder.state !== "inactive") recorder.stop();
      else stream.getTracks().forEach((track) => track.stop());
    },
  };
}
