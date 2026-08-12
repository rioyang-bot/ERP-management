const fs = require('fs');
const path = require('path');

const pageConfig = {
  'ConsumableList.jsx': { title: '耗材總表 (Consumables)', icon: 'Package' },
  'Consumables.jsx': { title: '耗材領用 (Consumables Outbound)', icon: 'Package' },
  'DeviceList.jsx': { title: '設備總表 (Device List)', icon: 'Server' },
  'Devices.jsx': { title: '設備建檔 (Device Registration)', icon: 'Server' },
  'HwList.jsx': { title: '硬體總表 (Hardware List)', icon: 'Cpu' },
  // 'HwRegistration.jsx': { title: '硬體建檔 (Hardware Registration)', icon: 'Cpu' },
  'Inbound.jsx': { title: '進貨入庫 (Inbound Receipt)', icon: 'ArrowDownToLine' },
  'Outbound.jsx': { title: '出貨單建檔 (Delivery Note Registration)', icon: 'Truck' },
  'DNList.jsx': { title: '出貨單列表 (D/N List)', icon: 'FileText' },
  'Partners.jsx': { title: '客戶/廠商管理 (Partners)', icon: 'Users' },
  'ProcurementList.jsx': { title: '採購列表 (Procurement Overview)', icon: 'ShoppingCart' },
  'Purchasing.jsx': { title: '採購建檔 (Procurement Registration)', icon: 'ShoppingCart' },
  'Reports.jsx': { title: '報表與分析中心 (Reports)', icon: 'BarChart2' },
  'Settings.jsx': { title: '帳號權限管理', icon: 'Settings' }
};

const pagesDir = path.join(__dirname, '..', 'src', 'pages');

const styleStr = `style={{ fontSize: '24px', fontWeight: '900', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px', color: '#1e293b' }}`;

for (const [filename, config] of Object.entries(pageConfig)) {
  const filePath = path.join(pagesDir, filename);
  if (!fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // 1. Ensure the icon is imported
  const lucideMatch = content.match(/import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]/);
  if (lucideMatch) {
    const imports = lucideMatch[1].split(',').map(s => s.trim());
    if (!imports.includes(config.icon)) {
      imports.push(config.icon);
      content = content.replace(lucideMatch[0], `import { ${imports.join(', ')} } from 'lucide-react'`);
      changed = true;
    }
  } else {
    content = content.replace(/(import React.*?;\n)/, `$1import { ${config.icon} } from 'lucide-react';\n`);
    changed = true;
  }

  // 2. Locate the header line
  const lines = content.split('\n');
  const hLineIndex = lines.findIndex(l => (l.includes('<h1') || l.includes('page-title') || l.includes('dn-title') || l.includes('.title') || l.match(/<h2[^>]*>.*建檔/) || (l.includes('<h2') && filename === 'Consumables.jsx')) && l.includes(config.title.split(' ')[0]));
  
  if (hLineIndex !== -1) {
    // If we have an editMode block in Purchasing.jsx it might look like {!editMode && <h1>...}
    let orig = lines[hLineIndex];
    
    // Build the new header tag
    const newH = `<h1 ${styleStr}>\n            <${config.icon} size={26} color="#2563eb" /> ${config.title}\n          </h1>`;
    
    // Replace the tag
    if (orig.includes('{!editMode &&')) {
       lines[hLineIndex] = `          {!editMode && (\n          ${newH}\n          )}`;
    } else {
       lines[hLineIndex] = `          ${newH}`;
    }
    content = lines.join('\n');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filename}`);
  }
}
