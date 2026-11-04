/** First-response safety net, not diagnosis or emergency monitoring. No model call,
 * provider disclosure, trade action or persistent crisis profile. Staging only. */
export function crisisSafetyReply(text: string, appEnv = process.env.UDC_APP_ENV): string | null {
  if (appEnv !== 'staging') return null;
  const value = text.normalize('NFKC').toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ');
  const explicit = /\b(suicid\w*|self[ -]?harm\w*|kill\s+(myself|yourself|himself|herself)|hurt\s+myself|harm\s+myself|end\s+my\s+life|take\s+my\s+(own\s+)?life|want\s+to\s+die|dont\s+want\s+to\s+(live|be\s+alive)|do\s+not\s+want\s+to\s+live|better\s+off\s+without\s+me|cutting\s+myself|overdos\w*)\b/.test(value)
    || /ആത്മഹത്യ|ജീവനൊടുക്ക|മരിക്കണം|മരിക്കാൻ|മരിക്കാന്|ജീവിക്കാൻ വയ്യ|ജീവിക്കാന് വയ്യ|ജീവിക്കേണ്ട|ജീവിക്കാൻ തോന്നുന്നില്ല|ജീവിക്കാന് തോന്നുന്നില്ല|സ്വയം മുറിവ|എന്നെത്തന്നെ കൊല്ല|ജീവിതം അവസാനിപ്പ|suicide|marikkanam|marikkan thonn|jeevikkan vayya|jeevikkan thonnunnilla|aathmahathya|athmahathya/.test(value);
  if (!explicit) return null;
  const malayalam = /[\u0D00-\u0D7F]|marikkan|jeevikkan|aathmahathya|athmahathya/.test(value);
  const other = /\b(my friend|my brother|my sister|someone|he wants|she wants)\b|എന്റെ സുഹൃത്ത്|എന്റെ സഹോദര/.test(value);
  if (malayalam) return other
    ? 'ഇത് പറഞ്ഞത് നന്നായി. ആ വ്യക്തി ഇപ്പോൾ അപകടത്തിലാണോ? ഉടൻ അപകടമുണ്ടെങ്കിൽ പ്രാദേശിക അടിയന്തര സേവനത്തെ വിളിക്കുകയോ അടുത്ത ആശുപത്രിയിലെ അത്യാഹിത വിഭാഗത്തിലേക്ക് കൊണ്ടുപോകുകയോ ചെയ്യൂ. നിങ്ങൾക്കും സുരക്ഷിതമാണെങ്കിൽ അവരെ ഒറ്റയ്ക്കാക്കരുത്; വിശ്വസിക്കുന്ന ഒരാളുടെ സഹായം തേടൂ. എനിക്ക് അടിയന്തര സഹായം അയയ്ക്കാൻ കഴിയില്ല.'
    : 'നിങ്ങൾ ഇത്ര വേദനയിലാണെന്ന് കേൾക്കുമ്പോൾ വിഷമമുണ്ട്. പറഞ്ഞതിന് നന്ദി. ഇപ്പോൾ സ്വയം പരിക്കേൽപ്പിക്കാനുള്ള അപകടമുണ്ടോ? ഇതിനകം പരിക്കേറ്റിട്ടുണ്ടെങ്കിൽ, അല്ലെങ്കിൽ ഇപ്പോൾ എന്തെങ്കിലും ചെയ്യുമെന്നു തോന്നുന്നെങ്കിൽ, പ്രാദേശിക അടിയന്തര സേവനത്തെ വിളിക്കൂ അല്ലെങ്കിൽ അടുത്ത ആശുപത്രിയിലെ അത്യാഹിത വിഭാഗത്തിലേക്ക് പോകൂ. അപകടകരമായ വസ്തുക്കളിൽ നിന്ന് മാറി, വിശ്വസിക്കുന്ന ഒരാളെ അടുത്തിരിക്കാൻ വിളിക്കൂ. എനിക്ക് അടിയന്തര സഹായം അയയ്ക്കാൻ കഴിയില്ല.';
  return other
    ? 'Thank you for telling me. Is that person in immediate danger? If they may act now or have already been hurt, call local emergency services or go to the nearest emergency department. If it is safe for you, stay with them and bring in someone they trust. I cannot send emergency help.'
    : 'I am sorry you are hurting. Thank you for telling me. Are you in immediate danger of hurting yourself? If you have already hurt yourself or might act now, call local emergency services or go to the nearest emergency department. Move away from anything you could use to hurt yourself and ask someone you trust to stay with you. I cannot send emergency help.';
}
