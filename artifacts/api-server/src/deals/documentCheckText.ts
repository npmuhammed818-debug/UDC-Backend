type Comparison={extractionAsOf:Date;checks:Array<{field:string;state:string}>;notice:string};
/** Field states only, not extracted private values or model-authored directions. */
export function documentCheckText(result:Comparison){return ['Private extracted-field comparison as of '+result.extractionAsOf.toISOString()+'.',...result.checks.map(c=>c.field.replaceAll('_',' ')+': '+c.state.replaceAll('_',' ')+'.'),result.notice,'Check the original document with UDC. No approval or terms change made.'].join('\n');}
