import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { Locale } from "@/types";
import { matchVoiceCommand, VoiceCommand } from "@/utils/voiceCommands";

// Coarse on purpose: the cook screen only needs to tell the user "grant it in Settings" (permission)
// apart from "this device can't do it" (unavailable). Every transient recogniser hiccup (no-speech,
// network blip, busy) is swallowed and the listen loop just restarts.
export type VoiceNavError = "permission" | "unavailable";

interface UseVoiceNavArgs {
  // App locale, used to pick the recogniser language (zh-Hant -> Cantonese zh-HK, else en-US).
  locale: Locale;
  // Fired once per recognised phrase with the navigation intent. The screen wires this to next/back.
  onCommand: (command: VoiceCommand) => void;
}

export interface VoiceNav {
  // Whether this device/build can recognise speech at all. The screen hides the button when false.
  supported: boolean;
  // Whether a listening session is currently active (drives the button's live state).
  listening: boolean;
  // A user-facing failure to surface, or null. The screen maps this to localised copy.
  error: VoiceNavError | null;
  // Start listening if idle, stop if already listening.
  toggle: () => void;
}

/**
 * Hands-free navigation for Cook Mode. Runs the speech recogniser in single-utterance mode: it stops
 * after each spoken phrase (which clears the buffer), matches the transcript to a next/back intent,
 * and the `end` event restarts it so the user can keep giving commands without touching the screen.
 * All native calls are guarded so an unsupported platform degrades to a hidden button, never a crash.
 */
export function useVoiceNav({ locale, onCommand }: UseVoiceNavArgs): VoiceNav {
  const [supported] = useState(() => {
    try {
      return ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch {
      return false;
    }
  });
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<VoiceNavError | null>(null);

  // Refs let the native event listeners stay stable while always reading fresh values.
  const listeningRef = useRef(false);
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const onCommandRef = useRef(onCommand);
  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const begin = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.start({
        lang: localeRef.current === "zh-Hant" ? "zh-HK" : "en-US",
        interimResults: false,
        continuous: false,
        requiresOnDeviceRecognition: false,
      });
    } catch {
      listeningRef.current = false;
      setListening(false);
      setError("unavailable");
    }
  }, []);

  const start = useCallback(async () => {
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        listeningRef.current = false;
        setListening(false);
        setError("permission");
        return;
      }
      setError(null);
      begin();
    } catch {
      listeningRef.current = false;
      setListening(false);
      setError("unavailable");
    }
  }, [begin]);

  const stop = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    if (restartTimer.current) {
      clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // Nothing was running; ignore.
    }
  }, []);

  const toggle = useCallback(() => {
    if (listeningRef.current) {
      stop();
    } else {
      listeningRef.current = true;
      setListening(true);
      void start();
    }
  }, [start, stop]);

  useSpeechRecognitionEvent("result", (event) => {
    if (!event.isFinal) return;
    const transcript = event.results?.[0]?.transcript ?? "";
    const command = matchVoiceCommand(transcript);
    if (command) onCommandRef.current(command);
  });

  useSpeechRecognitionEvent("end", () => {
    // Single-utterance mode ends after each phrase; restart while the user still wants to listen.
    if (!listeningRef.current) return;
    restartTimer.current = setTimeout(() => {
      if (listeningRef.current) begin();
    }, 300);
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (event.error === "not-allowed") {
      listeningRef.current = false;
      setListening(false);
      setError("permission");
    } else if (event.error === "service-not-allowed" || event.error === "language-not-supported") {
      listeningRef.current = false;
      setListening(false);
      setError("unavailable");
    }
    // Everything else (no-speech, network, busy, aborted, ...) is transient: `end` restarts the loop.
  });

  // Stop and release the recogniser when the screen unmounts.
  useEffect(() => {
    return () => {
      listeningRef.current = false;
      if (restartTimer.current) clearTimeout(restartTimer.current);
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // ignore
      }
    };
  }, []);

  return { supported, listening, error, toggle };
}
