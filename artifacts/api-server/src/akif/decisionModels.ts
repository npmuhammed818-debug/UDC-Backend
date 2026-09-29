/** Optional bounded-decision hints. Never authorize a trade action from these hints. */
export async function intakeDecisionHint(message: string): Promise<string | null> {
  const questions = {
    intent: {
      type: "choice",
      instructions: "What is the primary intent of this trade WhatsApp message?",
      criteria: {
        inquiry: "A buyer requirement or seller offer with trade details",
        followup: "A correction or follow-up to an existing trade",
        question: "A question about the trade or UDC process",
        casual: "Greeting, acknowledgement, or unrelated conversation",
      },
    },
  };
  const key = process.env.TYPESAFE_API_KEY?.trim();
  const layaUrl = process.env.AKIF_LAYA_URL?.trim();
  const providers = [
    ...(layaUrl ? [{ name: "Laya", url: `${layaUrl.replace(/\/$/, "")}/predict`, token: process.env.AKIF_LAYA_TOKEN?.trim(), body: { state: { message }, questions } }] : []),
    ...(key ? [{ name: "Jev", url: "https://api.typesafe.ai/v1/systemone", token: key, body: { state: message, model: "jev-latest", questions } }] : []),
  ];
  for (const provider of providers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    try {
      const response = await fetch(provider.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(provider.token ? { authorization: `Bearer ${provider.token}` } : {}),
        },
        body: JSON.stringify(provider.body),
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const result = await response.json() as { answers?: { intent?: { choice?: unknown; confidence?: unknown } } };
      const answer = result.answers?.intent;
      if (typeof answer?.choice === "string"
        && ["inquiry", "followup", "question", "casual"].includes(answer.choice)
        && typeof answer.confidence === "number" && answer.confidence >= 0.8) {
        return answer.choice;
      }
    } catch {
      // Optional provider downtime cannot block conversation.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
