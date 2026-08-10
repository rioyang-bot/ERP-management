import pg from 'pg';
import crypto from 'crypto';
const { Pool } = pg;

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db', 
  password: 'admin123',
  port: 5432,
});

async function checkUser() {
  try {
    const client = await pool.connect();
    const res = await client.query("SELECT username, password_hash, role FROM users WHERE username = 'METECH'");
    if (res.rows.length > 0) {
      const dbHash = res.rows[0].password_hash;
      console.log("User METECH hash:", dbHash);
      const isPasswordAdmin = sha256('admin') === dbHash;
      const isPasswordMetech = sha256('METECH') === dbHash;
      console.log("Is password 'admin'?", isPasswordAdmin);
      console.log("Is password 'METECH'?", isPasswordMetech);
    } else {
      console.log("No METECH user found in database!");
    }
    client.release();
  } catch (err) {
    console.error("Error connecting to database:", err.message);
  } finally {
    pool.end();
  }
}

checkUser();
