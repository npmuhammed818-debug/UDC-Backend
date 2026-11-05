type RecordValue=Record<string,unknown>;
const record=(v:unknown):RecordValue=>v&&typeof v==='object'&&!Array.isArray(v)?v as RecordValue:{};
function decimal(v:unknown){if(typeof v!=='string'&&typeof v!=='number')return null;if(typeof v==='number'&&(!Number.isFinite(v)||Math.abs(v)>Number.MAX_SAFE_INTEGER))return null;const s=String(v);if(!/^\d+(?:\.\d+)?$/.test(s)||s.length>60)return null;const [a,b='']=s.split('.');return a.replace(/^0+(?=\d)/,'')+'.'+b.replace(/0+$/,'');}
/** Exact comparable fields only. Never use model conclusions as proof. */
export function documentCheck(deal:{quantity:string;unit:string;agreedPrice:string;currency:string;incoterm:string|null;destination:string|null},extraction:unknown){
 const data=record(extraction),q=record(data.quantity),p=record(data.pricing),l=record(data.logistics);
 const checks:Array<{field:string;state:'match'|'mismatch'|'not_comparable';recorded:string|null;extracted:string|null}>=[];
 const number=(field:string,a:string,b:unknown,comparable:boolean)=>{const av=decimal(a),bv=decimal(b);checks.push({field,state:!comparable||av===null||bv===null?'not_comparable':av===bv?'match':'mismatch',recorded:a,extracted:typeof b==='string'||typeof b==='number'?String(b).slice(0,100):null});};
 const text=(field:string,a:string|null,b:unknown)=>{const bv=typeof b==='string'?b.trim():null;checks.push({field,state:!a||!bv?'not_comparable':a.trim().toUpperCase()===bv.toUpperCase()?'match':'mismatch',recorded:a?.slice(0,120)??null,extracted:bv?.slice(0,120)??null});};
 const sameUnit=typeof q.unit==='string'&&q.unit.trim().toUpperCase()===deal.unit.trim().toUpperCase();
 const sameCurrency=typeof p.currency==='string'&&p.currency.trim().toUpperCase()===deal.currency.trim().toUpperCase();
 text('quantity_unit',deal.unit,q.unit);number('quantity',deal.quantity,q.value,sameUnit);
 text('currency',deal.currency,p.currency);text('price_basis',deal.unit,p.basis);
 // Only exact unit basis is comparable. No hidden kg/MT, FX or per-container math.
 number('unit_price',deal.agreedPrice,p.unitPrice,sameCurrency&&typeof p.basis==='string'&&p.basis.trim().toUpperCase()===deal.unit.trim().toUpperCase());
 text('incoterm',deal.incoterm,l.incoterm);text('destination',deal.destination,l.destination);
 return {checks,needsHumanReview:true,authenticityVerified:false,notice:'Automated comparison of extracted fields with recorded deal terms. A mismatch is a flag, not a finding of fraud. A match does not approve a document or payment. No unit or currency conversion was done.'};
}
