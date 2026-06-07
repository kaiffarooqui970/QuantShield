"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  KeyboardEvent,
} from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const WAKE_WORD = "hey shield";

const ELEVEN_VOICES = [
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel" },
  { id: "29vD33N1lfxGbLRdDLxy", name: "Drew" },
  { id: "2EiwWnXFnvU5JabPnv8n", name: "Clyde" },
  { id: "5Q0t7uMcjvnagumLfvZi", name: "Paul" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi" },
  { id: "CYw3kZ78EXH8uMsHbEJh", name: "Dave" },
  { id: "D38z5RcWu1voky8WS1ja", name: "Fin" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni" },
  { id: "GBv7mTt0atIp3Br8iCZE", name: "Thomas" },
] as const;

type VoiceId = typeof ELEVEN_VOICES[number]["id"];
type MicState = "idle" | "listening" | "processing";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  audioBase64?: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface SimulationMetrics {
  expected_annual_return?: number;
  annual_volatility?: number;
  sharpe_ratio?: number;
  sortino_ratio?: number;
  max_drawdown?: number;
  var_95?: number;
  var_99?: number;
  cvar_95?: number;
  cvar_99?: number;
  median_final_value?: number;
  p5_final_value?: number;
  p95_final_value?: number;
}

interface CopilotWidgetProps {
  simulationMetrics?: SimulationMetrics | null;
  tickers?: string[];
  apiBaseUrl?: string;
  externalOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="md-code">$1</code>')
    .replace(/^- (.+)$/gm, '<li class="md-li">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, (match) => `<ul class="md-ul">${match}</ul>`)
    .replace(/\n\n/g, '</p><p class="md-p">')
    .replace(/^(?!<[hul])(.+)$/gm, '<p class="md-p">$1</p>')
    .replace(/<p class="md-p"><\/p>/g, "");
}

// ─── Suggested Questions ──────────────────────────────────────────────────────

const SUGGESTED = [
  "What does my Sharpe ratio tell me?",
  "How exposed am I to a market crash?",
  "Should I rebalance my portfolio?",
  "Explain my CVaR in plain English.",
  "How can I reduce my max drawdown?",
];

// ─── Audio Player ─────────────────────────────────────────────────────────────

function playAudioBase64(base64: string) {
  try {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length)
      .fill(0)
      .map((_, i) => byteChars.charCodeAt(i));
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.play().catch(console.warn);
    audio.onended = () => URL.revokeObjectURL(url);
  } catch (e) {
    console.warn("Audio playback failed:", e);
  }
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

const MessageBubble = React.memo(function MessageBubble({
  message,
  onPlayAudio,
}: {
  message: Message;
  onPlayAudio: (b64: string) => void;
}) {
  const isUser = message.role === "user";

  return (
    <div
      className={`qs-msg ${isUser ? "qs-msg--user" : "qs-msg--assistant"}`}
    >
      {!isUser && (
        <div className="qs-avatar">
          <ShieldIcon />
        </div>
      )}
      <div className="qs-bubble">
        {isUser ? (
          <p className="qs-bubble__text">{message.content}</p>
        ) : (
          <>
            <div
              className="qs-bubble__md"
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(message.content),
              }}
            />
            {message.isStreaming && (
              <span className="qs-cursor" aria-hidden="true" />
            )}
            {message.audioBase64 && (
              <button
                className="qs-audio-btn"
                onClick={() => onPlayAudio(message.audioBase64!)}
                title="Play audio response"
              >
                <SpeakerIcon />
                <span>Play</span>
              </button>
            )}
          </>
        )}
        <time className="qs-ts" suppressHydrationWarning>
          {message.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>
      {isUser && <div className="qs-avatar qs-avatar--user">You</div>}
    </div>
  );
});

// ─── Mic Button with Canvas Waveform Ring ─────────────────────────────────────

const MicButton = React.memo(function MicButton({
  micState,
  onToggle,
  disabled,
}: {
  micState: MicState;
  onToggle: () => void;
  disabled: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);

  const clearCanvas = () => {
    const c = canvasRef.current;
    if (c) c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
  };

  const cleanup = () => {
    cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  };

  const animateListening = (analyser: AnalyserNode) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx  = canvas.getContext("2d")!;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const innerR = 24, maxSpike = 13, N = 36;

    const frame = () => {
      animRef.current = requestAnimationFrame(frame);
      analyser.getByteFrequencyData(data);
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < N; i++) {
        const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
        const amp   = data[Math.floor((i / N) * data.length)] / 255;
        const r     = innerR + amp * maxSpike;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
        ctx.lineTo(cx + Math.cos(angle) * r,      cy + Math.sin(angle) * r);
        ctx.strokeStyle = `rgba(0,212,255,${0.35 + amp * 0.65})`;
        ctx.lineWidth   = 2.2;
        ctx.lineCap     = "round";
        ctx.stroke();
      }
    };
    frame();
  };

  const animateProcessing = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2;
    let a = 0;
    const frame = () => {
      animRef.current = requestAnimationFrame(frame);
      ctx.clearRect(0, 0, W, H);
      a += 0.07;
      ctx.beginPath();
      ctx.arc(cx, cy, 24, a, a + Math.PI * 1.4);
      ctx.strokeStyle = "rgba(0,212,255,0.75)";
      ctx.lineWidth   = 2.5;
      ctx.lineCap     = "round";
      ctx.stroke();
    };
    frame();
  };

  useEffect(() => {
    if (micState !== "listening") {
      cleanup();
      if (micState === "processing") animateProcessing();
      else clearCanvas();
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current  = stream;
        const audioCtx     = new AudioContext();
        audioCtxRef.current = audioCtx;
        const source       = audioCtx.createMediaStreamSource(stream);
        const analyser     = audioCtx.createAnalyser();
        analyser.fftSize   = 64;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        analyserRef.current = analyser;
        if (!cancelled) animateListening(analyser);
      } catch {
        /* mic permission denied — STT still works, no visualizer */
      }
    })();

    return () => { cancelled = true; cleanup(); };
  }, [micState]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: "relative", width: 40, height: 40, flexShrink: 0 }}>
      <canvas
        ref={canvasRef}
        width={70}
        height={70}
        style={{ position: "absolute", top: -15, left: -15, pointerEvents: "none", zIndex: 1 }}
      />
      <button
        className={`qs-mic-btn${micState === "listening" ? " qs-mic-btn--on" : ""}${micState === "processing" ? " qs-mic-btn--proc" : ""}`}
        onClick={onToggle}
        disabled={disabled}
        title={micState === "idle" ? "Voice input — say 'Hey Shield …'" : "Stop listening"}
        aria-label="Voice input"
        style={{ position: "relative", zIndex: 2 }}
      >
        {micState === "processing" ? <SpinnerIcon /> : <MicIcon />}
      </button>
    </div>
  );
});

// ─── Main Widget ──────────────────────────────────────────────────────────────

export default function CopilotWidget({
  simulationMetrics,
  tickers = [],
  apiBaseUrl = "",
  externalOpen,
  onOpenChange,
}: CopilotWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (externalOpen !== undefined) setIsOpen(externalOpen);
  }, [externalOpen]);

  const handleSetOpen = (v: boolean) => {
    setIsOpen(v);
    onOpenChange?.(v);
  };
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hello! I'm your **QuantShield Copilot**. Run a simulation first, then ask me anything about your portfolio risk — VaR, drawdown, Sharpe ratio, rebalancing strategies, and more.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const [micState, setMicState] = useState<MicState>("idle");
  const [interimText, setInterimText] = useState("");
  const [selectedVoiceId, setSelectedVoiceId] = useState<VoiceId>("JBFqnCBsd6RMkjVDRZzb");
  const [voiceMode, setVoiceMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const messagesEndRef   = useRef<HTMLDivElement>(null);
  const textareaRef      = useRef<HTMLTextAreaElement>(null);
  const abortRef         = useRef<AbortController | null>(null);
  const recognitionRef   = useRef<any>(null);
  const handleTranscriptRef = useRef<(t: string) => void>(() => {});
  const sessionId = useRef<string>(`qs-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const messagesRef = useRef<Message[]>(messages);
  // Refs for stale-closure-safe access inside async callbacks
  const voiceModeRef = useRef(false);
  const isLoadingRef = useRef(false);

  // ── Speech-to-text ──────────────────────────────────────────────────────────
  // Must start false so server and client render identically on first paint.
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  useEffect(() => {
    setIsSpeechSupported(
      "SpeechRecognition" in window || "webkitSpeechRecognition" in window
    );
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setMicState("idle");
    setInterimText("");
  }, []);

  const startListening = useCallback(() => {
    if (!isSpeechSupported) return;
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous    = false;
    rec.interimResults = true;
    rec.lang          = "en-US";
    rec.maxAlternatives = 1;

    rec.onstart  = () => setMicState("listening");
    rec.onerror  = () => { setMicState("idle"); setInterimText(""); };
    rec.onend    = () => {
      setMicState((prev) => (prev === "listening" ? "idle" : prev));
      setInterimText("");
    };
    rec.onresult = (e: any) => {
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      setInterimText(interim);
      if (final) {
        setMicState("processing");
        setInterimText("");
        handleTranscriptRef.current(final.trim());
      }
    };

    recognitionRef.current = rec;
    rec.start();
  }, [isSpeechSupported]);

  const toggleMic = useCallback(() => {
    if (micState === "idle") startListening();
    else stopListening();
  }, [micState, startListening, stopListening]);

  // ── Browser TTS (speechSynthesis) ───────────────────────────────────────────
  const speakText = useCallback((text: string, onEnd?: () => void) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    // Strip markdown symbols so they aren't read aloud
    const clean = text.replace(/[#*`_~]/g, "").replace(/\n+/g, " ").slice(0, 800);
    const utt = new SpeechSynthesisUtterance(clean);
    utt.rate = 1.05;
    utt.pitch = 1.0;
    utt.volume = 1.0;
    // Prefer a natural-sounding voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) => /Google US English|Samantha|Daniel|Karen|Moira/i.test(v.name)
    ) ?? voices.find((v) => v.lang.startsWith("en"));
    if (preferred) utt.voice = preferred;
    utt.onstart = () => setIsSpeaking(true);
    utt.onend = () => { setIsSpeaking(false); onEnd?.(); };
    utt.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utt);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  // ── Voice conversation mode ──────────────────────────────────────────────────
  const toggleVoiceMode = useCallback(() => {
    const next = !voiceModeRef.current;
    voiceModeRef.current = next;
    setVoiceMode(next);
    if (next) {
      handleSetOpen(true);
      stopSpeaking();
      setTimeout(() => startListening(), 300);
    } else {
      stopSpeaking();
      stopListening();
    }
  }, [handleSetOpen, startListening, stopListening, stopSpeaking]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 150);
    } else {
      // Stop voice mode when panel closes
      if (voiceModeRef.current) {
        voiceModeRef.current = false;
        setVoiceMode(false);
        stopSpeaking();
        stopListening();
      }
    }
  }, [isOpen, stopSpeaking, stopListening]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;
      setMicState("idle");   // reset mic state on any send

      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };
      const assistantMsgId = `assistant-${Date.now()}`;
      const assistantMsg: Message = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
      };

      // Build messages array for the API from current history (exclude welcome msg)
      const historyForApi = messagesRef.current
        .filter((m) => !m.id.startsWith("welcome"))
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      const apiMessages = [...historyForApi, { role: "user" as const, content: text.trim() }];

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput("");
      setIsLoading(true);
      abortRef.current = new AbortController();

      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortRef.current.signal,
          body: JSON.stringify({
            session_id: sessionId.current,
            messages: apiMessages,
            simulation_metrics: simulationMetrics ?? null,
            tickers: tickers.length > 0 ? tickers : null,
          }),
        });

        if (!response.ok || !response.body) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || `HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";   // accumulate for post-stream TTS

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";   // keep any incomplete line for next chunk

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") break;
            try {
              const parsed = JSON.parse(payload);
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.token) {
                fullText += parsed.token;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: m.content + parsed.token, isStreaming: true }
                      : m
                  )
                );
              }
            } catch {
              // skip malformed SSE lines
            }
          }
        }

        // Mark streaming as done
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, isStreaming: false } : m
          )
        );

        // ── TTS: speak response aloud ──────────────────────────────────────────
        if ((autoPlay || voiceModeRef.current) && fullText) {
          speakText(fullText, () => {
            // In voice mode: automatically start listening again after AI finishes
            if (voiceModeRef.current && !isLoadingRef.current) {
              setTimeout(() => startListening(), 400);
            }
          });
        }
      } catch (err: unknown) {
        const isAbort = (err as Error).name === "AbortError";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: isAbort
                    ? "_Response cancelled._"
                    : `⚠️ **Error:** ${(err as Error).message}`,
                  isStreaming: false,
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, simulationMetrics, tickers, apiBaseUrl, autoPlay, speakText, startListening]
  );

  // Keep handleTranscript ref in sync (reads sendMessage + isLoading)
  useEffect(() => {
    handleTranscriptRef.current = (rawText: string) => {
      const lower = rawText.toLowerCase();
      // Strip wake word if present; always send without it
      const query = lower.startsWith(WAKE_WORD)
        ? rawText.slice(WAKE_WORD.length).trim()
        : rawText.trim();
      setMicState("idle");
      if (!query) return;
      if (isLoading) {
        setInput(query);   // show in textarea; user sends manually
      } else {
        sendMessage(query);
      }
    };
  }, [sendMessage, isLoading]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleClear = () => {
    setMessages([
      {
        id: "welcome-reset",
        role: "assistant",
        content:
          "Chat cleared. Ask me anything about your portfolio risk analysis.",
        timestamp: new Date(),
      },
    ]);
  };

  return (
    <>
      {/* ── Styles (scoped) ────────────────────────────────────────────────── */}
      <style>{WIDGET_CSS}</style>

      {/* ── FAB Trigger ───────────────────────────────────────────────────── */}
      <button
        className={`qs-fab ${isOpen ? "qs-fab--open" : ""} ${voiceMode && !isOpen ? "qs-fab--voice" : ""}`}
        onClick={() => handleSetOpen(!isOpen)}
        aria-label="Toggle QuantShield Copilot"
      >
        {isOpen ? <CloseIcon /> : <CopilotIcon />}
        {!isOpen && <span className="qs-fab__label">{voiceMode ? "Voice Active" : "Copilot"}</span>}
        {(isLoading || isSpeaking) && !isOpen && <span className="qs-fab__pulse" />}
      </button>

      {/* ── Panel ─────────────────────────────────────────────────────────── */}
      <div className={`qs-panel ${isOpen ? "qs-panel--open" : ""}`} role="dialog" aria-label="QuantShield Copilot">
        {/* Header */}
        <div className="qs-header">
          <div className="qs-header__left">
            <div className="qs-logo">
              <ShieldIcon />
            </div>
            <div>
              <p className="qs-header__title">Copilot</p>
              <p className="qs-header__sub">
                {simulationMetrics
                  ? `${tickers.join(", ")} · Live data`
                  : "No simulation loaded"}
              </p>
            </div>
          </div>
          <div className="qs-header__actions">
            {/* Voice Conversation button */}
            {isSpeechSupported && (
              <button
                className={`qs-voice-mode-btn ${voiceMode ? "qs-voice-mode-btn--active" : ""}`}
                onClick={toggleVoiceMode}
                title={voiceMode ? "End voice conversation" : "Start voice conversation"}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
                {voiceMode ? "End" : "Voice Chat"}
              </button>
            )}
            <label className="qs-toggle" title="Auto-play responses">
              <input type="checkbox" checked={autoPlay} onChange={(e) => setAutoPlay(e.target.checked)} />
              <SpeakerIcon />
            </label>
            <button className="qs-icon-btn" onClick={handleClear} title="Clear chat"><TrashIcon /></button>
            <button className="qs-icon-btn" onClick={() => handleSetOpen(false)} title="Close"><CloseIcon /></button>
          </div>
        </div>

        {/* Voice Mode status bar */}
        {voiceMode && (
          <div className="qs-voice-status">
            <div className={`qs-voice-status__orb ${isSpeaking ? "qs-orb--speaking" : micState === "listening" ? "qs-orb--listening" : "qs-orb--idle"}`} />
            <span className="qs-voice-status__label">
              {isSpeaking ? "AI Speaking…" : micState === "listening" ? "Listening…" : micState === "processing" ? "Processing…" : "Voice Active — say something"}
            </span>
            <div className="qs-voice-status__bars">
              {Array.from({length: 5}).map((_, i) => (
                <div key={i} className={`qs-vbar ${(isSpeaking || micState === "listening") ? "qs-vbar--active" : ""}`} style={{animationDelay: `${i * 0.12}s`}} />
              ))}
            </div>
          </div>
        )}

        {/* Metrics strip */}
        {simulationMetrics && (
          <div className="qs-metrics">
            <MetricChip label="Sharpe" value={simulationMetrics.sharpe_ratio?.toFixed(2) ?? "—"} />
            <MetricChip label="VaR 95%" value={`$${simulationMetrics.var_95?.toFixed(0) ?? "—"}`} negative />
            <MetricChip label="Drawdown" value={`${simulationMetrics.max_drawdown?.toFixed(1) ?? "—"}%`} negative />
            <MetricChip label="Ann. Return" value={`${simulationMetrics.expected_annual_return?.toFixed(1) ?? "—"}%`} />
          </div>
        )}

        {/* Messages */}
        <div className="qs-messages">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onPlayAudio={playAudioBase64}
            />
          ))}
          {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="qs-thinking">
              <span />
              <span />
              <span />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions */}
        {messages.length <= 2 && (
          <div className="qs-suggestions">
            {SUGGESTED.map((s) => (
              <button
                key={s}
                className="qs-suggestion"
                onClick={() => sendMessage(s)}
                disabled={isLoading}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="qs-input-bar">
          <textarea
            ref={textareaRef}
            className="qs-textarea"
            placeholder={
              micState === "listening"
                ? "Listening… say 'Hey Shield' to send"
                : micState === "processing"
                ? "Processing speech…"
                : "Ask about your portfolio risk…"
            }
            value={micState !== "idle" ? interimText : input}
            onChange={(e) => { if (micState === "idle") setInput(e.target.value); }}
            onKeyDown={handleKeyDown}
            disabled={isLoading || micState === "processing"}
            readOnly={micState === "listening"}
            rows={1}
          />
          {/* Mic button — hidden if SpeechRecognition not supported */}
          {isSpeechSupported && (
            <MicButton
              micState={micState}
              onToggle={toggleMic}
              disabled={isLoading}
            />
          )}
          {isLoading ? (
            <button className="qs-send-btn qs-send-btn--stop" onClick={handleStop} title="Stop">
              <StopIcon />
            </button>
          ) : (
            <button
              className="qs-send-btn"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || micState !== "idle"}
              title="Send (Enter)"
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Metric Chip ──────────────────────────────────────────────────────────────

function MetricChip({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div className="qs-chip">
      <span className="qs-chip__label">{label}</span>
      <span className={`qs-chip__value ${negative ? "qs-chip__value--neg" : "qs-chip__value--pos"}`}>
        {value}
      </span>
    </div>
  );
}

// ─── Icons (inline SVG) ───────────────────────────────────────────────────────

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function CopilotIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2z" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
function SpeakerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}
function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}
function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}
function SpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="qs-spin">
      <path d="M21 12a9 9 0 1 1-6.22-8.56" />
    </svg>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const WIDGET_CSS = `
  /* ── Variables ── */
  :root {
    --qs-bg: #0d1117;
    --qs-surface: #161b22;
    --qs-surface2: #1c2333;
    --qs-border: rgba(255,255,255,0.08);
    --qs-accent: #00d4ff;
    --qs-accent2: #0099ff;
    --qs-text: #e6edf3;
    --qs-text-muted: #7d8590;
    --qs-user-bubble: #1a3a5c;
    --qs-ai-bubble: #1c2333;
    --qs-positive: #3fb950;
    --qs-negative: #f85149;
    --qs-radius: 16px;
    --qs-radius-sm: 8px;
    --qs-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06);
    --qs-font: 'IBM Plex Sans', 'SF Pro Text', system-ui, sans-serif;
    --qs-font-mono: 'IBM Plex Mono', 'Fira Code', monospace;
  }

  /* ── FAB ── */
  .qs-fab {
    position: fixed;
    bottom: 28px;
    right: 28px;
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 20px;
    background: linear-gradient(135deg, var(--qs-accent) 0%, var(--qs-accent2) 100%);
    color: #000;
    border: none;
    border-radius: 50px;
    cursor: pointer;
    font-family: var(--qs-font);
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.3px;
    box-shadow: 0 8px 32px rgba(0, 212, 255, 0.35), 0 2px 8px rgba(0,0,0,0.4);
    transition: transform 0.2s ease, box-shadow 0.2s ease, padding 0.2s ease;
  }
  .qs-fab:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,212,255,0.5); }
  .qs-fab--open { padding: 14px; border-radius: 50%; }
  .qs-fab__label { white-space: nowrap; }
  .qs-fab__pulse {
    position: absolute;
    top: 6px; right: 6px;
    width: 10px; height: 10px;
    background: var(--qs-positive);
    border-radius: 50%;
    animation: qs-pulse 1.4s ease infinite;
  }
  @keyframes qs-pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.6); opacity: 0.5; }
  }

  /* ── Panel ── */
  .qs-panel {
    position: fixed;
    bottom: 100px;
    right: 28px;
    z-index: 9998;
    width: 420px;
    max-width: calc(100vw - 32px);
    height: 620px;
    max-height: calc(100vh - 130px);
    background: var(--qs-bg);
    border: 1px solid var(--qs-border);
    border-radius: var(--qs-radius);
    box-shadow: var(--qs-shadow);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: var(--qs-font);
    color: var(--qs-text);
    opacity: 0;
    transform: translateY(20px) scale(0.96);
    pointer-events: none;
    transition: opacity 0.25s ease, transform 0.25s ease;
  }
  .qs-panel--open {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: all;
  }

  /* ── Header ── */
  .qs-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 16px 14px;
    border-bottom: 1px solid var(--qs-border);
    background: linear-gradient(180deg, rgba(0,212,255,0.04) 0%, transparent 100%);
    flex-shrink: 0;
  }
  .qs-header__left { display: flex; align-items: center; gap: 10px; }
  .qs-logo {
    width: 36px; height: 36px;
    background: linear-gradient(135deg, var(--qs-accent), var(--qs-accent2));
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    color: #000;
    flex-shrink: 0;
  }
  .qs-header__title { margin: 0; font-size: 15px; font-weight: 700; line-height: 1.2; }
  .qs-header__sub { margin: 0; font-size: 11px; color: var(--qs-text-muted); line-height: 1.3; }
  .qs-header__actions { display: flex; align-items: center; gap: 4px; }
  .qs-icon-btn {
    background: none; border: none; cursor: pointer;
    color: var(--qs-text-muted); padding: 6px; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    transition: color 0.15s, background 0.15s;
  }
  .qs-icon-btn:hover { color: var(--qs-text); background: var(--qs-surface2); }
  .qs-toggle {
    display: flex; align-items: center; cursor: pointer;
    color: var(--qs-text-muted); padding: 6px; border-radius: 6px;
    transition: color 0.15s;
  }
  .qs-toggle input { display: none; }
  .qs-toggle:has(input:checked) { color: var(--qs-accent); }
  .qs-toggle:hover { color: var(--qs-text); }

  /* ── Metrics strip ── */
  .qs-metrics {
    display: flex; gap: 6px; padding: 10px 14px;
    border-bottom: 1px solid var(--qs-border);
    overflow-x: auto; flex-shrink: 0;
    scrollbar-width: none;
  }
  .qs-metrics::-webkit-scrollbar { display: none; }
  .qs-chip {
    display: flex; flex-direction: column; gap: 2px;
    background: var(--qs-surface2);
    border: 1px solid var(--qs-border);
    border-radius: var(--qs-radius-sm);
    padding: 6px 10px; flex-shrink: 0;
    min-width: 72px;
  }
  .qs-chip__label { font-size: 10px; color: var(--qs-text-muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
  .qs-chip__value { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .qs-chip__value--pos { color: var(--qs-positive); }
  .qs-chip__value--neg { color: var(--qs-negative); }

  /* ── Messages ── */
  .qs-messages {
    flex: 1; overflow-y: auto; padding: 16px;
    display: flex; flex-direction: column; gap: 16px;
    scroll-behavior: smooth;
  }
  .qs-messages::-webkit-scrollbar { width: 4px; }
  .qs-messages::-webkit-scrollbar-track { background: transparent; }
  .qs-messages::-webkit-scrollbar-thumb { background: var(--qs-border); border-radius: 2px; }

  .qs-msg { display: flex; gap: 10px; align-items: flex-end; }
  .qs-msg--user { flex-direction: row-reverse; }

  .qs-avatar {
    width: 30px; height: 30px; border-radius: 50%;
    background: linear-gradient(135deg, var(--qs-accent), var(--qs-accent2));
    display: flex; align-items: center; justify-content: center;
    color: #000; font-size: 10px; font-weight: 700;
    flex-shrink: 0;
  }
  .qs-avatar--user {
    background: var(--qs-surface2);
    color: var(--qs-text-muted);
    font-size: 9px;
  }

  .qs-bubble {
    max-width: 82%;
    background: var(--qs-ai-bubble);
    border: 1px solid var(--qs-border);
    border-radius: 14px 14px 14px 4px;
    padding: 12px 14px;
    position: relative;
  }
  .qs-msg--user .qs-bubble {
    background: var(--qs-user-bubble);
    border-color: rgba(0, 153, 255, 0.2);
    border-radius: 14px 14px 4px 14px;
  }
  .qs-bubble__text { margin: 0; font-size: 14px; line-height: 1.55; }
  .qs-bubble__md { font-size: 13.5px; line-height: 1.6; }
  .qs-bubble__md .md-h1,.qs-bubble__md .md-h2,.qs-bubble__md .md-h3 {
    margin: 10px 0 4px; font-weight: 700; color: var(--qs-accent);
  }
  .qs-bubble__md .md-h3 { font-size: 13px; }
  .qs-bubble__md .md-p { margin: 4px 0; }
  .qs-bubble__md .md-code {
    background: rgba(0,212,255,0.1); color: var(--qs-accent);
    padding: 2px 5px; border-radius: 4px;
    font-family: var(--qs-font-mono); font-size: 12px;
  }
  .qs-bubble__md .md-ul { margin: 4px 0 4px 14px; padding: 0; }
  .qs-bubble__md .md-li { margin: 2px 0; }
  .qs-bubble__md strong { color: #c9d1d9; }

  .qs-cursor {
    display: inline-block; width: 2px; height: 14px;
    background: var(--qs-accent); margin-left: 2px; vertical-align: middle;
    animation: qs-blink 0.8s step-end infinite;
  }
  @keyframes qs-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

  .qs-ts {
    display: block; font-size: 10px; color: var(--qs-text-muted);
    margin-top: 6px; text-align: right;
  }

  .qs-audio-btn {
    display: inline-flex; align-items: center; gap: 5px;
    margin-top: 8px; padding: 5px 10px;
    background: rgba(0,212,255,0.1); color: var(--qs-accent);
    border: 1px solid rgba(0,212,255,0.2); border-radius: 20px;
    font-size: 12px; font-weight: 600; cursor: pointer;
    transition: background 0.15s, transform 0.1s;
  }
  .qs-audio-btn:hover { background: rgba(0,212,255,0.2); transform: scale(1.03); }

  /* ── Thinking dots ── */
  .qs-thinking {
    display: flex; align-items: center; gap: 5px;
    padding: 12px 14px;
    background: var(--qs-ai-bubble);
    border: 1px solid var(--qs-border);
    border-radius: 14px 14px 14px 4px;
    width: fit-content;
  }
  .qs-thinking span {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--qs-accent);
    animation: qs-dot 1.2s ease-in-out infinite;
  }
  .qs-thinking span:nth-child(2) { animation-delay: 0.2s; }
  .qs-thinking span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes qs-dot {
    0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
  }

  /* ── Suggestions ── */
  .qs-suggestions {
    display: flex; flex-wrap: wrap; gap: 6px;
    padding: 0 14px 10px; flex-shrink: 0;
  }
  .qs-suggestion {
    background: var(--qs-surface2);
    border: 1px solid var(--qs-border);
    border-radius: 20px;
    padding: 5px 12px;
    font-size: 12px; color: var(--qs-text-muted);
    cursor: pointer; font-family: var(--qs-font);
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }
  .qs-suggestion:hover:not(:disabled) {
    border-color: var(--qs-accent);
    color: var(--qs-accent);
    background: rgba(0,212,255,0.06);
  }
  .qs-suggestion:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ── Input bar ── */
  .qs-input-bar {
    display: flex; align-items: flex-end; gap: 8px;
    padding: 12px 14px;
    border-top: 1px solid var(--qs-border);
    background: var(--qs-surface);
    flex-shrink: 0;
  }
  .qs-textarea {
    flex: 1; resize: none; overflow-y: auto;
    background: var(--qs-surface2);
    border: 1px solid var(--qs-border);
    border-radius: 12px;
    padding: 10px 14px;
    color: var(--qs-text);
    font-family: var(--qs-font);
    font-size: 14px; line-height: 1.5;
    outline: none;
    transition: border-color 0.15s;
    max-height: 120px;
  }
  .qs-textarea:focus { border-color: rgba(0,212,255,0.4); }
  .qs-textarea::placeholder { color: var(--qs-text-muted); }
  .qs-textarea::-webkit-scrollbar { width: 3px; }
  .qs-textarea::-webkit-scrollbar-thumb { background: var(--qs-border); border-radius: 2px; }

  .qs-send-btn {
    width: 40px; height: 40px; flex-shrink: 0;
    background: linear-gradient(135deg, var(--qs-accent), var(--qs-accent2));
    border: none; border-radius: 12px;
    color: #000; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: transform 0.15s, opacity 0.15s, box-shadow 0.15s;
    box-shadow: 0 4px 14px rgba(0,212,255,0.3);
  }
  .qs-send-btn:hover:not(:disabled) { transform: scale(1.08); box-shadow: 0 6px 20px rgba(0,212,255,0.5); }
  .qs-send-btn:disabled { opacity: 0.35; cursor: not-allowed; box-shadow: none; }
  .qs-send-btn--stop {
    background: var(--qs-negative);
    box-shadow: 0 4px 14px rgba(248,81,73,0.3);
  }
  .qs-send-btn--stop:hover { box-shadow: 0 6px 20px rgba(248,81,73,0.5); }

  /* ── Mic button ── */
  .qs-mic-btn {
    width: 40px; height: 40px; flex-shrink: 0;
    background: var(--qs-surface2);
    border: 1px solid var(--qs-border);
    border-radius: 12px;
    color: var(--qs-text-muted);
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: color 0.15s, background 0.15s, border-color 0.15s, box-shadow 0.15s;
  }
  .qs-mic-btn:hover:not(:disabled) { color: var(--qs-text); background: var(--qs-surface); }
  .qs-mic-btn--on {
    color: var(--qs-accent);
    border-color: rgba(0,212,255,0.4);
    box-shadow: 0 0 12px rgba(0,212,255,0.25);
  }
  .qs-mic-btn--proc {
    color: var(--qs-accent);
    border-color: rgba(0,212,255,0.3);
  }
  .qs-mic-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  /* ── Spinner animation ── */
  .qs-spin { animation: qs-rotate 0.9s linear infinite; }
  @keyframes qs-rotate { to { transform: rotate(360deg); } }

  /* ── Voice selector ── */
  .qs-voice-select {
    background: var(--qs-surface2);
    border: 1px solid var(--qs-border);
    border-radius: 6px;
    color: var(--qs-text-muted);
    font-family: var(--qs-font);
    font-size: 11px;
    padding: 4px 6px;
    outline: none;
    cursor: pointer;
    max-width: 76px;
    transition: border-color 0.15s, color 0.15s;
  }
  .qs-voice-select:hover { border-color: rgba(0,212,255,0.3); color: var(--qs-text); }
  .qs-voice-select option { background: var(--qs-surface); }

  /* ── Voice mode button ── */
  .qs-voice-mode-btn {
    display: flex; align-items: center; gap: 5px;
    padding: 5px 10px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 20px;
    color: var(--qs-text-muted);
    font-family: var(--qs-font); font-size: 11px; font-weight: 600;
    cursor: pointer; white-space: nowrap;
    transition: all 0.2s ease;
  }
  .qs-voice-mode-btn:hover { border-color: var(--qs-accent); color: var(--qs-accent); background: rgba(0,212,255,0.08); }
  .qs-voice-mode-btn--active {
    background: rgba(239,68,68,0.12);
    border-color: rgba(239,68,68,0.4);
    color: #f87171;
    box-shadow: 0 0 14px rgba(239,68,68,0.2);
    animation: qs-voice-pulse 2s ease infinite;
  }
  @keyframes qs-voice-pulse {
    0%, 100% { box-shadow: 0 0 14px rgba(239,68,68,0.2); }
    50% { box-shadow: 0 0 24px rgba(239,68,68,0.4); }
  }

  /* ── Voice status bar ── */
  .qs-voice-status {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 16px;
    background: linear-gradient(90deg, rgba(0,212,255,0.06), rgba(139,92,246,0.06));
    border-bottom: 1px solid rgba(0,212,255,0.15);
    flex-shrink: 0;
  }
  .qs-voice-status__orb {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
    transition: background 0.3s, box-shadow 0.3s;
  }
  .qs-orb--listening { background: #06b6d4; box-shadow: 0 0 8px rgba(6,182,212,0.8); animation: qs-pulse 1s ease infinite; }
  .qs-orb--speaking  { background: #a78bfa; box-shadow: 0 0 8px rgba(167,139,250,0.8); animation: qs-pulse 0.6s ease infinite; }
  .qs-orb--idle      { background: rgba(255,255,255,0.2); }
  .qs-voice-status__label { flex: 1; font-size: 11px; font-weight: 600; color: var(--qs-text-muted); letter-spacing: 0.3px; }
  .qs-voice-status__bars { display: flex; align-items: center; gap: 2px; height: 16px; }
  .qs-vbar {
    width: 3px; border-radius: 2px;
    background: rgba(6,182,212,0.3);
    height: 4px;
    transition: height 0.1s ease;
  }
  .qs-vbar--active {
    background: var(--qs-accent);
    animation: qs-bar 0.8s ease-in-out infinite alternate;
  }
  @keyframes qs-bar {
    0%   { height: 4px; }
    100% { height: 14px; }
  }

  /* ── Premium panel border glow ── */
  .qs-panel {
    background: linear-gradient(#0d1117, #0d1117) padding-box,
                linear-gradient(180deg, rgba(0,212,255,0.3), rgba(139,92,246,0.15), rgba(255,255,255,0.06)) border-box;
    border: 1px solid transparent !important;
  }

  /* ── FAB voice-active state ── */
  .qs-fab--voice {
    background: linear-gradient(135deg, #ef4444, #f97316) !important;
    box-shadow: 0 8px 32px rgba(239,68,68,0.4) !important;
    animation: qs-voice-pulse 2s ease infinite;
  }

  @media (max-width: 480px) {
    .qs-panel { right: 12px; bottom: 90px; width: calc(100vw - 24px); }
    .qs-fab { right: 16px; bottom: 20px; }
  }
`;