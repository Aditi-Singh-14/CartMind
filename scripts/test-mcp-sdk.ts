import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function exploreMcp() {
  console.log('Client class:', typeof Client);
  console.log('SSEClientTransport class:', typeof SSEClientTransport);
}

exploreMcp();
