const db = require('../electron/db.js');
async function migrate() {
  try {
    await db.query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS os VARCHAR(255)`);
    await db.query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS nic VARCHAR(255)`);
    console.log('Migrated os and nic columns successfully.');
  } catch (err) {
    console.error('Error migrating DB:', err);
  } finally {
    process.exit(0);
  }
}
migrate();
