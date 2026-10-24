export type EtaState="complete"|"not_recorded"|"on_schedule_unconfirmed"|"overdue_unconfirmed"|"last_report_stale";

const terminal=new Set(["arrived","delivered","cancelled"]);
const inProgress=new Set(["booked","in_transit","on_hold"]);

// Advisory only: a passed ETA does not establish a physical delay.
// No carrier/GPS polling occurs here. All timestamps are recorded by operators.
export function etaAdvisory(
  status:string,
  estimatedArrival:Date|string|null|undefined,
  lastReportedAt:Date|string|null|undefined,
  now:Date=new Date(),
):EtaState{
  if(terminal.has(status))return "complete";
  const eta=estimatedArrival?new Date(estimatedArrival).getTime():NaN;
  if(Number.isFinite(eta)&&eta<now.getTime())return "overdue_unconfirmed";
  const reported=lastReportedAt?new Date(lastReportedAt).getTime():NaN;
  if(inProgress.has(status)&&Number.isFinite(reported)&&
    now.getTime()-reported>48*60*60*1000)return "last_report_stale";
  return Number.isFinite(eta)?"on_schedule_unconfirmed":"not_recorded";
}

export function etaAdvisoryLabel(value:EtaState):string|null{
  switch(value){
    case "overdue_unconfirmed":return "Recorded ETA has passed; arrival is not confirmed. UDC will check with the logistics party.";
    case "last_report_stale":return "No recent confirmed update (over 48 hours). UDC follow-up needed.";
    case "on_schedule_unconfirmed":return "ETA recorded but not independently confirmed.";
    case "not_recorded":return "No ETA recorded.";
    case "complete":return null;
  }
}
