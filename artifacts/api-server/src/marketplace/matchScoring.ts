type BuyerTerms = {
  quantity: string;
  unit: string;
  targetPrice: string | null;
  currency: string;
  destination: string;
  preferredIncoterm: string | null;
  specification: string | null;
};

type SellerTerms = {
  quantity: string;
  monthlyCapacity: string | null;
  minimumOrderQuantity: string | null;
  unit: string;
  price: string;
  currency: string;
  destination: string | null;
  incoterm: string | null;
  specification: string | null;
};

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function destinationsOverlap(buyer: string, seller: string) {
  const a = normalize(buyer);
  const b = normalize(seller);
  return a === b || (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)));
}

function specificationOverlap(buyer: string, seller: string) {
  const a = new Set(normalize(buyer).split(" ").filter((word) => word.length >= 3));
  const b = new Set(normalize(seller).split(" ").filter((word) => word.length >= 3));
  if (!a.size || !b.size) return false;
  return [...a].some((word) => b.has(word));
}

export function scoreTradeMatch(buyer: BuyerTerms, seller: SellerTerms) {
  let score = 50;
  const reasons = ["same approved product", "both counterparties verified"];
  const buyerQuantity = Number(buyer.quantity);
  const listedQuantity = Number(seller.quantity);
  const monthlyCapacity = Number(seller.monthlyCapacity ?? 0);
  const capacity = Math.max(listedQuantity, monthlyCapacity);
  const sameUnit = normalize(buyer.unit) === normalize(seller.unit);

  if (!sameUnit) {
    score -= 30;
    reasons.push("quantity units differ; manual review needed");
  } else if (capacity >= buyerQuantity) {
    score += 20;
    reasons.push(monthlyCapacity >= buyerQuantity
      ? "monthly capacity covers the request"
      : "available quantity covers the request");
  } else {
    score -= 15;
    reasons.push("listed quantity and monthly capacity are below the request");
  }

  const minimumOrder = Number(seller.minimumOrderQuantity ?? 0);
  if (sameUnit && minimumOrder > 0) {
    if (minimumOrder <= buyerQuantity) {
      score += 5;
      reasons.push("minimum order fits the requested quantity");
    } else {
      score -= 15;
      reasons.push("minimum order exceeds the requested quantity");
    }
  }

  const targetPrice = buyer.targetPrice === null ? undefined : Number(buyer.targetPrice);
  const offerPrice = Number(seller.price);
  if (targetPrice !== undefined && buyer.currency.toUpperCase() === seller.currency.toUpperCase()) {
    if (offerPrice <= targetPrice) {
      score += 15;
      reasons.push("offer is within the buyer's target price");
    } else {
      score -= 10;
      reasons.push("offer is above the buyer's target price");
    }
  }

  if (buyer.preferredIncoterm && seller.incoterm) {
    if (normalize(buyer.preferredIncoterm) === normalize(seller.incoterm)) {
      score += 5;
      reasons.push("preferred Incoterm matches");
    } else {
      score -= 10;
      reasons.push("Incoterm differs from the buyer's preference");
    }
  }

  if (seller.destination) {
    if (destinationsOverlap(buyer.destination, seller.destination)) {
      score += 5;
      reasons.push("destination is compatible");
    } else {
      score -= 10;
      reasons.push("seller destination differs from the request");
    }
  }

  if (buyer.specification && seller.specification) {
    if (specificationOverlap(buyer.specification, seller.specification)) {
      score += 5;
      reasons.push("specification has matching terms; verify full grade details");
    } else {
      score -= 5;
      reasons.push("specification differs and needs review");
    }
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}
