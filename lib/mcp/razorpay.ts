import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

export type RazorpayMcpCreateOrderArgs = {
  amount: number; // in paise
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
};

export const RAZORPAY_MCP_ENDPOINT = 'https://mcp.razorpay.com/mcp';

/**
 * Streamable HTTP Transport for MCP JSON-RPC protocol over POST https://mcp.razorpay.com/mcp
 */
export class RazorpayHttpMcpTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private isConnected = false;
  private authHeader: string;

  constructor(authHeader: string) {
    this.authHeader = authHeader;
  }

  async start(): Promise<void> {
    this.isConnected = true;
  }

  async close(): Promise<void> {
    this.isConnected = false;
    this.onclose?.();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.isConnected) {
      throw new Error('MCP Transport is not connected');
    }

    try {
      const res = await fetch(RAZORPAY_MCP_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.authHeader
        },
        body: JSON.stringify(message)
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`MCP Server HTTP ${res.status}: ${errorText}`);
      }

      const text = await res.text();
      if (!text || text.trim() === '') {
        return; // Notification response (e.g. notifications/initialized)
      }

      const jsonRpcResponse = JSON.parse(text) as JSONRPCMessage;
      this.onmessage?.(jsonRpcResponse);
    } catch (err: any) {
      this.onerror?.(err);
      throw err;
    }
  }
}

/**
 * Execute Razorpay order creation via @modelcontextprotocol/sdk Client
 */
export async function createOrderViaMcp(args: RazorpayMcpCreateOrderArgs): Promise<{
  mcp_call: any;
  mcp_result: any;
  razorpay_order_id: string;
  mcp_endpoint: string;
}> {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';

  if (!keyId || !keySecret) {
    throw new Error('Missing Razorpay credentials (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) in environment');
  }

  const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const transport = new RazorpayHttpMcpTransport(authHeader);

  const client = new Client(
    { name: 'cartmind-app', version: '1.0.0' },
    { capabilities: {} }
  );

  // 1. Connect MCP Client over Streamable HTTP Transport
  await client.connect(transport);

  // 2. Construct MCP JSON-RPC Protocol Request Payload
  const mcpCallPayload = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'create_order',
      arguments: {
        amount: args.amount,
        currency: args.currency || 'INR',
        receipt: args.receipt,
        notes: args.notes
      }
    }
  };

  // 3. Execute MCP tools/call via MCP SDK Client
  const mcpResult = await client.callTool({
    name: 'create_order',
    arguments: {
      amount: args.amount,
      currency: args.currency || 'INR',
      receipt: args.receipt,
      notes: args.notes
    }
  });

  await client.close();

  // 4. Parse Order ID from genuine MCP Result content
  let razorpayOrderId = '';
  if (Array.isArray(mcpResult.content) && mcpResult.content.length > 0) {
    const textContent = (mcpResult.content[0] as any).text;
    if (textContent) {
      try {
        const parsed = JSON.parse(textContent);
        razorpayOrderId = parsed.id || '';
      } catch (e) {
        console.error('Error parsing order JSON from MCP text content:', e);
      }
    }
  }

  if (!razorpayOrderId) {
    throw new Error(`Failed to extract razorpay_order_id from MCP result: ${JSON.stringify(mcpResult)}`);
  }

  return {
    mcp_call: mcpCallPayload,
    mcp_result: mcpResult,
    razorpay_order_id: razorpayOrderId,
    mcp_endpoint: RAZORPAY_MCP_ENDPOINT
  };
}
