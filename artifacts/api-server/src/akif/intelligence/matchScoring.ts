type BuyerMatchInput = {
  productId: string;
  quantity: string | number;
  targetPrice: string | number | null;
  currency: string;
  destination: string;
  preferredIncoterm: string | null;
};

type SellerMatchInput = {
  productId: string;
  quantity: string | number;
  price: string | number;
  currency: string;
  destination: string | null;
  incoterm: string | null;
};

export type MatchAssessment = {
  score: number;
  eligible: boolean;
  reasons: string[];
  warnings: string[];
};

function numberValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sameText(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) return false;
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function scoreBuyerSellerMatch(
  buyer: BuyerMatchInput,
  seller: SellerMatchInput,
): MatchAssessment {
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (buyer.productId !== seller.productId) {
    return {
      score: 0,
      eligible: false,
      reasons: [],
      warnings: ["Products do not match"],
    };
  }

  let score = 35;
  reasons.push("Product matches");

  const buyerQty = numberValue(buyer.quantity);
  const sellerQty = numberValue(seller.quantity);
  if (buyerQty !== null && sellerQty !== null) {
    if (sellerQty >= buyerQty) {
      score += 20;
      reasons.push("Seller quantity can cover the buyer requirement");
    } else if (sellerQty >= buyerQty * 0.8) {
      score += 10;
      reasons.push("Seller quantity covers most of the buyer requirement");
      warnings.push("Seller quantity is below the requested quantity");
    } else {
      warnings.push("Seller quantity is materially below the requested quantity");
    }
  }

  const targetPrice = numberValue(buyer.targetPrice);
  const sellerPrice = numberValue(seller.price);
  if (targetPrice !== null && sellerPrice !== null) {
    if (!sameText(buyer.currency, seller.currency)) {
      warnings.push("Price currencies differ; no FX conversion was applied");
    } else if (sellerPrice <= targetPrice) {
      score += 20;
      reasons.push("Seller price is within the buyer target");
    } else {
      const gap = (sellerPrice - targetPrice) / targetPrice;
      if (gap <= 0.05) {
        score += 10;
        reasons.push("Seller price is within 5% of the buyer target");
      } else {
        warnings.push("Seller price is above the buyer target");
      }
    }
  }

  if (buyer.preferredIncoterm && seller.incoterm) {
    if (sameText(buyer.preferredIncoterm, seller.incoterm)) {
      score += 10;
      reasons.push("Incoterm preference matches");
    } else {
      warnings.push("Incoterm preference differs");
    }
  }

  if (seller.destination) {
    if (sameText(buyer.destination, seller.destination)) {
      score += 10;
      reasons.push("Destination matches");
    } else {
      warnings.push("Seller destination does not exactly match the buyer destination");
    }
  } else {
    score += 5;
    reasons.push("Seller offer is not restricted to a conflicting destination");
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    eligible: score >= 50,
    reasons,
    warnings,
  };
}
