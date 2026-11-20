/** Curated plain-language summaries, reviewed 2026-11-05. No model-generated
 * legal/payment advice. Source links travel with each explanation. */
const incotermsSource='https://library.iccwbo.org/content/tfb/BOOKS/BK_0049/BK_0049_05_RulesSea.htm?l1=Books&l2=Incoterms%C2%AE+2020';
const terms:Record<string,{meaning:string;example:string;source:string}>={
 FOB:{meaning:'Free On Board: for sea or inland-waterway transport, the seller delivers on board the buyer-nominated vessel at the named shipment port; risk then passes to the buyer.',example:'FOB named shipment port: cargo risk passes on board there, not when it reaches the destination.',source:incotermsSource},
 CIF:{meaning:'Cost Insurance and Freight: for sea or inland-waterway transport, the seller pays freight and agreed insurance to the named destination port, but risk passes when the goods are on board at shipment.',example:'CIF named destination port does not mean the seller keeps transit risk until arrival; check insurance cover separately.',source:incotermsSource},
 CFR:{meaning:'Cost and Freight: for sea or inland-waterway transport, the seller pays carriage to the named destination port; risk passes on board at the shipment port. This rule does not require the seller to buy insurance.',example:'CFR named destination port: freight is paid there, but transit risk has already passed on board at shipment.',source:incotermsSource},
 FAS:{meaning:'Free Alongside Ship: for sea or inland-waterway transport, the seller delivers beside the buyer-nominated ship at the named shipment port; risk passes there.',example:'FAS named shipment port: alongside is not the same as loaded on board.',source:incotermsSource},
 LC:{meaning:'Letter of Credit: a bank payment commitment subject to its terms and the required documents. Document errors can delay payment or cause discrepancies; a bank must review the actual credit.',example:'Ask your bank which documents, dates and fees apply before agreeing. A viewed document or UDC receipt is not bank acceptance.',source:'https://www.trade.gov/letter-credit'},
};
export function termExplanation(text:string){
 const ask=/^(?:explain|what is|what does|meaning of|trade term)\s+(FOB|CIF|CFR|FAS|LC|DLC)(?:\s+mean)?[?.!]?$/i.exec(text.trim());if(!ask)return null;
 const term=ask[1].toUpperCase()==='DLC'?'LC':ask[1].toUpperCase(),entry=terms[term];
 return {term,...entry,notice:term==='LC'?'General learning only. The issuing/advising banks decide the actual credit requirements. No payment approval or guarantee by UDC.':'Incoterms 2020 summary, not a full contract or legal advice. Name the exact port and rule version. Payment, title and dispute terms need separate agreement.',reviewedOn:'2026-11-05'};
}
export function formatTermExplanation(explanation:NonNullable<ReturnType<typeof termExplanation>>){return `${explanation.term}: ${explanation.meaning}\nExample: ${explanation.example}\n${explanation.notice}\nSource: ${explanation.source}`;}
