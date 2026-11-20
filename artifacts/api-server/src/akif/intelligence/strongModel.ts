// The strong-model slot for AKIF's profile brain and hard turns. Config setting:
// AKIF_BRAIN_MODEL_PROVIDER=anthropic selects Claude (chosen by the owner,
// 28 Oct); anything else keeps the existing provider chain. The cheap-model
// pick for simple replies is not confirmed yet, so simple turns stay on the
// existing chain.
import { isAnthropicStrongModelEnabled, anthropicStrongModel, runAnthropicChat } from './anthropicClient.ts';
import { runConversationChat } from './hermesClient.ts';

type ChatResult = { content: string };
type FallbackChat = (message: string, system: string | undefined, timeoutMs: number) => Promise<ChatResult>;

export function strongModelName(): string {
  return isAnthropicStrongModelEnabled() ? anthropicStrongModel() : 'default-chain';
}

export async function runStrongModelChat(
  message: string,
  system: string | undefined,
  timeoutMs: number,
  fallback: FallbackChat = runConversationChat,
): Promise<ChatResult> {
  if (isAnthropicStrongModelEnabled()) {
    try {
      return await runAnthropicChat(message, system, timeoutMs);
    } catch (error) {
      console.warn('Anthropic strong model failed; using the default chain', {
        reason: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'provider_request_failed',
      });
    }
  }
  return fallback(message, system, timeoutMs);
}
