export function trialOrderCommand(text:string){const m=/^trial order (\d{1,12}(?:\.\d{1,6})?) ([A-Za-z]{1,12})[.!?]?$/i.exec(text.trim());return m?{quantity:m[1],unit:m[2]}:null;}
export function reducedQuantity(proposed:string,original:string){const scale=(s:string)=>{if(!/^\d{1,20}(?:\.\d{1,6})?$/.test(s))return null;const [w,f='']=s.split('.');return BigInt(w)*1000000n+BigInt(f.padEnd(6,'0'));};const p=scale(proposed),o=scale(original);return p!==null&&o!==null&&p>0n&&p<o;}

export function canonicalTrialQuantity(value:string){if(!/^\d{1,20}(?:\.\d{1,6})?$/.test(value))return null;const [whole,fraction='']=value.split('.');const w=whole.replace(/^0+(?=\d)/,'');const f=fraction.replace(/0+$/,'');return w+(f?'.'+f:'');}
