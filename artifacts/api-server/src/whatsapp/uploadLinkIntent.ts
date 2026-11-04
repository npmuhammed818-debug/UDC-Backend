// Plain requests for the document upload link. Explicit phrases only; these go to the real Documents flow, not the chat AI.
export function asksForUploadLink(text: string | null | undefined): boolean {
  if (typeof text !== "string") return false;
  const n = text.trim().toLowerCase().replace(/[?.!]+$/g, "").replace(/\s+/g, " ");
  if (n.length > 80) return false;
  return /^(please )?(send|give) me (the |an? |my )?(upload |document |docs? )?link$/.test(n)
    || /^(please )?(send|give) (the |an? )?(upload|document|docs?) link$/.test(n)
    || /^(how (do i|to|can i) )?(submit|upload|send) (my |the |our )?(docs|documents|company documents|company docs|verification docs|verification documents)( for verification)?$/.test(n)
    || /^where (do i|can i|to) (submit|upload|send) (my |the |our )?(docs|documents)$/.test(n)
    || /^upload (docs|documents)$/.test(n)
    || /^how to (submit|upload) docs$/.test(n);
}
export const ADD_COMPANY_FIRST = "Add your company details first (send Menu, then My profile).";
