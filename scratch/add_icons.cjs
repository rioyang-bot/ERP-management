const fs = require('fs');
const path = require('path');

const pageConfig = {
  'ConsumableList.jsx': { title: '耗材總表 (Consumables)', icon: 'Package' },
  'Consumables.jsx': { title: '耗材領用 (Consumables Outbound)', icon: 'Package' },
  'DeviceList.jsx': { title: '設備總表 (Device List)', icon: 'Server' },
  'Devices.jsx': { title: '設備建檔 (Device Registration)', icon: 'Server' },
  'HwList.jsx': { title: '硬體總表 (Hardware List)', icon: 'Cpu' },
  'HwRegistration.jsx': { title: '硬體建檔 (Hardware Registration)', icon: 'Cpu' },
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

for (const [filename, config] of Object.entries(pageConfig)) {
  const filePath = path.join(pagesDir, filename);
  if (!fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // 1. Ensure the icon is imported from 'lucide-react'
  const lucideMatch = content.match(/import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]/);
  if (lucideMatch) {
    const imports = lucideMatch[1].split(',').map(s => s.trim());
    if (!imports.includes(config.icon)) {
      imports.push(config.icon);
      content = content.replace(lucideMatch[0], `import { ${imports.join(', ')} } from 'lucide-react'`);
      changed = true;
    }
  } else {
    // If no lucide-react import exists, add it after the React import
    content = content.replace(/(import React.*?;\n)/, `$1import { ${config.icon} } from 'lucide-react';\n`);
    changed = true;
  }

  // 2. Find the page title header
  // Try to find an h1 or h2 with the title text
  const titleRegex = new RegExp(`(<h[12][^>]*>)([\\s\\n]*)(?:\\{![^}]*\\})?(?:.*?|<[^>]+>)*?${config.title.replace(/[\\[\\]\\(\\)\\*\\+]/g, '\\$&')}[^<]*(</h[12]>)`, 'i');
  
  const m = content.match(titleRegex);
  if (m) {
    // Replace the header with standard style
    const standardHeader = `<h1 style={{ fontSize: '24px', fontWeight: '900', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '12px', margin: 0, marginBottom: '24px' }}>
            <${config.icon} size={28} color="var(--primary-color)" />
            ${config.title}
          </h1>`;
    content = content.replace(m[0], standardHeader);
    changed = true;
  } else {
    // Special cases?
    console.log(`Title not found in ${filename}`);
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filename}`);
  }
}
