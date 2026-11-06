export function photoQuoteLines(value:unknown){
 const root=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
 if(!Array.isArray(root.items)||root.items.length<1||root.items.length>30)return null;
 const rows=[];
 for(const item of root.items){
  if(!item||typeof item!=='object'||Array.isArray(item))return null;const r=item as Record<string,unknown>;
  if(typeof r.product!=='string'||!r.product.trim()||r.product.length>120||/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(r.product)||typeof r.unitPrice!=='string'||!/^\d{1,15}(?:\.\d{1,6})?$/.test(r.unitPrice)||!/[1-9]/.test(r.unitPrice)||typeof r.currency!=='string'||!/^[A-Z]{3}$/.test(r.currency)||typeof r.unit!=='string'||!['MT','kg','tonne','piece','carton','container'].includes(r.unit))return null;
  rows.push({product:r.product.trim(),unitPrice:r.unitPrice,currency:r.currency,unit:r.unit});
 }
 return rows;
}
