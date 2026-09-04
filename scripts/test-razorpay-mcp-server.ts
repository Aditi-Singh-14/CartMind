import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const keyId = process.env.RAZORPAY_KEY_ID || '';
const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');

async function testRazorpayMcpServer() {
  const mcpUrl = 'https://mcp.razorpay.com/mcp';
  console.log(`Connecting to Razorpay MCP Server at: ${mcpUrl}`);
  console.log(`Using Authorization Header: Basic ${authHeader.substring(6, 16)}...`);

  try {
    const transport = new SSEClientTransport(
      new URL(mcpUrl),
      {
        eventSourceInit: {
          headers: {
            'Authorization': authHeader
          }
        },
        requestInit: {
          headers: {
            'Authorization': authHeader
          }
        }
      }
    );

    const client = new Client(
      { name: 'cartmind-app', version: '1.0.0' },
      { capabilities: {} }
    );

    console.log('Connecting transport...');
    await client.connect(transport);
    console.log('CONNECTED TO RAZORPAY MCP SERVER!');

    console.log('Listing tools...');
    const tools = await client.listTools();
    console.log('Available MCP tools:', JSON.stringify(tools, null, 2));

    console.log('Testing create_order tool via MCP client.callTool()...');
    const result = await client.callTool({
      name: 'create_order',
      arguments: {
        amount: 10000,
        currency: 'INR',
        receipt: 'mcp_sdk_test_01'
      }
    });

    console.log('MCP Tool Call Result:', JSON.stringify(result, null, 2));
    await client.close();
  } catch (err: any) {
    console.error('RAZORPAY MCP SERVER CONNECTION ERROR:', err);
  }
}

testRazorpayMcpServer();
