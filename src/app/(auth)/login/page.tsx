"use client";

import { Suspense, useState, useTransition, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Eyebrow, Button } from "@/components/bento";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuthMode = "signin" | "signup";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PasswordField({
  value,
  onChange,
  disabled,
  label = "Password",
  id = "password",
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  label?: string;
  id?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <label
        htmlFor={id}
        style={{
          fontSize: "var(--text-sm)",
          fontWeight: 600,
          color: "var(--text)",
        }}
      >
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required
          minLength={8}
          autoComplete={id === "password" ? "current-password" : "new-password"}
          style={{
            width: "100%",
            padding: "var(--space-3) var(--space-10) var(--space-3) var(--space-4)",
            borderRadius: "var(--radius-lg)",
            border: "1.5px solid var(--border-strong)",
            background: "var(--surface-3)",
            color: "var(--text)",
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-sm)",
            outline: "none",
            boxSizing: "border-box",
            opacity: disabled ? 0.6 : 1,
          }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={visible ? "Hide password" : "Show password"}
          style={{
            position: "absolute",
            right: "var(--space-3)",
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            padding: "var(--space-1) var(--space-2)",
          }}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("next") ?? "/cockpit";

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isSignUp = mode === "signup";

  function toggleMode() {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setError(null);
    setSuccessMsg(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const supabase = createClient();

      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (signUpError) {
          setError(signUpError.message);
        } else {
          setSuccessMsg(
            "Check your email — we've sent you a confirmation link."
          );
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          setError(signInError.message);
        } else {
          router.push(redirectTo);
          router.refresh();
        }
      }
    });
  }

  return (
    <div
      className="bento"
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: "var(--space-12)",
        paddingBottom: "var(--space-12)",
      }}
    >
      <Card
        style={{
          width: "100%",
          maxWidth: "420px",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: "var(--space-8)" }}>
          <Eyebrow>{isSignUp ? "Create account" : "Welcome back"}</Eyebrow>
          <h1
            style={{
              fontSize: "var(--text-xl)",
              marginTop: "var(--space-4)",
              marginBottom: "var(--space-2)",
            }}
          >
            {isSignUp ? "Join NourishOS" : "Sign in to NourishOS"}
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
            {isSignUp
              ? "Create your account to get started."
              : "Enter your credentials to access your dashboard."}
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}
        >
          {/* Email */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
          >
            <label
              htmlFor="email"
              style={{
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                color: "var(--text)",
              }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
              required
              autoComplete="email"
              placeholder="you@example.com"
              style={{
                padding: "var(--space-3) var(--space-4)",
                borderRadius: "var(--radius-lg)",
                border: "1.5px solid var(--border-strong)",
                background: "var(--surface-3)",
                color: "var(--text)",
                fontFamily: "var(--font-body)",
                fontSize: "var(--text-sm)",
                outline: "none",
                opacity: isPending ? 0.6 : 1,
              }}
            />
          </div>

          {/* Password */}
          <PasswordField
            id="password"
            label="Password"
            value={password}
            onChange={setPassword}
            disabled={isPending}
          />

          {/* Error / success feedback */}
          {error && (
            <p
              role="alert"
              style={{
                fontSize: "var(--text-sm)",
                color: "#b91c1c",
                background: "rgba(185,28,28,0.08)",
                border: "1px solid rgba(185,28,28,0.2)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-3) var(--space-4)",
              }}
            >
              {error}
            </p>
          )}

          {successMsg && (
            <p
              role="status"
              style={{
                fontSize: "var(--text-sm)",
                color: "#15803d",
                background: "rgba(21,128,61,0.08)",
                border: "1px solid rgba(21,128,61,0.2)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-3) var(--space-4)",
              }}
            >
              {successMsg}
            </p>
          )}

          {/* Submit */}
          <Button
            type="submit"
            variant="primary"
            disabled={isPending}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {isPending
              ? isSignUp
                ? "Creating account…"
                : "Signing in…"
              : isSignUp
              ? "Create account"
              : "Sign in"}
          </Button>
        </form>

        {/* Mode toggle */}
        <p
          style={{
            marginTop: "var(--space-6)",
            textAlign: "center",
            fontSize: "var(--text-sm)",
            color: "var(--text-muted)",
          }}
        >
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            onClick={toggleMode}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text)",
              fontWeight: 600,
              fontSize: "inherit",
              fontFamily: "var(--font-display)",
              padding: 0,
              textDecoration: "underline",
              textUnderlineOffset: "2px",
            }}
          >
            {isSignUp ? "Sign in" : "Sign up"}
          </button>
        </p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          className="bento"
          style={{
            minHeight: "100dvh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
            Loading…
          </p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
