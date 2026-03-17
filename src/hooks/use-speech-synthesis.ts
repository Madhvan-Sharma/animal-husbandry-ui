"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface SpeechSynthesisVoice {
  default: boolean;
  lang: string;
  localService: boolean;
  name: string;
  voiceURI: string;
}

interface UseSpeechSynthesisOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  voice?: SpeechSynthesisVoice | null;
  lang?: string;
}

interface UseSpeechSynthesisReturn {
  isSpeaking: boolean;
  isPaused: boolean;
  voices: SpeechSynthesisVoice[];
  speak: (text: string, options?: UseSpeechSynthesisOptions) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  isSupported: boolean;
}

export function useSpeechSynthesis(
  options: UseSpeechSynthesisOptions = {}
): UseSpeechSynthesisReturn {
  const {
    rate = 0.9,
    pitch = 0.75,
    volume = 1,
    voice: defaultVoice,
    lang = "en-IN",
  } = options;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSupported, setIsSupported] = useState(false);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const speakingRef = useRef(false);

  useEffect(() => {
    speakingRef.current = isSpeaking;
  }, [isSpeaking]);

  // Initialize speech synthesis
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    synthRef.current = window.speechSynthesis;

    // Load voices
    const loadVoices = () => {
      if (synthRef.current) {
        const availableVoices = synthRef.current.getVoices();
        setVoices(availableVoices);
      }
    };

    // Voices may not be immediately available
    loadVoices();
    if (synthRef.current.onvoiceschanged !== undefined) {
      synthRef.current.onvoiceschanged = loadVoices;
    }

    // Handle page visibility - pause when tab is hidden
    const handleVisibilityChange = () => {
      if (document.hidden && speakingRef.current && synthRef.current) {
        synthRef.current.pause();
        setIsPaused(true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  const speak = useCallback(
    (text: string, overrideOptions: UseSpeechSynthesisOptions = {}) => {
      if (!isSupported || !synthRef.current) {
        return;
      }

      // Cancel any ongoing speech
      synthRef.current.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      const finalOptions = { ...options, ...overrideOptions };

      utterance.rate = finalOptions.rate ?? rate;
      utterance.pitch = finalOptions.pitch ?? pitch;
      utterance.volume = finalOptions.volume ?? volume;
      utterance.lang = finalOptions.lang ?? lang;
      const femaleVoice = voices.find(v =>
        // v.name.includes("Female") ||
        // v.name.includes("Google US English Female")
        v.voiceURI == "Google US English"
      );
      utterance.voice = femaleVoice || defaultVoice || null;

      // if (finalOptions.voice) {
      //   utterance.voice = finalOptions.voice;
      // } else if (defaultVoice) {
      //   utterance.voice = defaultVoice;
      // } else if (femaleVoice) {
      //   utterance.voice = femaleVoice;
      // }

      utterance.onstart = () => {
        setIsSpeaking(true);
        setIsPaused(false);
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        setIsPaused(false);
        utteranceRef.current = null;
      };

      utterance.onerror = (event) => {
        setIsSpeaking(false);
        setIsPaused(false);
        utteranceRef.current = null;
        // Only log non-cancellation errors
        // 'interrupted' and 'canceled' are expected when stopping speech
        if (event.error && event.error !== 'interrupted' && event.error !== 'canceled') {
          console.error("Speech synthesis error:", event.error);
        }
      };

      utteranceRef.current = utterance;
      synthRef.current.speak(utterance);
    },
    [isSupported, rate, pitch, volume, lang, defaultVoice, options, voices]
  );

  const stop = useCallback(() => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
    utteranceRef.current = null;
  }, []);

  const pause = useCallback(() => {
    if (!synthRef.current || !isSpeaking) return;
    synthRef.current.pause();
    setIsPaused(true);
  }, [isSpeaking]);

  const resume = useCallback(() => {
    if (!synthRef.current || !isPaused) return;
    synthRef.current.resume();
    setIsPaused(false);
  }, [isPaused]);

  const cancel = useCallback(() => {
    stop();
  }, [stop]);

  return {
    isSpeaking,
    isPaused,
    voices,
    speak,
    stop,
    pause,
    resume,
    cancel,
    isSupported,
  };
}
