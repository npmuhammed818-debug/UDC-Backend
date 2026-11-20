// The cheap slot for normal replies (owner's model order, 28 Oct): Anthropic
// Haiku first, Groq as backup, the existing provider chain last. Each step is
// env-gated; with no keys the behaviour is exactly today's chain. Injected
// fallbacks keep tests fully offline.
import { isAnthropicStrongModelEnabled, anthropicCheapModel, runAnthropicChat } from './anthropicClient.ts';
import { isGroqConfigured, groqModel, runGroqChat } from './groqClient.ts';
import { runConversationChat } from './hermesClient.ts';

type ChatResult = { content: string };
type FallbackChat = (message: string, system: string | undefined, timeoutMs: number) => Promise<ChatResult>;

export function cheapModelName(): string {
  if (isAnthropicStrongModelEnabled()) return anthropicCheapModel();
  if (isGroqConfigured()) return groqModel();
  return 'default-chain';
}

export async function runCheapModelChat(
  message: string,
  system: string | undefined,
  timeoutMs: number,
  fallback: FallbackChat = runConversationChat,
): Promise<ChatResult> {
  if (isAnthropicStrongModelEnabled()) {
    try {
      return await runAnthropicChat(message, system, timeoutMs, anthropicCheapModel());
    } catch (error) {
      console.warn('Anthropic cheap model failed; trying the backup', {
        reason: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'provider_request_failed',
      });
    }
  }
  if (isGroqConfigured()) {
    try {
      return await runGroqChat(message, system, timeoutMs);
    } catch (error) {
      console.warn('Groq backup failed; using the default chain', {
        reason: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'provider_request_failed',
      });
    }
  }
  return fallback(message, system, timeoutMs);
}
