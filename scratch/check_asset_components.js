import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function checkAssetData() {
  const serverSn = 'X0341997'; // 根據您的輸入
  try {
    console.log(`--- Checking Server: ${serverSn} ---`);
    const serverRes = await pool.query("SELECT id, sn FROM assets WHERE sn = $1", [serverSn]);
    console.log('Server found:', serverRes.rows);

    console.log(`\n--- Looking for Hardware associated with ${serverSn} ---`);
    // 這裡我故意用 LIKE 來抓出所有可能有空格的資料
    const compRes = await pool.query("SELECT id, sn, custom_attributes FROM assets WHERE custom_attributes->>'server_sn' LIKE $1", [`%${serverSn}%`]);
    console.log('Components found:', compRes.rows.map(r => ({
      id: r.id,
      sn: r.sn,
      server_sn_in_attr: r.custom_attributes?.server_sn
    })));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

checkAssetData();
