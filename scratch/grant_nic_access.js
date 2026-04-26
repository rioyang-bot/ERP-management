import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function grantAccess() {
  try {
    console.log('正在為現有使用者開放網卡功能權限...');
    const users = await pool.query('SELECT id, menu_access FROM users');
    
    for (const user of users.rows) {
      const access = user.menu_access || {};
      access['nic-registration'] = true;
      access['nic-list'] = true;
      
      await pool.query('UPDATE users SET menu_access = $1 WHERE id = $2', [JSON.stringify(access), user.id]);
    }
    console.log('權限已開放。');
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

grantAccess();
