
async function testVoiceIntent() {
  const baseUrl = 'http://localhost:3000';

  console.log('--- Testing Voice Intent API ---');

  const testCases = [
    { transcript: 'add running shoes to my cart' },
    { transcript: 'what do you recommend' },
    { transcript: 'can you recommend something for me' },
    { transcript: 'add night cream to my cart' },
    { transcript: 'clear my cart' },
    { transcript: 'hello test unknown command' }
  ];

  for (const testCase of testCases) {
    console.log(`\nInput Transcript: "${testCase.transcript}"`);
    try {
      const res = await fetch(`${baseUrl}/api/voice-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: testCase.transcript })
      });

      const data = await res.json();
      console.log('Response Status:', res.status);
      console.log('Result:', JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Error calling /api/voice-intent:', err);
    }
  }
}

testVoiceIntent();
