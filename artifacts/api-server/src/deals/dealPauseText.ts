export type DealPauseKind = "pause" | "close";

// Explicit commands only. Mentions and questions never pause a deal.
export function requestedDealPause(text: string): { kind: DealPauseKind; confirmed: boolean } | null {
  const n = text.trim().replace(/[.!]+$/, "").trim();
  const confirm = n.match(/^confirm (pause|close) deal$/i);
  const ask = n.match(/^(?:please\s+)?(pause|close)\s+(?:this\s+|the\s+)?deal$/i);
  const m = confirm ?? ask;
  return m ? { kind: m[1]!.toLowerCase() as DealPauseKind, confirmed: Boolean(confirm) } : null;
}
export const dealPauseContextKind = (kind: DealPauseKind) => `deal_${kind}_confirm`;

export const dealPausePrompt = (kind: DealPauseKind, dealNumber: string) => kind === "pause"
  ? `Pause deal ${dealNumber}? The other side will be told it is paused. No reason is shared. Reply with the exact words CONFIRM PAUSE DEAL to confirm, or ignore this message.`
  : `Close deal ${dealNumber}? The other side will be told it is closed. No reason is shared. Reply with the exact words CONFIRM CLOSE DEAL to confirm, or ignore this message.`;
// Neutral wording: no blame, no reason, no name, no company.
export const pausedNoticeToOther = (dealNumber: string) => `Deal ${dealNumber} is paused. No action is needed from you right now. UDC will message you if it restarts.`;
export const closedNoticeToOther = (dealNumber: string) => `Deal ${dealNumber} has been closed. Thank you for your time. You can post a new requirement or offer any time.`;
export const pausedConfirmationToSender = (dealNumber: string, told: boolean) => `Done. Deal ${dealNumber} is paused. ${told ? "The other side was told." : "The other side will see it in the app."} UDC admin can restart it.`;
export const closedConfirmationToSender = (dealNumber: string, told: boolean) => `Done. Deal ${dealNumber} is closed. ${told ? "The other side was told." : "The other side will see it in the app."}`;

