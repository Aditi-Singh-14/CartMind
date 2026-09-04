import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { Product } from '@/lib/supabase/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transcript } = body;

    if (!transcript || typeof transcript !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid transcript string' },
        { status: 400 }
      );
    }

    const lowerTranscript = transcript.toLowerCase().trim();

    // 1. Check for Recommendation intent
    const recKeywords = [
      'recommend',
      'recommendation',
      'suggest',
      'suggestion',
      'what should i get',
      'what should i buy',
      'optimize',
      'what do you think',
      'upsell'
    ];

    if (recKeywords.some((kw) => lowerTranscript.includes(kw))) {
      return NextResponse.json({
        intent_type: 'get_recommendation',
        matched_product: null,
        feedback_text: 'Fetching AI recommendation for your cart...',
      });
    }

    // 2. Check for Clear Cart intent
    const clearKeywords = ['clear cart', 'empty cart', 'remove all', 'delete cart', 'reset cart'];
    if (clearKeywords.some((kw) => lowerTranscript.includes(kw))) {
      return NextResponse.json({
        intent_type: 'clear_cart',
        matched_product: null,
        feedback_text: 'Cleared all items from your cart.',
      });
    }

    // 3. Fetch products and match product names/categories
    const { data: products } = await supabaseAdmin
      .from('products')
      .select('*');

    if (!products || products.length === 0) {
      return NextResponse.json({
        intent_type: 'unknown',
        matched_product: null,
        feedback_text: `Could not process command: "${transcript}"`,
      });
    }

    // Score products based on name and keyword matches
    let bestMatch: Product | null = null;
    let highestScore = 0;

    for (const product of products as Product[]) {
      const prodNameLower = product.name.toLowerCase();
      const categoryLower = product.category.toLowerCase();

      let score = 0;

      // Exact or partial name match
      if (lowerTranscript.includes(prodNameLower)) {
        score += 100;
      } else {
        // Individual word matching
        const words = prodNameLower.split(/\s+/).filter((w) => w.length > 3);
        for (const word of words) {
          if (lowerTranscript.includes(word)) {
            score += 20;
          }
        }
      }

      // Special alias/short keyword maps
      const aliases: Record<string, string[]> = {
        'running shoes': ['running shoes', 'shoes', 'nitro'],
        'running socks': ['socks', 'running socks', 'anti-blister'],
        'hydration vest': ['vest', 'hydration vest', 'running vest'],
        'water bottle': ['bottle', 'water bottle', 'sport bottle'],
        'compression sleeves': ['sleeves', 'calf sleeves', 'compression'],
        'cast iron skillet': ['skillet', 'cast iron', 'pan'],
        'chef knife': ['knife', 'chef knife', 'damascus'],
        'cutting board': ['board', 'cutting board', 'bamboo board'],
        'milk frother': ['frother', 'milk frother'],
        'storage containers': ['containers', 'glass containers', 'storage'],
        'wireless mouse': ['mouse', 'vertical mouse'],
        'usb hub': ['hub', 'usb-c hub', 'multiport'],
        'mechanical keyboard': ['keyboard', 'rgb keyboard'],
        'earbuds': ['earbuds', 'wireless earbuds', 'anc earbuds'],
        'desk mat': ['desk mat', 'mouse pad', 'felt mat'],
        'vitamin c serum': ['serum', 'vitamin c'],
        'sunscreen': ['sunscreen', 'sunblock', 'spf'],
        'gel cream': ['gel cream', 'hyaluronic'],
        'facial cleanser': ['cleanser', 'foaming cleanser', 'face wash'],
        'night cream': ['night cream', 'niacinamide']
      };

      for (const [key, keywords] of Object.entries(aliases)) {
        if (prodNameLower.includes(key)) {
          for (const kw of keywords) {
            if (lowerTranscript.includes(kw)) {
              score += 35;
            }
          }
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = product;
      }
    }

    if (bestMatch && highestScore >= 15) {
      return NextResponse.json({
        intent_type: 'add_to_cart',
        matched_product: bestMatch,
        feedback_text: `Voice Command: Added "${bestMatch.name}" to cart.`,
      });
    }

    return NextResponse.json({
      intent_type: 'unknown',
      matched_product: null,
      feedback_text: `Unrecognized command: "${transcript}". Try saying "add running shoes" or "what do you recommend".`,
    });
  } catch (err: any) {
    console.error('Voice Intent API Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
