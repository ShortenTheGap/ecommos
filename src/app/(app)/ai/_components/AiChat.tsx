"use client";

/**
 * AiChat — interactive AI workspace client component.
 *
 * Receives the list of profiles (key, label, suggestions) from the server
 * component so no server-only imports reach the client bundle.
 *
 * Features:
 *   - Agent-profile picker (segmented control of the 6 profiles).
 *   - Message thread: user messages right-aligned, assistant in Bento cards.
 *   - Suggestion chips when the thread is empty (profile-aware).
 *   - Optimistic append + "Thinking…" state while the POST is in-flight.
 *   - Citations section per assistant message (grounding evidence).
 *   - Blocked-claims notice (accent card — this is a feature, show it proudly).
 *   - Graceful 502 path: inline notice when ANTHROPIC_API_KEY is absent.
 *   - 401 → redirect to /login. 400 → inline "please enter a message" notice.
 *
 * Design rules: tokens only, no raw hex, one ink anchor + one accent per row.
 */

import { useState, useRef, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AgentProfile } from "@/lib/ai/agents";
import type { MessageData } from "./Message";
import { Message } from "./Message";

// =============================================================================
// Types
// =============================================================================

export interface ProfileItem {
  key: AgentProfile;
  label: string;
  suggestions: string[];
}

interface ApiResponse {
  text: string;
  citations: { claimId: string; claimText: string; evidence: string }[];
  blocked: { phrase: string; reason: string; severity: string }[];
  ok: boolean;
}

type InlineError =
  | { kind: "unavailable" }   // 502
  | { kind: "bad_message" }   // 400
  | { kind: "network" }       // fetch threw
  | null;

// =============================================================================
// Props
// =============================================================================

interface AiChatProps {
  profiles: ProfileItem[];
}

// =============================================================================
// Profile Picker
// =============================================================================

function ProfilePicker({
  profiles,
  selected,
  onChange,
  disabled,
}: {
  profiles: ProfileItem[];
  selected: AgentProfile;
  onChange: (p: AgentProfile) => void;
  disabled: boolean;
}) {
  return (
    <div className="ai-picker" role="radiogroup" aria-label="Agent profile">
      {profiles.map((p) => (
        <button
          key={p.key}
          role="radio"
          aria-checked={selected === p.key}
          disabled={disabled}
          className={`ai-picker__tab${selected === p.key ? " ai-picker__tab--active" : ""}`}
          onClick={() => onChange(p.key)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// Suggestion chips
// =============================================================================

function Suggestions({
  suggestions,
  onSelect,
}: {
  suggestions: string[];
  onSelect: (s: string) => void;
}) {
  return (
    <div className="ai-suggestions">
      <p className="ai-suggestions__label">Try asking…</p>
      <div className="ai-suggestions__chips">
        {suggestions.map((s) => (
          <button
            key={s}
            className="ai-suggestions__chip"
            onClick={() => onSelect(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Inline error banners
// =============================================================================

function InlineErrorBanner({ error }: { error: InlineError }) {
  if (!error) return null;
  const messages: Record<Exclude<InlineError, null>["kind"], string> = {
    unavailable:
      "AI is unavailable — set ANTHROPIC_API_KEY to enable the workspace.",
    bad_message: "Please enter a message before sending.",
    network:
      "Network error — please check your connection and try again.",
  };
  return (
    <div className="ai-error" role="alert">
      <span className="ai-error__dot" aria-hidden="true" />
      <span className="ai-error__text">{messages[error.kind]}</span>
    </div>
  );
}

// =============================================================================
// AiChat
// =============================================================================

export function AiChat({ profiles }: AiChatProps) {
  const router = useRouter();

  const defaultProfile = profiles.find((p) => p.key === "margin_analyst") ?? profiles[0];
  const [selectedProfile, setSelectedProfile] = useState<AgentProfile>(
    defaultProfile?.key ?? "margin_analyst",
  );
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [inputText, setInputText] = useState("");
  const [inlineError, setInlineError] = useState<InlineError>(null);
  const [isPending, startTransition] = useTransition();

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Scroll to bottom whenever messages change or a transition starts/stops.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPending]);

  const activeProfile = profiles.find((p) => p.key === selectedProfile) ?? defaultProfile;

  function handleProfileChange(profile: AgentProfile) {
    setSelectedProfile(profile);
    // Keep the thread — agent switches mid-conversation are intentional.
  }

  function prefillInput(suggestion: string) {
    setInputText(suggestion);
    inputRef.current?.focus();
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      setInlineError({ kind: "bad_message" });
      return;
    }
    setInlineError(null);

    // Optimistic append user message.
    const userMsg: MessageData = { role: "user", text: trimmed };
    const thinkingMsg: MessageData = { role: "thinking", text: "" };

    startTransition(() => {
      setMessages((prev) => [...prev, userMsg, thinkingMsg]);
      setInputText("");
    });

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: selectedProfile, message: trimmed }),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      if (res.status === 400) {
        setMessages((prev) => prev.filter((m) => m.role !== "thinking"));
        setInlineError({ kind: "bad_message" });
        return;
      }

      if (res.status === 502) {
        setMessages((prev) => prev.filter((m) => m.role !== "thinking"));
        setInlineError({ kind: "unavailable" });
        return;
      }

      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.role !== "thinking"));
        setInlineError({ kind: "network" });
        return;
      }

      const data = (await res.json()) as ApiResponse;

      const assistantMsg: MessageData = {
        role: "assistant",
        text: data.text,
        citations: data.citations,
        blocked: data.blocked,
        ok: data.ok,
      };

      setMessages((prev) => [
        ...prev.filter((m) => m.role !== "thinking"),
        assistantMsg,
      ]);
    } catch {
      // Network failure (no response).
      setMessages((prev) => prev.filter((m) => m.role !== "thinking"));
      setInlineError({ kind: "network" });
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void sendMessage(inputText);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(inputText);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="ai-chat">
      {/* Profile picker */}
      <ProfilePicker
        profiles={profiles}
        selected={selectedProfile}
        onChange={handleProfileChange}
        disabled={isPending}
      />

      {/* Thread area */}
      <div className="ai-thread" aria-live="polite" aria-label="Conversation">
        {isEmpty && activeProfile && (
          <Suggestions
            suggestions={activeProfile.suggestions}
            onSelect={prefillInput}
          />
        )}

        {messages.map((msg, i) => (
          <Message key={i} message={msg} />
        ))}

        <div ref={bottomRef} aria-hidden="true" />
      </div>

      {/* Inline error */}
      <InlineErrorBanner error={inlineError} />

      {/* Input bar */}
      <form className="ai-input-row" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          className="ai-input"
          placeholder="Ask the agent a question…"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isPending}
          rows={2}
          aria-label="Message"
        />
        <button
          type="submit"
          className="btn-primary ai-send"
          disabled={isPending || inputText.trim().length === 0}
          aria-label="Send"
        >
          {isPending ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
