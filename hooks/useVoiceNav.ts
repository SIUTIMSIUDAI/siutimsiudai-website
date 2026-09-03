import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { Locale } from "@/types";
import { matchVoiceCommand, VOICE_HINT_WORDS, VoiceCommand } from "@/utils/voiceCommands";

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
  // True once the current utterance has already fired a command, so later interim/final results for the
  // same phrase don't fire it twice. Cleared at the start of every fresh listen in begin().
  const firedRef = useRef(false);

  const begin = useCallback(() => {
    const cantonese = localeRef.current === "zh-Hant";
    // Every fresh listen starts able to fire again (see firedRef).
    firedRef.current = false;
    try {
      ExpoSpeechRecognitionModule.start({
        lang: cantonese ? "zh-HK" : "en-US",
        // Interim results let the result handler act the moment a command word is heard, rather than
        // waiting for the recogniser to declare the whole phrase final on a trailing silence. That wait
        // was the multi-second lag before the step turned.
        interimResults: true,
        continuous: false,
        // On-device recognition drops the network round-trip to Apple's servers, so English commands
        // resolve near-instantly and keep working offline. Cantonese (zh-HK) has no guaranteed on-device
        // model, so it stays on the network path rather than risking a "language-not-supported" failure.
        requiresOnDeviceRecognition: !cantonese,
        // Prime the recogniser with the navigation vocabulary so a quiet or clipped command still
        // registers instead of competing with the whole dictionary.
        contextualStrings: VOICE_HINT_WORDS,
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
    // Act on the first result (interim or final) that carries a command word, so navigation happens the
    // instant the word is recognised. firedRef stops the same utterance firing twice as further interim
    // or final results arrive; begin() clears it before the next listen.
    if (firedRef.current) return;
    const transcript = event.results?.[0]?.transcript ?? "";
    const command = matchVoiceCommand(transcript);
    if (!command) return;
    firedRef.current = true;
    onCommandRef.current(command);
    // Cut the current recognition short so the next command starts from a clean utterance instead of
    // trailing audio; the `end` handler then restarts the listen loop.
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // Nothing running; the end/restart loop recovers.
    }
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
