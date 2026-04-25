const db = require('../electron/db.js');

const data = [
  { "customer": "KGI", "hostname": "", "systemType": "24C", "location": "COLO", "sn": "X0343154", "projectDate": null, "installedDate": null, "custWarr": null, "bcSysDate": null, "bcWarr": "31/05/2027" },
  { "customer": "KGI", "hostname": "BQSE-DMAAPI", "systemType": "24C", "location": "COLO", "sn": "X0341997", "projectDate": null, "installedDate": "26/05/2023", "custWarr": null, "bcSysDate": null, "bcWarr": null },
  { "customer": "KGI", "hostname": "BQSE-DMA5", "systemType": "24C", "location": "COLO", "sn": "X0341998", "projectDate": null, "installedDate": "26/05/2023", "custWarr": null, "bcSysDate": null, "bcWarr": null },
  { "customer": "KGI", "hostname": "BQSE-DMA5", "systemType": "24C", "location": "BQDC", "sn": "X0343004", "projectDate": null, "installedDate": "10/11/2023", "custWarr": null, "bcSysDate": null, "bcWarr": "04/01/2027" },
  { "customer": "KGI", "hostname": "SCXI-UltraProUAT8", "systemType": "24C", "location": "BQDC", "sn": "X0343238", "projectDate": null, "installedDate": "18/01/2024", "custWarr": "18/01/2026", "bcSysDate": null, "bcWarr": null },
  { "customer": "KGI", "hostname": "SCBQ-DMA5-4", "systemType": "24C", "location": "BQDC", "sn": "X0343242", "projectDate": null, "installedDate": "18/01/2024", "custWarr": "18/01/2026", "bcSysDate": null, "bcWarr": "04/01/2027" },
  { "customer": "QuantLab", "hostname": "N/A", "systemType": "8C - 14th", "location": "JPX CC1", "sn": "X0343982", "projectDate": "09/03/2024", "installedDate": "10/07/2024", "custWarr": "10/07/2026", "bcSysDate": null, "bcWarr": "10/07/2026" },
  { "customer": "QuantLab", "hostname": "N/A", "systemType": "8C - 14th", "location": "JPX CC1", "sn": "X0343982-2", "projectDate": "09/03/2024", "installedDate": "10/07/2024", "custWarr": "10/07/2026", "bcSysDate": null, "bcWarr": "10/07/2026" }, // Made unique
  { "customer": "QuantLab", "hostname": "N/A", "systemType": "8C - 14th", "location": "JPX CC1", "sn": "X0343982-3", "projectDate": "09/03/2024", "installedDate": "10/07/2024", "custWarr": "10/07/2026", "bcSysDate": null, "bcWarr": "10/07/2026" }, // Made unique
  { "customer": "Yuanta Ryan", "hostname": "HFT24C-14", "systemType": "24C", "location": "BQDC", "sn": "X0344421", "projectDate": null, "installedDate": "11/07/2024", "custWarr": null, "bcSysDate": null, "bcWarr": "20/06/2027" },
  { "customer": "Yuanta Ryan", "hostname": "HFT24C-15", "systemType": "24C", "location": "BQDC", "sn": "X0344420", "projectDate": null, "installedDate": "11/07/2024", "custWarr": null, "bcSysDate": null, "bcWarr": "20/06/2027" },
  { "customer": "Yuanta Ryan", "hostname": "HFT24C-16", "systemType": "24C", "location": "BQDC", "sn": "X0344419", "projectDate": null, "installedDate": "11/07/2024", "custWarr": null, "bcSysDate": null, "bcWarr": "20/06/2027" },
  { "customer": "Yuanta Ryan", "hostname": "HFT24C-17", "systemType": "24C", "location": "BQDC", "sn": "X0344418", "projectDate": null, "installedDate": "11/07/2024", "custWarr": null, "bcSysDate": null, "bcWarr": "20/06/2027" },
  { "customer": "Yuanta 宏訓", "hostname": "Intorder", "systemType": "24C", "location": "COLO", "sn": "X0344423", "projectDate": null, "installedDate": "12/07/2024", "custWarr": null, "bcSysDate": null, "bcWarr": "20/06/2027" },
  { "customer": "KGI", "hostname": "SCXI-FINIUAT01", "systemType": "24C", "location": "UAT(COLO)", "sn": "X0344425", "projectDate": null, "installedDate": "14/08/2024", "custWarr": "14/08/2026", "bcSysDate": null, "bcWarr": "20/06/2027" },
  { "customer": "KGI", "hostname": "SCXI-FINIUAT012", "systemType": "24C", "location": "UAT(COLO)", "sn": "X0343154-2", "projectDate": null, "installedDate": "14/08/2024", "custWarr": "14/08/2026", "bcSysDate": null, "bcWarr": "20/06/2027" }, // Made unique
  { "customer": "Yuanta Ryan", "hostname": "HFT24C-18", "systemType": "24C", "location": "BQDC", "sn": "X0345115", "projectDate": null, "installedDate": "12/09/2024", "custWarr": null, "bcSysDate": "29/08/2024", "bcWarr": "29/08/2027" },
  { "customer": "Yuanta Ryan", "hostname": "HFT24C-19", "systemType": "24C", "location": "COLO", "sn": "X0345116", "projectDate": null, "installedDate": "19/09/2024", "custWarr": null, "bcSysDate": "29/08/2024", "bcWarr": "29/08/2027" },
  { "customer": "KGI", "hostname": "KGI02", "systemType": "24C", "location": "BQDC", "sn": "X0345118", "projectDate": null, "installedDate": "15/10/2024", "custWarr": null, "bcSysDate": "29/08/2024", "bcWarr": "29/08/2027" },
  { "customer": "KGI", "hostname": "KGI01", "systemType": "24C", "location": "BQDC", "sn": "X0345113", "projectDate": null, "installedDate": "15/10/2024", "custWarr": null, "bcSysDate": "29/08/2024", "bcWarr": "29/08/2027" },
  { "customer": "METECH", "hostname": "SPARE", "systemType": "24C", "location": "", "sn": "X0345117", "projectDate": null, "installedDate": null, "custWarr": null, "bcSysDate": null, "bcWarr": "29/08/2027" },
  { "customer": "Yuanta 期貨", "hostname": "BC-8C-02", "systemType": "8C", "location": "BQDC", "sn": "X0345108", "projectDate": null, "installedDate": "06/05/2025", "custWarr": null, "bcSysDate": null, "bcWarr": "29/08/2027" },
  { "customer": "Yuanta 期貨", "hostname": "BC-8C-03", "systemType": "8C", "location": "BQDC", "sn": "X0345110", "projectDate": null, "installedDate": "06/05/2025", "custWarr": null, "bcSysDate": null, "bcWarr": "29/08/2027" },
  { "customer": "Yuanta 期貨", "hostname": "BC-8C-01", "systemType": "8C", "location": "BQDC", "sn": "X0345107", "projectDate": null, "installedDate": "06/05/2025", "custWarr": null, "bcSysDate": null, "bcWarr": "29/08/2027" },
  { "customer": "Yuanta VIP", "hostname": "YTS-H (S)", "systemType": "8C", "location": "BQDC", "sn": "X0345140", "projectDate": null, "installedDate": "17/01/2025", "custWarr": null, "bcSysDate": null, "bcWarr": "29/08/2027" },
  { "customer": "Yuanta 宏訓", "hostname": "None", "systemType": "8C", "location": "COLO", "sn": "X0345109", "projectDate": null, "installedDate": "08/11/2024", "custWarr": null, "bcSysDate": null, "bcWarr": "29/08/2027" },
  { "customer": "KGI", "hostname": "SCLB-KWXOMS-M", "systemType": "16C", "location": "南京", "sn": "X0343225", "projectDate": null, "installedDate": "12/11/2024", "custWarr": null, "bcSysDate": null, "bcWarr": "30/11/2027" }
];

const parseDate = (ddmmyyyy) => {
  if (!ddmmyyyy) return null;
  const parts = ddmmyyyy.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return null;
};

async function run() {
  try {
    const defaultCatRes = await db.query("SELECT id FROM categories WHERE name = '資訊設備'");
    const catId = defaultCatRes.rows[0].id;

    console.log('Inserting Item Masters...');
    const itemIds = {};
    for (const d of data) {
      if (!itemIds[d.systemType]) {
        const spec = `BlackCore ${d.systemType}`;
        const res = await db.query(
          "INSERT INTO item_master (specification, type, brand, unit, category_id) VALUES ($1, $2, $3, $4, $5) RETURNING id",
          [spec, '伺服器', 'BlackCore', '台', catId]
        );
        itemIds[d.systemType] = res.rows[0].id;
        console.log(`Created item_master: ${spec}`);
      }
    }

    console.log('Inserting Assets...');
    for (const d of data) {
      const itemMasterId = itemIds[d.systemType];
      
      const insDate = parseDate(d.installedDate);
      const custWarr = parseDate(d.custWarr);
      const sysDate = parseDate(d.bcSysDate);
      const warrExp = parseDate(d.bcWarr);
      
      const hostname = d.hostname === 'N/A' || d.hostname === 'None' || !d.hostname ? '' : d.hostname;

      await db.query(`
        INSERT INTO assets 
        (sn, item_master_id, status, hostname, client, location, installed_date, customer_warranty_expire, system_date, warranty_expire)
        VALUES ($1, $2, 'ACTIVE', $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (sn) DO UPDATE SET 
          item_master_id = EXCLUDED.item_master_id,
          hostname = EXCLUDED.hostname,
          client = EXCLUDED.client,
          location = EXCLUDED.location,
          installed_date = EXCLUDED.installed_date,
          customer_warranty_expire = EXCLUDED.customer_warranty_expire,
          system_date = EXCLUDED.system_date,
          warranty_expire = EXCLUDED.warranty_expire
      `, [
        d.sn, itemMasterId, hostname, d.customer, d.location || '',
        insDate, custWarr, sysDate, warrExp
      ]);
      console.log(`Successfully inserted/updated SN: ${d.sn}`);
    }

    console.log('All done!');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

run();
