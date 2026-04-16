import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'Admin123',
  database: 'ERP_db'
});

const seedSQL = `
UPDATE users SET password_hash = '3b612c75a7b5048a435fb6ec81e52ff92d6d795a8b5a9c17070f6a63c97a53b2' WHERE username = 'admin';

INSERT INTO users (username, password_hash, role, full_name) 
VALUES 
('wang_sh', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', 'WAREHOUSE', '王小華 (總倉管)'),
('chen_it', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', 'IT', '陳大文 (IT專員)')
ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash;
`;

async function run() {
  try {
    const client = await pool.connect();
    console.log('Connected to database');
    await client.query(seedSQL);
    console.log('Seeding successful');
    client.release();
  } catch (err) {
    console.error('Error seeding:', err);
  } finally {
    await pool.end();
  }
}

run();
