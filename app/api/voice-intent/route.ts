import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { Product } from '@/lib/supabase/types';
import { getRecommendations } from '@/lib/recommendation/engine';

// Tool Declarations for Gemini API function calling
const AGENT_TOOLS = [
  {
    function_declarations: [
      {
        name: 'search_catalog',
        description: 'Search product catalog using semantic or keyword query (e.g. "niacinamide", "dry skin", "running", "pan").',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: {
              type: 'STRING',
              description: 'The search query or category/ingredient/attribute.'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'add_to_cart',
        description: 'Add a specific product from the catalog to the customer cart.',
        parameters: {
          type: 'OBJECT',
          properties: {
            product_id: {
              type: 'STRING',
              description: 'The exact UUID product ID from search results or catalog.'
            },
            quantity: {
              type: 'NUMBER',
              description: 'Quantity of the item to add. Default is 1.'
            }
          },
          required: ['product_id']
        }
      },
      {
        name: 'remove_from_cart',
        description: 'Remove a specific product from the cart.',
        parameters: {
          type: 'OBJECT',
          properties: {
            product_id: {
              type: 'STRING',
              description: 'The exact UUID product ID to remove from cart.'
            }
          },
          required: ['product_id']
        }
      },
      {
        name: 'get_recommendations',
        description: 'Get AI recommendations, upsells, or replenishment items for the active cart.',
        parameters: {
          type: 'OBJECT',
          properties: {
            customer_id: {
              type: 'STRING',
              description: 'Customer ID for personalized recommendation history.'
            }
          }
        }
      },
      {
        name: 'initiate_checkout',
        description: 'Initiate checkout session with optional pre-selected payment method (e.g. netbanking, upi, card).',
        parameters: {
          type: 'OBJECT',
          properties: {
            payment_method_preference: {
              type: 'STRING',
              description: 'Customer preferred payment method if specified (e.g. netbanking, upi, card).'
            }
          }
        }
      }
    ]
  }
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transcript, cart = [], customer_id } = body;

    if (!transcript || typeof transcript !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid transcript string' },
        { status: 400 }
      );
    }

    // 1. Fetch entire product catalog for context / search tool implementation
    const { data: products } = await supabaseAdmin
      .from('products')
      .select('*')
      .order('name', { ascending: true });

    const catalogList = (products || []) as Product[];

    // Build active cart details
    const activeCartItems = catalogList.filter(p => cart.includes(p.id));

    // Internal tool implementations
    const toolImplementations: Record<string, Function> = {
      search_catalog: ({ query }: { query: string }) => {
        const q = (query || '').toLowerCase();
        const words = q.split(/\s+/).filter(w => w.length > 2);
        
        const matches = catalogList.filter(p => {
          const name = p.name.toLowerCase();
          const cat = p.category.toLowerCase();
          return name.includes(q) || cat.includes(q) || words.some(w => name.includes(w) || cat.includes(w));
        });

        return {
          query,
          match_count: matches.length,
          matches: matches.map(m => ({
            id: m.id,
            name: m.name,
            category: m.category,
            price_inr: m.price / 100,
            replenishment_cycle_days: m.replenishment_cycle_days
          }))
        };
      },

      add_to_cart: ({ product_id, quantity = 1 }: { product_id: string; quantity?: number }) => {
        const product = catalogList.find(p => p.id === product_id);
        return {
          success: !!product,
          product_id,
          product_name: product?.name || 'Unknown Item',
          quantity: quantity || 1
        };
      },

      remove_from_cart: ({ product_id }: { product_id: string }) => {
        const product = catalogList.find(p => p.id === product_id);
        return {
          success: true,
          product_id,
          product_name: product?.name || 'Item'
        };
      },

      get_recommendations: async ({ customer_id: cid }: { customer_id?: string }) => {
        const targetCid = cid || customer_id;
        if (!targetCid) return { error: 'Customer ID required for recommendations' };
        const recs = await getRecommendations(targetCid, cart, 3);
        const validRecs = recs.filter(r => r.bound_check_passed && r.candidate);
        return {
          recommendations: validRecs.map(r => ({
            product_id: r.candidate?.id,
            name: r.candidate?.name,
            reasoning: r.reasoning,
            signal_type: r.signal_type
          }))
        };
      },

      initiate_checkout: ({ payment_method_preference }: { payment_method_preference?: string }) => {
        return {
          action: 'initiate_checkout',
          payment_method_preference: payment_method_preference || 'default'
        };
      }
    };

    // 2. System prompt instructions (including Hindi detection & response support)
    const systemInstruction = `You are CartMind's autonomous E-Commerce AI Agent.
You assist customers in real time with product discovery, cart modifications, AI recommendations, and checkout.

HINDI & MULTILINGUAL SUPPORT:
- Detect if the user's transcript is written in Hindi (using Devanagari script or Hinglish/Roman script).
- If the user spoke or typed in Hindi/Hinglish, your thought_process, final response, and feedback MUST be written in natural, helpful Hindi (or Hinglish).
- If the user spoke in English, respond in English.

AVAILABLE TOOLS:
- search_catalog(query): Search for products by name, category, ingredient, benefit, or intent.
- add_to_cart(product_id, quantity): Add item to cart.
- remove_from_cart(product_id): Remove item from cart.
- get_recommendations(customer_id): Retrieve AI cart upsell/replenishment recommendations.
- initiate_checkout(payment_method_preference): Initiate checkout with preferred payment method (e.g. netbanking, upi, card).

PRODUCT CATALOG SUMMARY:
${catalogList.map(p => `- ID: ${p.id} | Name: "${p.name}" | Category: ${p.category} | Price: ₹${p.price/100}`).join('\n')}

ACTIVE CART ITEMS:
${activeCartItems.length > 0 ? activeCartItems.map(p => `"${p.name}" (ID: ${p.id})`).join(', ') : 'Cart is currently empty.'}

INSTRUCTIONS:
1. Always analyze customer intent open-endedly. First call appropriate tools (e.g., search_catalog for ingredients/categories like "niacinamide", "sunscreen", "skincare", "shoes", "pan").
2. Provide a clear reasoning trace (thought process) for UI visibility.
3. If an item match is found from search or explicit request, you may invoke add_to_cart.`;

    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    let steps: Array<{ step: string; detail: string }> = [];
    let agentAction: any = { intent_type: 'unknown', matched_product: null, feedback_text: '' };

    if (geminiApiKey) {
      try {
        // Multi-turn tool execution loop with Gemini 1.5 Flash
        let conversationContents: any[] = [
          { role: 'user', parts: [{ text: `CUSTOMER UTTERANCE: "${transcript}"` }] }
        ];

        let maxLoops = 4;
        let finalReplyText = '';

        while (maxLoops > 0) {
          maxLoops--;

          const cleanKey = geminiApiKey.trim();
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${cleanKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                system_instruction: { parts: [{ text: systemInstruction }] },
                contents: conversationContents,
                tools: AGENT_TOOLS,
                generationConfig: {
                  temperature: 0.2
                }
              })
            }
          );

          if (!geminiRes.ok) {
            const errBody = await geminiRes.text();
            console.error('Gemini Tool-Call API error:', errBody);
            break;
          }

          const geminiData = await geminiRes.json();
          const candidate = geminiData.candidates?.[0];
          const parts = candidate?.content?.parts || [];

          let functionCallPart = parts.find((p: any) => p.functionCall);
          let textPart = parts.find((p: any) => p.text);

          if (textPart?.text) {
            finalReplyText += textPart.text + ' ';
          }

          if (functionCallPart) {
            const call = functionCallPart.functionCall;
            const toolName = call.name;
            const toolArgs = call.args || {};

            // Record agent reasoning step for UI
            const stepDesc = `Calling ${toolName}(${JSON.stringify(toolArgs)})`;
            steps.push({
              step: toolName,
              detail: `Agent decided to execute tool ${toolName} with parameters ${JSON.stringify(toolArgs)}`
            });

            // Execute local tool logic
            let toolResult: any = { error: 'Unknown tool' };
            if (toolImplementations[toolName]) {
              toolResult = await toolImplementations[toolName](toolArgs);
            }

            // Record result detail
            if (toolName === 'search_catalog') {
              steps.push({
                step: 'search_results',
                detail: `Found ${toolResult.match_count || 0} candidate item(s) matching "${toolArgs.query}"`
              });
              if (toolResult.matches?.[0]) {
                agentAction.matched_product = catalogList.find(p => p.id === toolResult.matches[0].id) || null;
                agentAction.intent_type = 'search';
              }
            } else if (toolName === 'add_to_cart') {
              const addedProd = catalogList.find(p => p.id === toolArgs.product_id);
              if (addedProd) {
                agentAction.matched_product = addedProd;
                agentAction.intent_type = 'add_to_cart';
              }
              steps.push({
                step: 'cart_updated',
                detail: `Adding "${toolResult.product_name}" to shopping cart.`
              });
            } else if (toolName === 'remove_from_cart') {
              const remProd = catalogList.find(p => p.id === toolArgs.product_id);
              if (remProd) {
                agentAction.matched_product = remProd;
                agentAction.intent_type = 'remove_from_cart';
              }
              steps.push({
                step: 'cart_updated',
                detail: `Removing "${toolResult.product_name}" from cart.`
              });
            } else if (toolName === 'get_recommendations') {
              agentAction.intent_type = 'ask_recommendation';
              steps.push({
                step: 'recommendations_retrieved',
                detail: `Retrieved ${toolResult.recommendations?.length || 0} personalized AI recommendation(s).`
              });
            } else if (toolName === 'initiate_checkout') {
              agentAction.intent_type = 'checkout';
              agentAction.payment_method_preference = toolArgs.payment_method_preference || 'default';
              steps.push({
                step: 'checkout_initiated',
                detail: `Initiating Razorpay payment session (Preferred Method: ${toolArgs.payment_method_preference || 'default'}).`
              });
            }

            // Append model response & function response to conversation contents
            conversationContents.push(candidate.content);
            conversationContents.push({
              role: 'user',
              parts: [
                {
                  functionResponse: {
                    name: toolName,
                    response: toolResult
                  }
                }
              ]
            });
          } else {
            // No more function calls requested by model
            break;
          }
        }

        if (finalReplyText.trim()) {
          agentAction.feedback_text = finalReplyText.trim();
        }
      } catch (err: any) {
        console.error('Gemini Tool Agent Execution Error:', err);
      }
    }

    // High-level heuristic fallback if Gemini API key absent or unreached
    if (steps.length === 0) {
      const lowerTranscript = transcript.toLowerCase();
      const isHindi = /[\u0900-\u097F]/.test(transcript) || lowerTranscript.includes('chahiye') || lowerTranscript.includes('karo') || lowerTranscript.includes('dikhao') || lowerTranscript.includes('bhejo');

      if (lowerTranscript.includes('netbanking') || lowerTranscript.includes('checkout') || lowerTranscript.includes('pay') || lowerTranscript.includes('buy now') || lowerTranscript.includes('भुगतान')) {
        let pref = 'default';
        if (lowerTranscript.includes('netbanking')) pref = 'netbanking';
        else if (lowerTranscript.includes('upi')) pref = 'upi';
        else if (lowerTranscript.includes('card')) pref = 'card';

        steps.push({
          step: 'initiate_checkout',
          detail: `Agent executing initiate_checkout(payment_method_preference="${pref}")`
        });
        agentAction = {
          intent_type: 'checkout',
          payment_method_preference: pref,
          matched_product: null,
          feedback_text: isHindi
            ? `Razorpay ${pref !== 'default' ? pref : ''} चेकआउट प्रक्रिया शुरू की जा रही है...`
            : `Initiating Razorpay checkout session (${pref} mode selected)...`
        };
      } else if (lowerTranscript.includes('recommend') || lowerTranscript.includes('suggest') || lowerTranscript.includes('sujhav') || lowerTranscript.includes('सुझाव')) {
        steps.push({
          step: 'get_recommendations',
          detail: `Agent executing get_recommendations(customer_id="${customer_id || 'active'}")`
        });
        agentAction = {
          intent_type: 'ask_recommendation',
          matched_product: null,
          feedback_text: isHindi
            ? 'आपकी कार्ट के लिए एआई सुझाव लोड किए जा रहे हैं...'
            : 'Fetching AI recommendations for your cart...'
        };
      } else {
        // Search & Match in catalog
        let query = transcript;
        let matched: Product | null = null;
        for (const p of catalogList) {
          const pName = p.name.toLowerCase();
          const pCat = p.category.toLowerCase();
          if (lowerTranscript.includes(pName) || lowerTranscript.includes(pCat)) {
            matched = p;
            break;
          }
        }

        if (!matched) {
          // Check words like niacinamide, serum, shoes, pan, fluid
          const words = lowerTranscript.split(/\s+/);
          for (const w of words) {
            if (w.length > 3) {
              const found = catalogList.find(p => p.name.toLowerCase().includes(w) || p.category.toLowerCase().includes(w));
              if (found) {
                matched = found;
                break;
              }
            }
          }
        }

        steps.push({
          step: 'search_catalog',
          detail: `Agent executing search_catalog(query="${query}")`
        });

        if (matched) {
          const isAdd = lowerTranscript.includes('add') || lowerTranscript.includes('buy') || lowerTranscript.includes('लाओ') || lowerTranscript.includes('जोड़ो');
          if (isAdd) {
            steps.push({
              step: 'add_to_cart',
              detail: `Agent executing add_to_cart(product_id="${matched.id}")`
            });
            agentAction = {
              intent_type: 'add_to_cart',
              matched_product: matched,
              feedback_text: isHindi
                ? `"${matched.name}" आपकी कार्ट में जोड़ दिया गया है।`
                : `Added "${matched.name}" to cart.`
            };
          } else {
            agentAction = {
              intent_type: 'search',
              matched_product: matched,
              feedback_text: isHindi
                ? `कैटलॉग में मैच मिला: "${matched.name}" (₹${matched.price/100})`
                : `Found match in catalog: "${matched.name}" (₹${matched.price/100}).`
            };
          }
        } else {
          agentAction = {
            intent_type: 'unknown',
            matched_product: null,
            feedback_text: isHindi
              ? `क्षमा करें, "${transcript}" का कोई उत्पाद नहीं मिला। "सनस्क्रीन" या "निऐसिनामाइड" खोजें।`
              : `Processed: "${transcript}". No exact match found in catalog.`
          };
        }
      }
    }

    if (!agentAction.feedback_text) {
      if (agentAction.intent_type === 'add_to_cart' && agentAction.matched_product) {
        agentAction.feedback_text = `Added "${agentAction.matched_product.name}" to your cart.`;
      } else if (agentAction.intent_type === 'checkout') {
        agentAction.feedback_text = `Initiating Razorpay checkout (${agentAction.payment_method_preference || 'default'})...`;
      } else if (agentAction.intent_type === 'ask_recommendation') {
        agentAction.feedback_text = `Retrieved AI recommendations for your cart.`;
      } else {
        agentAction.feedback_text = `Processed request: "${transcript}"`;
      }
    }

    return NextResponse.json({
      intent_type: agentAction.intent_type,
      matched_product: agentAction.matched_product,
      payment_method_preference: agentAction.payment_method_preference || null,
      feedback_text: agentAction.feedback_text,
      reasoning_steps: steps
    });

  } catch (err: any) {
    console.error('API /api/voice-intent Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
