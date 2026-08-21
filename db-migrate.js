import { query } from './electron/db.js';

async function run() {
  try {
    await query("ALTER TABLE purchase_records ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb");
    console.log("Column added");
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
run();
