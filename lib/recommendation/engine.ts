import { supabaseAdmin } from '@/lib/supabase/server';
import { Product } from '@/lib/supabase/types';

export type RecommendationResult = {
  candidate: Product | null;
  signal_type: 'replenishment' | 'co_purchase' | null;
  reasoning: string;
  bound_check_passed: boolean;
  bound_check_rule: string;
};

/**
 * Helper to normalize joined Supabase object vs array responses
 */
function normalizeProduct(raw: any): Product | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw as Product;
}

/**
 * 1. SIGNAL B: Replenishment Candidates (All eligible items sorted by daysOverdue)
 */
async function getAllReplenishmentCandidates(
  customerId: string,
  cartProductIds: string[]
): Promise<Array<{ candidate: Product; lastPurchaseDate: Date; daysOverdue: number }>> {
  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select(`
      id,
      created_at,
      order_items (
        product_id,
        products (*)
      )
    `)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (error || !orders) return [];

  const now = new Date();
  const candidatesMap = new Map<string, { candidate: Product; lastPurchaseDate: Date; daysOverdue: number }>();

  for (const order of orders) {
    const orderDate = new Date(order.created_at);
    for (const item of order.order_items || []) {
      const product = normalizeProduct((item as any).products);
      if (!product || !product.replenishment_cycle_days) continue;
      if (cartProductIds.includes(product.id)) continue; // Already in cart

      const daysSincePurchase = Math.floor((now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
      const daysOverdue = daysSincePurchase - product.replenishment_cycle_days;

      if (daysSincePurchase >= product.replenishment_cycle_days) {
        if (!candidatesMap.has(product.id)) {
          candidatesMap.set(product.id, {
            candidate: product,
            lastPurchaseDate: orderDate,
            daysOverdue
          });
        }
      }
    }
  }

  if (candidatesMap.size === 0) return [];

  return Array.from(candidatesMap.values()).sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/**
 * 2. SIGNAL A: Co-Purchase Candidates (Multiple candidates sorted by frequency & margin)
 */
async function getAllCoPurchaseCandidates(
  cartProductIds: string[]
): Promise<Array<{ candidate: Product; triggerItemName: string }>> {
  if (cartProductIds.length === 0) return [];

  // Find orders containing any cart item
  const { data: matchingOrderItems } = await supabaseAdmin
    .from('order_items')
    .select('order_id, product_id')
    .in('product_id', cartProductIds);

  if (!matchingOrderItems || matchingOrderItems.length === 0) return [];

  const matchingOrderIds = Array.from(new Set(matchingOrderItems.map(item => item.order_id)));

  // Fetch all items from those orders
  const { data: coOrderItems } = await supabaseAdmin
    .from('order_items')
    .select('product_id, products(*)')
    .in('order_id', matchingOrderIds);

  if (!coOrderItems) return [];

  // Count co-purchased frequency
  const freqMap = new Map<string, { product: Product; count: number }>();
  for (const item of coOrderItems) {
    const p = normalizeProduct((item as any).products);
    if (!p || cartProductIds.includes(p.id)) continue; // Exclude cart items

    const existing = freqMap.get(p.id);
    if (existing) {
      existing.count += 1;
    } else {
      freqMap.set(p.id, { product: p, count: 1 });
    }
  }

  if (freqMap.size === 0) return [];

  const sorted = Array.from(freqMap.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    // Tie breaker: high margin first
    return (b.product.margin_flag ? 1 : 0) - (a.product.margin_flag ? 1 : 0);
  });

  // Get name of one cart item that triggered this
  const { data: triggerProduct } = await supabaseAdmin
    .from('products')
    .select('name')
    .eq('id', cartProductIds[0])
    .single();

  const triggerItemName = triggerProduct?.name || 'items in your cart';

  return sorted.map(item => ({
    candidate: item.product,
    triggerItemName
  }));
}

/**
 * 3. BOUND CHECK EVALUATION (TIERED CAP)
 * - If cart_total < ₹2,000 (200000 paise): cap = 10% of cart_total (10% tier)
 * - If cart_total >= ₹2,000 (200000 paise): cap = 20% of cart_total (20% tier)
 * - Category check: required for co_purchase, skipped for replenishment.
 */
function evaluateBoundCheck(
  candidate: Product,
  cartProducts: Product[],
  signalType: 'replenishment' | 'co_purchase'
): { passed: boolean; rule: string } {
  const validCart = (cartProducts || []).filter(Boolean);
  const cartTotalPaise = validCart.reduce((sum, p) => sum + (p.price || 0), 0);

  const thresholdPaise = 200000; // ₹2,000 in paise
  const is20PercentTier = cartTotalPaise >= thresholdPaise;
  const tierPercentage = is20PercentTier ? 0.20 : 0.10;
  const tierName = is20PercentTier ? '20% tier' : '10% tier';

  const maxAllowedPrice = Math.floor(tierPercentage * cartTotalPaise);
  const pricePassed = candidate.price <= maxAllowedPrice;

  // Category check: required for co_purchase only
  let categoryPassed = true;
  if (signalType === 'co_purchase') {
    categoryPassed = validCart.some(p => p.category === candidate.category);
  }

  const passed = pricePassed && categoryPassed;

  const candidateInr = Math.round(candidate.price / 100);
  const maxAllowedInr = Math.round(maxAllowedPrice / 100);
  const cartTotalInr = Math.round(cartTotalPaise / 100);

  let ruleDetails = `price ₹${candidateInr} <= cap ₹${maxAllowedInr} (${tierName}, cart ₹${cartTotalInr})`;
  if (signalType === 'co_purchase') {
    ruleDetails += `, category match '${candidate.category}'`;
  } else {
    ruleDetails += `, replenishment category check skipped`;
  }

  if (passed) {
    return {
      passed: true,
      rule: `PASSED: ${ruleDetails}`
    };
  } else if (!pricePassed) {
    return {
      passed: false,
      rule: `FAILED (Price Ceiling Exceeded): Candidate price ₹${candidateInr} exceeds cap ₹${maxAllowedInr} (${tierName}, cart ₹${cartTotalInr})`
    };
  } else {
    return {
      passed: false,
      rule: `FAILED (Category Mismatch): Candidate category '${candidate.category}' does not match cart items`
    };
  }
}

/**
 * 4. REASONING GENERATOR
 */
function generateReasoningText(
  candidate: Product,
  signalType: 'replenishment' | 'co_purchase',
  metadata?: { lastPurchaseDate?: Date; triggerItemName?: string }
): string {
  if (signalType === 'replenishment' && metadata?.lastPurchaseDate) {
    const formattedDate = metadata.lastPurchaseDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    return `You bought ${candidate.name} on ${formattedDate}, it's likely due for a refill.`;
  } else {
    const triggerItem = metadata?.triggerItemName || 'items in your cart';
    return `Customers who buy ${triggerItem} often add ${candidate.name}.`;
  }
}

/**
 * MULTI-CANDIDATE RECOMMENDATION AGENT FUNCTION (UP TO 3-4 CANDIDATES)
 */
export async function getRecommendations(
  customerId: string,
  cartProductIds: string[],
  limit: number = 4
): Promise<RecommendationResult[]> {
  // Fetch products currently in cart
  let cartProducts: Product[] = [];
  if (cartProductIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('products')
      .select('*')
      .in('id', cartProductIds);
    if (data) cartProducts = data;
  }

  const results: RecommendationResult[] = [];
  const addedCandidateIds = new Set<string>();

  // 1. SIGNAL B: Replenishment candidates
  const replenishmentList = await getAllReplenishmentCandidates(customerId, cartProductIds);
  for (const item of replenishmentList) {
    if (results.length >= limit) break;
    if (addedCandidateIds.has(item.candidate.id)) continue;

    const boundCheck = evaluateBoundCheck(item.candidate, cartProducts, 'replenishment');
    const reasoning = generateReasoningText(item.candidate, 'replenishment', { lastPurchaseDate: item.lastPurchaseDate });

    results.push({
      candidate: item.candidate,
      signal_type: 'replenishment',
      reasoning,
      bound_check_passed: boundCheck.passed,
      bound_check_rule: boundCheck.rule
    });

    addedCandidateIds.add(item.candidate.id);
  }

  // 2. SIGNAL A: Co-Purchase candidates (fill remaining slots up to limit)
  if (results.length < limit) {
    const coPurchaseList = await getAllCoPurchaseCandidates(cartProductIds);
    for (const item of coPurchaseList) {
      if (results.length >= limit) break;
      if (addedCandidateIds.has(item.candidate.id)) continue;

      const boundCheck = evaluateBoundCheck(item.candidate, cartProducts, 'co_purchase');
      const reasoning = generateReasoningText(item.candidate, 'co_purchase', { triggerItemName: item.triggerItemName });

      results.push({
        candidate: item.candidate,
        signal_type: 'co_purchase',
        reasoning,
        bound_check_passed: boundCheck.passed,
        bound_check_rule: boundCheck.rule
      });

      addedCandidateIds.add(item.candidate.id);
    }
  }

  // 3. Fallback if no candidate found at all
  if (results.length === 0) {
    results.push({
      candidate: null,
      signal_type: null,
      reasoning: 'No suitable recommendation candidates found for the current cart.',
      bound_check_passed: false,
      bound_check_rule: 'FAILED: No candidate available'
    });
  }

  return results;
}

/**
 * SINGLE CANDIDATE BACKWARD COMPATIBILITY HELPER
 */
export async function getRecommendation(
  customerId: string,
  cartProductIds: string[]
): Promise<RecommendationResult> {
  const recs = await getRecommendations(customerId, cartProductIds, 1);
  return recs[0];
}
