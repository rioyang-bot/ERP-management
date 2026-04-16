
import fetch from 'node-fetch'; // I hope node-fetch is available? No, wait, use built-in fetch if node >= 18

async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT 1', params: [] })
    });
    const data = await res.json();
    console.log('Server response:', data);
  } catch (err) {
    console.error('Fetch failed:', err.message);
  }
}

test();
