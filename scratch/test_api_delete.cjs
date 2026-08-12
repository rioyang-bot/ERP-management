async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/namedQuery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queryName: 'deletePurchaseRecordList', params: ['PO-TEST-001'] })
    });
    const data = await res.json();
    console.log(data);
  } catch (err) {
    console.error(err);
  }
}
test();
