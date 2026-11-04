const esc=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const phases=[{title:'Match',states:['initiated']},{title:'Terms',states:['negotiation','verification']},{title:'Documents',states:['loi','icpo','fco_sco','contract','banking','inspection','payment','commission']},{title:'Shipping',states:['loading','shipment','delivery']},{title:'Done',states:['completed']}];
export function dealProgress(status:string){
 const index=phases.findIndex(p=>p.states.includes(status));
 return {current:status.replaceAll('_',' '),stage:index<0?null:phases[index].title,stages:phases.map((p,i)=>({title:p.title,state:index<0?'unconfirmed':i===index?'current':i<index?'earlier':'later'})),complete:status==='completed'};
}
/** DB stage is not proof a payment was received or cargo delivered. Unknown,
 * paused and disputed states show no green completed milestones. */
export function statusPicture(input:{dealNumber:string;status:string;asOf:string}){
 const model=dealProgress(input.status),title=esc(input.dealNumber.slice(0,60));
 const bars=model.stages.map((p,i)=>{const x=30+i*102;return `<rect x="${x}" y="148" width="88" height="8" rx="4" fill="${p.state==='current'?'#f26a1b':p.state==='earlier'?'#777':'#ddd'}"/><text x="${x}" y="180" font-size="11" fill="#555">${p.title}</text>`;}).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 570 290" role="img" aria-labelledby="title desc"><title id="title">${title}: ${esc(model.current)}</title><desc id="desc">Recorded UDC deal stage. Not proof of payment or delivery.</desc><rect width="570" height="290" rx="18" fill="#fff"/><rect x="1" y="1" width="568" height="288" rx="18" fill="none" stroke="#ddd"/><g font-family="monospace"><text x="30" y="35" font-size="18" font-weight="bold">UDC<tspan fill="#f26a1b">.</tspan></text><text x="30" y="75" font-size="15">${title}</text><text x="30" y="112" font-size="24">${esc(model.current.toUpperCase())}</text>${bars}<text x="30" y="218" font-size="10" fill="#666">Recorded at ${esc(input.asOf.slice(0,32))}</text><text x="30" y="243" font-size="10" fill="#666">Stage only. Not payment or delivery confirmation.</text><text x="30" y="265" font-size="10" fill="#666">${model.stage?'Earlier stages are not independent evidence.':'Paused, closed or unknown state: progress is unconfirmed.'}</text></g></svg>`;
}
