const VERIFY_EMAIL_PHRASES = [
  /^(?:(?:please|pls|plz)\s+)?(?:(?:can|could)\s+you\s+)?(?:(?:send|resend|do|start|run)\s+)?(?:(?:i\s+)?(?:want|need)\s+to\s+)?(?:me\s+)?(?:to\s+)?(?:verify|confirm)\s+(?:my\s+|the\s+)?e-?mail(?:\s+(?:address|id))?(?:\s+(?:please|pls|plz))?$/i,
  /^(?:(?:please|pls|plz)\s+)?(?:send|resend|give)\s+(?:me\s+)?(?:the\s+|an?\s+|my\s+)?(?:email\s+|verification\s+)?(?:otp|code)(?:\s+(?:please|pls|plz))?$/i,
];
export function isVerifyEmailRequest(text: string) {
  const t = text.trim().replace(/[.!?\s]+$/g, "").replace(/\s+/g, " ");
  return t.length <= 60 && VERIFY_EMAIL_PHRASES.some((re) => re.test(t));
}


export function isBareAcknowledgement(text: string) {
  return /^(?:ok+|okay+|okey+|oky+|okie|k|kk|fine|sure|alright|all right|cool|noted|got it|understood|thanks|thank you|thx|ty|yes ok|ok thanks|okay thanks)[.! ]*$/i.test(text.trim());
}
