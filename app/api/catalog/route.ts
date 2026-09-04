import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const revalidate = 0; // Dynamic route

export async function GET() {
  try {
    const { data: products, error } = await supabaseAdmin
      .from('products')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const catalogJsonLd = products.map((product) => ({
      '@context': 'https://schema.org/',
      '@type': 'Product',
      '@id': `urn:cartmind:product:${product.id}`,
      'identifier': product.id,
      'name': product.name,
      'category': product.category,
      'marginFlag': product.margin_flag,
      'offers': {
        '@type': 'Offer',
        'priceCurrency': 'INR',
        'price': Number((product.price / 100).toFixed(2)),
        'priceInPaise': Number(product.price),
        'itemCondition': 'https://schema.org/NewCondition',
        'availability': 'https://schema.org/InStock',
      },
    }));

    return NextResponse.json(catalogJsonLd, {
      status: 200,
      headers: {
        'Content-Type': 'application/ld+json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
