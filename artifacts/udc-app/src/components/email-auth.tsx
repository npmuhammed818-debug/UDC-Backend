import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

async function post(path: string, body: unknown) {
  const response = await fetch(`/api/auth/${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Please wait before trying again."
        : data.error === "invalid_or_expired_code"
          ? "That code is invalid or expired. Request a new code if needed."
          : "We could not complete this request. Please try again later.",
    );
  return data;
}
function useCooldown() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!seconds) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);
  return [seconds, () => setSeconds(60)] as const;
}
export function EmailVerificationPanel() {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [seconds, cooldown] = useCooldown();
  useEffect(() => {
    let active = true;
    fetch("/api/auth/email/status", {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        if (active) setVerified(d.emailVerified);
      })
      .catch(() => {
        if (active) setError("Email verification is unavailable right now.");
      });
    return () => {
      active = false;
    };
  }, []);
  if (verified)
    return (
      <p role="status">
        Email ownership verified. Company approval remains a separate UDC
        review.
      </p>
    );
  async function request() {
    setBusy(true);
    setError("");
    try {
      const result = await post("email/verification/request", {});
      setChallengeId(result.challengeId);
      cooldown();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("email/verification/confirm", { challengeId, code });
      setVerified(true);
      setCode("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-card" aria-label="Verify email">
      <h2>Verify your email</h2>
      <p>
        Confirm ownership of the email on your UDC account. Codes expire in 10
        minutes.
      </p>
      {error && <p role="alert">{error}</p>}
      <Button
        type="button"
        onClick={request}
        disabled={busy || seconds > 0 || verified === null}
      >
        {seconds
          ? `Wait ${seconds}s`
          : challengeId
            ? "Resend code"
            : "Email me a code"}
      </Button>
      {challengeId && (
        <form onSubmit={confirm}>
          <label>
            Email code
            <Input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <Button disabled={busy} type="submit">
            Verify email
          </Button>
        </form>
      )}
    </section>
  );
}
export function PasswordRecovery() {
  const [email, setEmail] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [seconds, cooldown] = useCooldown();
  async function request(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await post("password/recovery/request", { email });
      setChallengeId(result.challengeId);
      cooldown();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("password/recovery/confirm", {
        email,
        challengeId,
        code,
        password,
      });
      setDone(true);
      setPassword("");
      setCode("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Recover your password</h1>
        {error && <p role="alert">{error}</p>}
        {done ? (
          <p role="status">
            Your password has changed and previous sessions have ended. Sign in
            again.
          </p>
        ) : (
          <>
            <p>
              For existing password accounts with a verified email. WhatsApp
              users should continue in their UDC chat.
            </p>
            <form onSubmit={request}>
              <label>
                Email address
                <Input
                  type="email"
                  required
                  maxLength={254}
                  value={email}
                  disabled={!!challengeId}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <Button type="submit" disabled={busy || !!challengeId}>
                Request a code
              </Button>
            </form>
            {challengeId && (
              <>
                <p role="status">
                  If this request is eligible, a code will arrive by email. It
                  expires in 10 minutes.
                </p>
                <form onSubmit={confirm}>
                  <label>
                    Email code
                    <Input
                      required
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={8}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </label>
                  <label>
                    New password
                    <Input
                      required
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={128}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  <p>
                    Use 12–128 characters with uppercase, lowercase, a number
                    and a symbol.
                  </p>
                  <Button type="submit" disabled={busy}>
                    Change password
                  </Button>
                </form>
                <Button
                  type="button"
                  disabled={busy || seconds > 0}
                  onClick={() => request()}
                >
                  {seconds ? `Wait ${seconds}s` : "Resend code"}
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setChallengeId("");
                    setCode("");
                    setPassword("");
                  }}
                >
                  Use another email
                </Button>
              </>
            )}
          </>
        )}
        <p>
          <Link href="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
