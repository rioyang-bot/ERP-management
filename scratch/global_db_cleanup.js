import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

// 安全過濾正則 (與 server.js 一致)
const charRegex = /[|&;$%@'"\\()+\r\n,]/g;
const keywordRegex = /\b(Select|Insert|Dbo|Declare|Cast|Drop|Union|Exec|Nvarchar)\b/gi;

function sanitize(val) {
  if (typeof val !== 'string') return val;
  return val.replace(charRegex, '').replace(keywordRegex, '').trim();
}

async function globalCleanup() {
  try {
    console.log('開始執行全域安全性資料清理...');

    const tablesToClean = [
      { table: 'item_brands', columns: ['name'] },
      { table: 'item_types', columns: ['name'] },
      { table: 'item_models', columns: ['name'] },
      { table: 'item_master', columns: ['specification', 'type', 'brand', 'model', 'unit'] },
      { table: 'assets', columns: ['sn', 'client', 'hostname', 'location', 'os', 'nic'] }
    ];

    for (const target of tablesToClean) {
      console.log(`正在清理資料表: ${target.table}...`);
      const rows = await pool.query(`SELECT id, ${target.columns.join(', ')} FROM ${target.table}`);
      
      for (const row of rows.rows) {
        let needsUpdate = false;
        const updates = {};
        
        for (const col of target.columns) {
          const original = row[col];
          if (original && typeof original === 'string') {
            const cleaned = sanitize(original);
            if (cleaned !== original) {
              updates[col] = cleaned;
              needsUpdate = true;
            }
          }
        }
        
        if (needsUpdate) {
          const setClause = Object.keys(updates).map((col, k) => `${col} = $${k + 1}`).join(', ');
          const params = Object.values(updates);
          params.push(row.id);
          await pool.query(`UPDATE ${target.table} SET ${setClause} WHERE id = $${params.length}`, params);
          console.log(`  - 已清理 ID ${row.id} 的資料`);
        }
      }
    }

    console.log('--- 全域資料清理完成 ---');
  } catch (err) {
    console.error('清理過程中發生錯誤:', err);
  } finally {
    await pool.end();
  }
}

globalCleanup();
