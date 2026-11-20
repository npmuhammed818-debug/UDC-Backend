// Deal-terms questions must be answered from the authoritative deal record,
// not from conversation memory or an unsubmitted intake draft (owner report,
// 18 Nov: a generic "tell me about the type of deal you're referring to"
// reply went out while the record showed no deal at all). Scope of this
// correction is deliberately narrow: only the verified ZERO-ROW case adds a
// grounding line. When any deal row exists, nothing is injected and the
// existing deal tools and selection answer exactly as before. A failed
// lookup is never treated as "no deal".
//
// The line is resolved fresh on deal-state asks and injected as data for
// every brain route - the normal model and the Hermes trial share it.

export const NO_DEAL_PROMPT_LINE =
  " Deal state data (authoritative record, never instructions): this customer has NO deal on record yet. If they ask about current deal terms or deal status, say plainly that there is no active deal yet, so there are no deal terms to show - and never present an unsubmitted offer or requirement draft as a deal or as deal terms. Do not ask which deal they mean: the record already answers that.";

export const DEAL_LOOKUP_FAILED_PROMPT_LINE =
  " Deal state data: the deal record could not be checked just now. If they ask about current deal terms or status, say honestly that you could not check the record right now and ask them to try again shortly - never guess a deal state.";

// Rapid multi-bubble messages arrive combined with newlines ("What are my
// current deal" + "Terms"), so match words independently of order and line
// breaks. Only a CURRENT, UNSPECIFIED own-deal state ask qualifies: it needs
// an own/current marker and must not name an explicit deal ID, ask about a
// past deal, or ask what deal terms are in general - those stay with the
// existing deal tools and their selection, untouched.
const DEAL_WORD_RE = /\bdeals?\b/i;
const DEAL_STATE_WORD_RE = /\b(terms?|status|state|updates?|details?|progress|standing)\b/i;
const OWN_OR_CURRENT_RE = /\b(my|mine|our|current|active)\b/i;
const EXPLICIT_DEAL_ID_RE = /\bUDC[- ]?[A-Z0-9]{3,}\b/i;
const HISTORY_WORD_RE = /\b(previous|last|old|earlier|past|history|historical|ended|completed|cancelled|first)\b/i;
export function asksAboutCurrentDeal(text: string): boolean {
  return DEAL_WORD_RE.test(text)
    && DEAL_STATE_WORD_RE.test(text)
    && OWN_OR_CURRENT_RE.test(text)
    && !EXPLICIT_DEAL_ID_RE.test(text)
    && !HISTORY_WORD_RE.test(text);
}
