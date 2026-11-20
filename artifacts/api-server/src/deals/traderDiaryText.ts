type Diary={month:string;recordedCompletionTransitions:number;basis:string;notice:string};
export function traderDiaryText(r:Diary){return `Your private diary, ${r.month} UTC: ${r.recordedCompletionTransitions} deals with a recorded transition into completed.\n${r.basis}\n${r.notice}\nSavings and best-seller rankings are not guessed.`;}
