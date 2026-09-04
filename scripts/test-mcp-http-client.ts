import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const keyId = process.env.RAZORPAY_KEY_ID || '';
const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
const mcpUrl = 'https://mcp.razorpay.com/mcp';

class RazorpayHttpMcpTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private isConnected = false;

  async start(): Promise<void> {
    this.isConnected = true;
  }

  async close(): Promise<void> {
    this.isConnected = false;
    this.onclose?.();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Transport is not connected');
    }

    try {
      console.log(`[OUTBOUND MCP PROTOCOL CALL] POST ${mcpUrl}`);
      console.log(`Payload:`, JSON.stringify(message));

      const res = await fetch(mcpUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify(message)
      });

      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status}: ${await res.text()}`);
      }

      const text = await res.text();
      if (!text || text.trim() === '') {
        return; // Empty notification acknowledgment
      }

      const jsonRpcResponse = JSON.parse(text) as JSONRPCMessage;
      this.onmessage?.(jsonRpcResponse);
    } catch (err: any) {
      this.onerror?.(err);
      throw err;
    }
  }
}

async function testRealMcpClient() {
  console.log(`--- TESTING REAL MCP CLIENT WITH https://mcp.razorpay.com/mcp ---`);

  const transport = new RazorpayHttpMcpTransport();
  const client = new Client(
    { name: 'cartmind-app', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log('MCP Client connected via Streamable HTTP Transport!');

  console.log('\nCalling client.listTools()...');
  const toolsResult = await client.listTools();
  console.log('Tools listed:', toolsResult.tools.map(t => t.name));

  console.log('\nCalling client.callTool({ name: "create_order", arguments }) ...');
  const callToolResult = await client.callTool({
    name: 'create_order',
    arguments: {
      amount: 829700,
      currency: 'INR',
      receipt: 'rcpt_mcp_real_sdk_01',
      notes: {
        test: 'true',
        via: 'modelcontextprotocol_sdk'
      }
    }
  });

  console.log('\n=== GENUINE MCP PROTOCOL RESPONSE (client.callTool) ===');
  console.log(JSON.stringify(callToolResult, null, 2));

  await client.close();
}

testRealMcpClient();
