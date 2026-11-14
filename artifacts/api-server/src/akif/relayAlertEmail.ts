// Relay held-message email alerts (staging tests only; owner-approved 9 Nov,
// alerts to the owner's own Gmail only). When a message is held in the human
// relay, one plain email goes to AKIF_RELAY_ALERT_EMAIL through the existing
// Resend sender so the dev side can be woken quickly. This is separate from
// auth OTP email: UDC_AUTH_EMAIL_SEND_ENABLED stays untouched, no customer
// ever receives these, and failures only log - the relay itself never breaks.

const RESEND_API = "https://api.resend.com/emails";

export function relayAlertEmailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((env.AKIF_RELAY_ALERT_EMAIL ?? "").trim()) &&
    (env.RESEND_API_KEY ?? "").trim() &&
    (env.UDC_AUTH_EMAIL_FROM ?? "").trim(),
  );
}

export async function sendRelayHeldAlert(
  input: { phone: string; kind: "text" | "voice"; text: string; draft?: string | null; autoAnswered?: boolean; autoNote?: string; customerNote?: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (!relayAlertEmailConfigured(env)) return false;
  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        authorization: `Bearer ${(env.RESEND_API_KEY ?? "").trim()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: (env.UDC_AUTH_EMAIL_FROM ?? "").trim(),
        to: [(env.AKIF_RELAY_ALERT_EMAIL ?? "").trim()],
        subject: `UDC relay: new ${input.kind} message from +${input.phone}`,
        text:
          `A ${input.kind} message is held in the human relay (staging test).\n\n` +
          `From: +${input.phone}\nAt: ${new Date().toISOString()}${input.customerNote ? `\nCustomer: ${input.customerNote}` : ""}\n\n${input.text.slice(0, 1500)}` +
          (input.draft && !input.autoAnswered
            ? `\n\nBrain draft (not sent; the dev side may edit before replying):\n${input.draft.slice(0, 1000)}`
            : "") +
          (input.autoAnswered
            ? `\n\n${input.autoNote ?? "Auto-answered as a simple greeting - no reply needed unless it looks wrong. Sent:"}${input.draft ? `\n${input.draft.slice(0, 1000)}` : ""}`
            : ""),
      }),
    });
    if (!res.ok) {
      console.warn(`relay alert email failed { status: ${res.status} }`);
      return false;
    }
    return true;
  } catch {
    console.warn("relay alert email failed { error: \"send failed\" }");
    return false;
  }
}
