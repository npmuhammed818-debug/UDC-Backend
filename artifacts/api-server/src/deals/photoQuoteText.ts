type PhotoIndex={dealNumber:string;items:Array<{product:string;unitPrice:string;currency:string;unit:string}>;notice:string};
/** Exact extracted strings, never a verified offer. Bounded full labels preserve
 * product suffixes; an omitted row is called out and cannot be reviewed here. */
export function photoQuoteText(index:PhotoIndex){return `${index.dealNumber}: ${index.items.length} unverified extracted price-list rows.\n${index.items.slice(0,8).map((item,i)=>`${i+1}. ${item.product}: ${item.unitPrice} ${item.currency} per ${item.unit}`).join('\n')}\n${index.items.length>8?'Additional rows omitted from this message. Ask UDC for private review.\n':''}${index.notice}`;}
