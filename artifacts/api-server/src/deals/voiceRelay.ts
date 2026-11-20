// Audio is transcribed but never forwarded raw: it can identify a hidden party.
// Only this exact typed command, replying to a saved preview, releases a relay.
export const voiceRelayConfirmation='CONFIRM VOICE RELAY';
export function confirmedVoiceRelay(text:string,voiceTranscript:boolean,contextKind?:string){
 if(voiceTranscript||text.trim().toUpperCase()!==voiceRelayConfirmation)return null;
 const match=contextKind?.match(/^voice_relay_preview:([0-9a-f-]{36})$/i);return match?.[1]??null;
}
export function pendingVoiceRelay(intent:string,relay:boolean,text:unknown){
 return relay&&typeof text==='string'&&text.trim().length>0&&['question','counterparty_question','clarification','deal_question'].includes(intent)&&!/[0-9@]|https?:|accept|agree|reject|offer|price|payment|bank|commission|percent|dollar|rupee|contract|passport|aadhaar|phone|contact|email/i.test(text);
}
