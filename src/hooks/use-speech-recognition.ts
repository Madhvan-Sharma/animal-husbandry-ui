"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor;
    webkitSpeechRecognition: SpeechRecognitionConstructor;
  }
}

interface UseSpeechRecognitionOptions {
  continuous?: boolean;
  interimResults?: boolean;
  lang?: string;
  autoStart?: boolean;
}

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const {
    continuous = false,
    interimResults = true,
    lang = "en-US",
    autoStart = false,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");
  const listeningRef = useRef(false);

  useEffect(() => {
    listeningRef.current = isListening;
  }, [isListening]);

  // Check browser support
  useEffect(() => {
    const secureContext = typeof window !== "undefined" ? window.isSecureContext : false;
    const hostname =
      typeof window !== "undefined" ? window.location.hostname : "unknown";
    const isLocalhostLike = hostname === "localhost" || hostname === "127.0.0.1";

    if (!secureContext && !isLocalhostLike) {
      setIsSupported(false);
      setError(
        "Speech recognition requires a secure context (https). Your site is currently running over http, so STT may not work. You can use typing instead."
      );
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);

    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = continuous;
      recognition.interimResults = interimResults;
      recognition.lang = lang;

      recognition.onstart = () => {
        setIsListening(true);
        setError(null);
        finalTranscriptRef.current = "";
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript + " ";
          } else {
            interim += transcript;
          }
        }

        if (final) {
          finalTranscriptRef.current += final;
          setTranscript(finalTranscriptRef.current);
          setInterimTranscript("");
        } else {
          setInterimTranscript(interim);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        setIsListening(false);
        let errorMessage = "Speech recognition error occurred.";

        switch (event.error) {
          case "no-speech":
            errorMessage = "No speech detected. Please try again.";
            break;
          case "audio-capture":
            errorMessage = "No microphone found. Please check your microphone settings.";
            break;
          case "not-allowed":
            errorMessage = "Microphone permission denied. Please allow microphone access.";
            break;
          case "network":
            {
              const online = typeof navigator !== "undefined" ? navigator.onLine : true;
              const secure = typeof window !== "undefined" ? window.isSecureContext : false;
              const onlinePart = online
                ? "Your device looks online, but the speech service couldn’t be reached."
                : "Your device appears offline (navigator.onLine=false).";
              const securePart = secure
                ? ""
                : " Note: speech recognition often requires a secure context (https or localhost).";
              errorMessage =
                `${onlinePart} Check VPN/proxy/ad-block/firewall settings and try again.${securePart} You can also type your message instead.`;
            }
            break;
          case "aborted":
            // User or system aborted, don't show error
            return;
          default:
            errorMessage = `Speech recognition error: ${event.error}`;
        }

        setError(errorMessage);
      };

      recognition.onend = () => {
        setIsListening(false);
        // Auto-restart if continuous mode is enabled
        if (continuous && finalTranscriptRef.current) {
          // Small delay before restarting to avoid immediate restart
          setTimeout(() => {
            if (recognitionRef.current && !listeningRef.current) {
              try {
                recognitionRef.current.start();
              } catch {
                // Ignore errors when trying to restart
              }
            }
          }, 100);
        }
      };

      recognitionRef.current = recognition;
    } catch {
      setError("Failed to initialize speech recognition.");
      setIsSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore errors during cleanup
        }
        recognitionRef.current = null;
      }
    };
  }, [continuous, interimResults, lang]);

  const startListening = useCallback(() => {
    if (!isSupported || !recognitionRef.current) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      return;
    }

    try {
      finalTranscriptRef.current = "";
      setTranscript("");
      setInterimTranscript("");
      setError(null);
      recognitionRef.current.start();
    } catch (error: unknown) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to start speech recognition.",
      );
    }
  }, [isSupported, isListening]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current || !isListening) {
      return;
    }

    try {
      recognitionRef.current.stop();
    } catch {
      // Ignore errors when stopping
    }
  }, [isListening]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
    finalTranscriptRef.current = "";
  }, []);

  // Auto-start if enabled
  useEffect(() => {
    if (autoStart && isSupported && recognitionRef.current && !isListening) {
      startListening();
    }
  }, [autoStart, isSupported, isListening, startListening]);

  return {
    isListening,
    transcript,
    interimTranscript,
    error,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  };
}
