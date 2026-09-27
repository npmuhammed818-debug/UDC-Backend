type HermesChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

type HermesCapabilities = {
  object?: string;
  platform?: string;
  model?: string;
  auth?: Record<string, unknown>;
  features?: Record<string, unknown>;
};

const DEFAULT_TIMEOUT_MS = 120_000;

function hermesConfig() {
  const rawUrl = process.env.HERMES_AKIF_URL?.trim();
  const apiKey = process.env.HERMES_AKIF_API_KEY?.trim();
  if (!rawUrl || !apiKey) return null;
  return {
    baseUrl: rawUrl.replace(/\/$/, ""),
    apiKey,
  };
}

export function isHermesAkifConfigured() {
  return hermesConfig() !== null;
}

async function hermesFetch<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const config = hermesConfig();
  if (!config) {
    throw new Error("Hermes AKIF URL/key is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Hermes returned HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function getHermesCapabilities() {
  return hermesFetch<HermesCapabilities>("/v1/capabilities");
}

export async function runHermesChat(
  message: string,
  system?: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ content: string; raw: HermesChatResponse }> {
  const payload = {
    model: "akif-hermes",
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      { role: "user", content: message },
    ],
    stream: false,
  };

  const raw = await hermesFetch<HermesChatResponse>(
    "/v1/chat/completions",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    timeoutMs,
  );

  const content = raw.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Hermes returned no text response");
  }

  return { content, raw };
}

export async function proposeHermesResearchLearning(input: {
  researchRunId: string;
  product: string | null;
  hsCode: string | null;
  targetCountry: string | null;
  direction: string | null;
  result: Record<string, unknown>;
  evidence: Array<Record<string, unknown>>;
}) {
  const compactResult = JSON.stringify({
    researchRunId: input.researchRunId,
    product: input.product,
    hsCode: input.hsCode,
    targetCountry: input.targetCountry,
    direction: input.direction,
    result: input.result,
    evidence: input.evidence,
  }).slice(0, 30_000);

  const system = [
    "You are the approval-gated Hermes learning layer for AKIF inside UDC.",
    "Learn procedures, not transaction facts.",
    "Never approve a company, deal, payment, compliance result, document, inspection, or shipment.",
    "Never store credentials, personal data, bank details, or private document contents in a skill.",
    "If there is a durable procedural lesson, use your skill-management capability to propose/create/patch a focused skill.",
    "Skill writes must remain staged behind Hermes skills.write_approval.",
    "If there is no durable lesson, say so and do not create a skill.",
  ].join(" ");

  const message = [
    "Review this completed AKIF research run.",
    "Identify only durable process improvements that would help future trade research.",
    "Prefer patching the existing akif-trade-research skill rather than creating duplicates.",
    "Preserve provenance requirements and human-review boundaries.",
    "",
    compactResult,
  ].join("\n");

  return runHermesChat(message, system);
}

export function runHermesSkillReviewCommand(
  action: "pending" | "diff" | "approve" | "reject",
  id?: string,
) {
  const command =
    action === "pending"
      ? "/skills pending"
      : `/skills ${action} ${id ?? ""}`.trim();

  return runHermesChat(
    command,
    "Execute only the requested Hermes skills-review command. Do not create, edit, or delete any other skill.",
  );
}


export async function runHermesMultimodal(
  content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  >,
  system?: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ content: string; raw: HermesChatResponse }> {
  const payload = {
    model: "akif-hermes",
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      { role: "user", content },
    ],
    stream: false,
  };

  const raw = await hermesFetch<HermesChatResponse>(
    "/v1/chat/completions",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    timeoutMs,
  );

  const responseContent = raw.choices?.[0]?.message?.content;
  if (typeof responseContent !== "string" || !responseContent.trim()) {
    throw new Error("Hermes returned no multimodal text response");
  }

  return { content: responseContent, raw };
}
