import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "./ui/button";
const CHOICE_KEY = "udc-cookie-choice-v1";
const TTL = 180 * 86400000;
function readChoice(): boolean | null {
  try {
    const value = JSON.parse(localStorage.getItem(CHOICE_KEY) || "null");
    return value &&
      typeof value.preferences === "boolean" &&
      Date.now() - value.at < TTL &&
      Date.now() >= value.at
      ? value.preferences
      : null;
  } catch {
    return null;
  }
}
export function CookieControls() {
  const [open, setOpen] = useState(() => readChoice() === null);
  useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener("udc-cookie-settings", reopen);
    if (readChoice() !== true)
      document.cookie = "sidebar_state=; path=/; max-age=0; SameSite=Lax";
    return () => window.removeEventListener("udc-cookie-settings", reopen);
  }, []);
  function choose(preferences: boolean) {
    try {
      localStorage.setItem(
        CHOICE_KEY,
        JSON.stringify({ preferences, at: Date.now() }),
      );
    } catch {
      /* Choice applies in this tab even if persistent storage is blocked. */
    }
    if (!preferences)
      document.cookie = "sidebar_state=; path=/; max-age=0; SameSite=Lax";
    setOpen(false);
  }
  return open ? (
    <section className="cookie-banner" aria-label="Cookie preferences">
      <p>
        UDC uses a necessary sign-in cookie. Optional storage only remembers the
        sidebar layout. <a href="/cookies">Read cookie policy</a>
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => choose(false)}>
          Necessary only
        </Button>
        <Button variant="outline" onClick={() => choose(true)}>
          Allow layout preference
        </Button>
      </div>
    </section>
  ) : null;
}
export function PolicyFooter() {
  return (
    <footer className="policy-footer">
      <nav aria-label="Policies and privacy">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/refunds">Fees and refunds</a>
        <a href="/business-details">Business details</a>
        <a href="/data-deletion">Data requests</a>
        <a href="/privacy-settings">Privacy settings</a>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("udc-cookie-settings"))}
        >
          Cookie settings
        </button>
      </nav>
      <p>
        Fees and commissions require an express written agreement before
        commitment.
      </p>
    </footer>
  );
}
type RequestRow = {
  entityId: string;
  createdAt: string;
  metadata: { userId: string; status: string; outcome?: string };
};
async function readRequests(
  path: string,
): Promise<{ requests: RequestRow[]; hasMore?: boolean }> {
  const response = await fetch(path, { credentials: "same-origin" });
  if (!response.ok) throw new Error("Unable to load privacy requests");
  return response.json();
}
export function PrivacySettings() {
  const requests = useQuery({
    queryKey: ["privacy-requests"],
    queryFn: () => readRequests("/api/privacy/requests"),
  });
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/privacy/requests", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed }),
      });
      if (!response.ok) throw new Error();
      setMessage(
        "Deletion review recorded. This does not immediately erase data.",
      );
      setConfirmed(false);
      await requests.refetch();
    } catch {
      setMessage("Request could not be saved. Try again or contact support.");
    } finally {
      setBusy(false);
    }
  }
  async function unsubscribe() {
    setBusy(true);
    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          optionalInApp: false,
          optionalWhatsApp: false,
          reminders: false,
          announcements: false,
        }),
      });
      if (!response.ok) throw new Error();
      setMessage(
        "Optional notification preferences are off. Necessary service updates remain available.",
      );
    } catch {
      setMessage("Preferences could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel privacy-panel">
      <h1>Privacy settings</h1>
      <p>
        For access, correction, consent withdrawal or a privacy grievance,
        contact{" "}
        <a href="mailto:npmuhammed818@gmail.com">npmuhammed818@gmail.com</a>. Do
        not send passwords or banking credentials.
      </p>
      <Button variant="outline" disabled={busy} onClick={unsubscribe}>
        Turn off optional notifications
      </Button>
      <h2>Request deletion review</h2>
      <p>
        UDC will verify and review records, documents and providers. Legal,
        accounting or dispute records may require retention. Your review outcome
        will explain what happens next.
      </p>
      <label className="consent-field">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />{" "}
        I want UDC to review deletion of my personal information.
      </label>
      <Button disabled={!confirmed || busy} onClick={submit}>
        Submit deletion review
      </Button>
      <p role="status">{message}</p>
      <h2>Your requests</h2>
      {requests.isError ? (
        <p role="alert">
          Requests could not load.{" "}
          <button onClick={() => requests.refetch()}>Retry</button>
        </p>
      ) : requests.isPending ? (
        <p>Loading…</p>
      ) : !requests.data?.requests.length ? (
        <p>No requests recorded.</p>
      ) : (
        requests.data.requests.map((row) => (
          <article key={row.entityId}>
            <p>
              Reference {row.entityId} ·{" "}
              {row.metadata.status.replaceAll("_", " ")}
            </p>
            {row.metadata.outcome && <p>{row.metadata.outcome}</p>}
          </article>
        ))
      )}
    </section>
  );
}
export function AdminPrivacyRequests() {
  const [offset, setOffset] = useState(0);
  const requests = useQuery({
    queryKey: ["admin-privacy-requests", offset],
    queryFn: () => readRequests(`/api/admin/privacy/requests?offset=${offset}`),
  });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function review(id: string, status: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/privacy/requests/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, outcome: notes[id] }),
      });
      if (!response.ok) throw new Error();
      await requests.refetch();
      setMessage("Review recorded.");
    } catch {
      setMessage("Review could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel privacy-panel">
      <h2>Privacy request review</h2>
      <p>
        Before resolving, verify identity and review database records, messages,
        files, providers and backups. Explain action taken and any retention
        reason/time. Resolving here records your response; it does not execute
        deletion. Never put private documents or secrets in the outcome shown to
        the user.
      </p>
      <p role="status">{message}</p>
      {requests.isError ? (
        <p role="alert">
          Queue could not load.{" "}
          <button onClick={() => requests.refetch()}>Retry</button>
        </p>
      ) : requests.isPending ? (
        <p>Loading…</p>
      ) : (
        requests.data?.requests.map((row) => (
          <article key={row.entityId}>
            <p>
              Reference {row.entityId} · User {row.metadata.userId} ·{" "}
              {row.metadata.status}
            </p>
            {row.metadata.outcome && <p>{row.metadata.outcome}</p>}
            {row.metadata.status !== "resolved" && (
              <>
                <label className="field">
                  Outcome visible to requester
                  <textarea
                    maxLength={1000}
                    value={notes[row.entityId] || ""}
                    onChange={(e) =>
                      setNotes({ ...notes, [row.entityId]: e.target.value })
                    }
                  />
                </label>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    disabled={
                      busy || (notes[row.entityId]?.trim().length || 0) < 10
                    }
                    onClick={() => review(row.entityId, "in_review")}
                  >
                    Record review
                  </Button>
                  <Button
                    variant="outline"
                    disabled={
                      busy || (notes[row.entityId]?.trim().length || 0) < 10
                    }
                    onClick={() => review(row.entityId, "resolved")}
                  >
                    Record resolution
                  </Button>
                </div>
              </>
            )}
          </article>
        ))
      )}
      <div className="flex gap-3">
        <Button
          variant="outline"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 100))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          disabled={!requests.data?.hasMore}
          onClick={() => setOffset(offset + 100)}
        >
          Next
        </Button>
      </div>
    </section>
  );
}
