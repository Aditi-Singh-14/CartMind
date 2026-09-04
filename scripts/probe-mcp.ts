import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const keyId = process.env.RAZORPAY_KEY_ID || '';
const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');

async function probeMcpServer() {
  const endpoints = [
    'https://mcp.razorpay.com/mcp',
    'https://mcp.razorpay.com/sse',
    'https://mcp.razorpay.com/',
    'https://mcp.razorpay.com/v1/mcp',
    'https://mcp.razorpay.com/v1/sse',
  ];

  const methods = ['GET', 'POST', 'OPTIONS'];

  console.log('--- PROBING https://mcp.razorpay.com ENDPOINTS ---');

  for (const url of endpoints) {
    for (const method of methods) {
      try {
        const res = await fetch(url, {
          method,
          headers: {
            'Authorization': authHeader,
            'Accept': 'text/event-stream, application/json, */*',
            'Content-Type': 'application/json'
          },
          body: method === 'POST' ? JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2024-11-05',
              capabilities: {},
              clientInfo: { name: 'cartmind', version: '1.0.0' }
            }
          }) : undefined
        });

        console.log(`[${method}] ${url} -> Status: ${res.status} ${res.statusText}`);
        const text = await res.text();
        console.log(`   Response snippet: ${text.substring(0, 150)}`);
      } catch (e: any) {
        console.log(`[${method}] ${url} -> Error: ${e.message}`);
      }
    }
  }
}

probeMcpServer();
