import type { AuthEmail, SendAuthEmail } from "./emailDelivery";

// Bound upstream delivery latency. Adapters must respect the abort signal; the
// race also bounds a faulty adapter that fails to settle on cancellation.
export async function deliverAuthEmail(
  send: SendAuthEmail,
  message: AuthEmail,
  timeoutMs = 2_000,
) {
  const controller = new AbortController();
  let rejectDeadline: (error: Error) => void;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const timer = setTimeout(() => {
    controller.abort();
    rejectDeadline(new Error("email_delivery_unavailable"));
  }, timeoutMs);
  try {
    await Promise.race([send(message, controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
