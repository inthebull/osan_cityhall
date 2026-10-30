"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// 브라우저 내장 음성 인식·읽기(Web Speech API). 지원하지 않는 브라우저에서는 버튼을 숨긴다.
// 음성은 브라우저 안에서만 처리되고, 서버에는 인식된 글자만 보낸다.
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function recognitionCtor(): (new () => Recognition) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function useDictation(onText: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  useEffect(() => setSupported(Boolean(recognitionCtor())), []);

  const toggle = useCallback(() => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "ko-KR";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => cb.current(Array.from(e.results, (res) => res[0].transcript).join(""));
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  }, [listening]);

  return { supported, listening, toggle };
}

export function useSpeech() {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  useEffect(() => setSupported(typeof window !== "undefined" && "speechSynthesis" in window), []);

  const say = useCallback(
    (text: string) => {
      if (!on || !supported || !text) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ko-KR";
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    },
    [on, supported],
  );

  const toggle = useCallback(() => {
    if (on && supported) window.speechSynthesis.cancel();
    setOn((v) => !v);
  }, [on, supported]);

  return { supported, on, toggle, say };
}
