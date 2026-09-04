'use client';

import { useState, useEffect } from 'react';
import { Product } from '@/lib/supabase/types';
import { useCart } from '@/context/CartContext';
import { supabaseClient } from '@/lib/supabase/client';

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  const [addedItemName, setAddedItemName] = useState<string | null>(null);

  const { addToCart, cart } = useCart();

  const [isMerchant, setIsMerchant] = useState(false);

  useEffect(() => {
    async function fetchProductsAndRole() {
      const { data: authData } = await supabaseClient.auth.getUser();
      const user = authData.user;
      setIsMerchant(user?.user_metadata?.is_merchant === true);

      const { data, error } = await supabaseClient
        .from('products')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (!error && data) {
        setProducts(data);
        const cats = Array.from(new Set(data.map((p) => p.category)));
        setCategories(['All', ...cats]);
      }
      setLoading(false);
    }
    fetchProductsAndRole();
  }, []);

  const handleAddToCart = (product: Product) => {
    addToCart(product);
    setAddedItemName(product.name);
    setTimeout(() => setAddedItemName(null), 2000);
  };

  const filteredProducts =
    selectedCategory === 'All'
      ? products
      : products.filter((p) => p.category === selectedCategory);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Product Catalog
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Browse items across categories &amp; add to your shopping cart.
          </p>
        </div>

        {addedItemName && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2 text-xs font-semibold text-emerald-700 shadow-xs">
            ✓ Added &quot;{addedItemName}&quot; to cart
          </div>
        )}
      </div>

      {/* Category Tabs */}
      <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
              selectedCategory === cat
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="mt-12 text-center text-xs text-slate-500">
          Loading catalog items...
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProducts.map((product) => {
            const inCart = cart.some((item) => item.product.id === product.id);

            return (
              <div
                key={product.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300 hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-block rounded-md bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600 uppercase tracking-wider border border-slate-200">
                      {product.category}
                    </span>

                    {isMerchant && product.margin_flag && (
                      <span className="inline-flex items-center rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        High Margin
                      </span>
                    )}
                  </div>

                  <h3 className="mt-3 text-sm font-bold text-slate-900">
                    {product.name}
                  </h3>

                  {product.replenishment_cycle_days && (
                    <p className="mt-1 text-xs text-blue-600 font-medium">
                      🔄 Replenishes ~every {product.replenishment_cycle_days} days
                    </p>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold uppercase">Price</span>
                    <p className="text-base font-extrabold text-slate-900">
                      ₹{(product.price / 100).toLocaleString('en-IN')}
                    </p>
                  </div>

                  <button
                    onClick={() => handleAddToCart(product)}
                    className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                      inCart
                        ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                        : 'bg-blue-600 text-white hover:bg-blue-700 shadow-xs'
                    }`}
                  >
                    {inCart ? 'Add More' : 'Add to Cart'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
