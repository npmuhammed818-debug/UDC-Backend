import {minorUnitDigits} from './currencyPrecision.ts';
export type TraderDiscountInput={beneficiaryRole:string;inviterRole:string;currency:string;originalFee:string;existingAgentPool:string;beneficiaryIsFeePayer:boolean};
/** Preview only. No entitlement, redemption, fee, commission or payment is written.
 * Existing agent allocation is an explicit input, never recalculated from the
 * discounted receipt. No new buyer fee or buyer cash reward is inferred. */
export function traderInviteDiscountPreview(input:TraderDiscountInput){
 if(!['buyer','seller'].includes(input.inviterRole)||!['buyer','seller'].includes(input.beneficiaryRole))return {status:'ineligible',reason:'trader_roles_required'} as const;
 if(input.beneficiaryIsFeePayer!==true)return {status:'manual_review',reason:'beneficiary_has_no_confirmed_fee_to_discount'} as const;
 const digits=minorUnitDigits(input.currency);if(digits===null||input.currency!==input.currency.toUpperCase())return {status:'manual_review',reason:'unsupported_currency'} as const;
 const parse=(s:string)=>{if(typeof s!=='string'||s.length>30||!/^\d+(?:\.\d+)?$/.test(s))return null;const [w,f='']=s.split('.');if(f.length>digits)return null;return BigInt(w+f.padEnd(digits,'0'));};
 const fee=parse(input.originalFee),agents=parse(input.existingAgentPool);
 if(fee===null||agents===null||fee<=0n||agents>fee)return {status:'manual_review',reason:'invalid_existing_fee_or_agent_pool'} as const;
 // No rounding convention was approved. Hold fractional minor units for review.
 if(fee%4n!==0n)return {status:'manual_review',reason:'discount_requires_minor_unit_rounding_policy'} as const;
 const discount=fee/4n,net=fee-discount;if(agents>net)return {status:'manual_review',reason:'udc_share_cannot_cover_discount'} as const;
 const format=(n:bigint)=>{const scale=10n**BigInt(digits);return digits?`${n/scale}.${String(n%scale).padStart(digits,'0')}`:String(n);};
 return {status:'preview',discountPercent:25,currency:input.currency,originalFee:format(fee),discount:format(discount),discountedFee:format(net),agentPool:format(agents),udcBefore:format(fee-agents),udcAfter:format(net-agents),agentsUnchanged:true,redemptionRecorded:false,paymentMade:false,notice:'Preview only. Requires a verified trader invitation and the beneficiary next eligible deal. No new buyer fee, cash reward or agent allocation is created.'} as const;
}

/** Buyer launch-cashback arithmetic only. Cohort selection, actual-receipt proof,
 * one-deal eligibility, approval and paid records remain separate guarded work. */
export function buyerCashbackPreview(input:{currency:string;receivedCommission:string;existingAgentPool:string;buyerRole:string;completedDeal:boolean;receiptConfirmed:boolean}){
 if(input.buyerRole!=='buyer')return {status:'ineligible',reason:'buyer_required'} as const;
 if(input.completedDeal!==true||input.receiptConfirmed!==true)return {status:'manual_review',reason:'completed_deal_and_actual_receipt_required'} as const;
 const r=traderInviteDiscountPreview({beneficiaryRole:'buyer',inviterRole:'buyer',currency:input.currency,originalFee:input.receivedCommission,existingAgentPool:input.existingAgentPool,beneficiaryIsFeePayer:true});
 if(r.status!=='preview')return r;
 return {status:'preview',currency:r.currency,receivedCommission:r.originalFee,cashback:r.discount,agentPool:r.agentPool,udcBefore:r.udcBefore,udcAfter:r.udcAfter,cashbackPercent:25,agentsUnchanged:true,cohortLimit:100,eligibilityRecorded:false,owedRecorded:false,adminApprovalRequired:true,paymentMade:false,notice:'Arithmetic preview only. First-100 eligibility and qualifying-deal policy must be verified separately. No buyer fee or automatic payment.'} as const;
}

/** Owner-approved buyer-facing copy. Never promise cashback on every deal. */
export const BUYER_CASHBACK_MARKETING_LINE='First 100 buyers get up to 0.5% cashback on their first deal.';
