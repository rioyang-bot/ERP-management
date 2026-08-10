import pg from 'pg';
const { Pool } = pg;

const passwords = ['Admin123', 'admin123', 'postgres', 'password', '123456', 'admin', 'root'];
let successPassword = null;

async function testPasswords() {
  for (const pwd of passwords) {
    const pool = new Pool({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: pwd,
      database: 'postgres' // connect to default db first to check auth
    });
    try {
      const client = await pool.connect();
      client.release();
      successPassword = pwd;
      console.log(`✅ Success with password: ${pwd}`);
      await pool.end();
      break;
    } catch (err) {
      console.log(`❌ Failed with password: ${pwd}`);
      await pool.end();
    }
  }
}

testPasswords();
