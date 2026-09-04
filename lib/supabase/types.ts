export type Product = {
  id: string;
  name: string;
  category: string;
  price: number; // in paise (numeric)
  margin_flag: boolean;
  replenishment_cycle_days: number | null;
  created_at: string;
};

export type Customer = {
  id: string;
  name: string;
  is_merchant?: boolean;
  user_id?: string | null;
  created_at: string;
};

export type Order = {
  id: string;
  customer_id: string;
  razorpay_order_id: string | null;
  total_amount: number;
  status: string;
  created_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
};

export type AgentDecision = {
  id: string;
  timestamp: string;
  customer_id: string;
  input_cart: any;
  candidate_item_id: string | null;
  signal_type: string | null;
  reasoning_text: string;
  bound_check_passed: boolean;
  bound_check_rule: string;
  user_response: 'pending' | 'approved' | 'rejected';
  mcp_call: any | null;
  mcp_result: any | null;
  final_status: string;
  revenue_delta: number | null;
};
