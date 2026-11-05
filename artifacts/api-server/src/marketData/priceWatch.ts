export function priceWatchCommand(text:string){
 const stop=/^price watch off[.!?]?$/i.test(text.trim());if(stop)return {off:true as const};
 const m=/^watch price below (\d{1,15}(?:\.\d{1,2})?) ([A-Za-z]{3})[.!?]?$/i.exec(text.trim());return m?{off:false as const,threshold:m[1],currency:m[2].toUpperCase()}:null;
}
export function priceBelow(price:string,threshold:string){const minor=(x:string)=>{if(!/^\d{1,15}(?:\.\d{1,2})?$/.test(x))return null;const [whole,fraction='']=x.split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));};const p=minor(price),t=minor(threshold);return p!==null&&t!==null&&p>0n&&t>0n&&p<t;}
