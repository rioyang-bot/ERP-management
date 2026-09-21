/**
 * 客戶與聯絡人的對應
 *
 * partners 表是「一位聯絡人一列」，同一家公司有幾位聯絡人就有幾列。
 * 直接把整個清單丟進下拉選單，看到的會是同一個公司名重複好幾次、
 * 分不出誰是誰（datalist 甚至會把相同的值合併掉）。
 */

const norm = (v) => String(v ?? '').trim();
const key = (v) => norm(v).toUpperCase();

/**
 * 去重後的公司名稱清單，供客戶名稱的建議選單使用。
 *
 * @param {Array<{name: string}>} partners
 * @returns {string[]} 依原本的順序，不重複
 */
export function getCustomerNames(partners) {
  const seen = new Set();
  const names = [];
  (Array.isArray(partners) ? partners : []).forEach((p) => {
    const name = norm(p?.name);
    if (!name || seen.has(key(name))) return;
    seen.add(key(name));
    names.push(name);
  });
  return names;
}

/**
 * 某一家公司底下的聯絡人。
 *
 * 公司名以不分大小寫、去前後空白的方式比對 —— 使用者是用打字的，
 * 大小寫與多餘空白不該讓聯絡人找不到。沒有填聯絡人的那幾列不列入。
 *
 * @param {Array<{name: string, contact?: string, contact_person?: string, phone?: string}>} partners
 * @param {string} customerName
 * @returns {Array<{contact: string, phone: string}>} 依原順序，同名聯絡人只留一筆
 */
export function getContactsForCustomer(partners, customerName) {
  const target = key(customerName);
  if (!target) return [];

  const seen = new Set();
  const contacts = [];
  (Array.isArray(partners) ? partners : []).forEach((p) => {
    if (key(p?.name) !== target) return;
    const contact = norm(p?.contact ?? p?.contact_person);
    if (!contact || seen.has(key(contact))) return;
    seen.add(key(contact));
    contacts.push({ contact, phone: norm(p?.phone) });
  });
  return contacts;
}

/**
 * 依公司與聯絡人找出電話。找不到就回空字串。
 */
export function findContactPhone(partners, customerName, contactPerson) {
  const found = getContactsForCustomer(partners, customerName)
    .find((c) => key(c.contact) === key(contactPerson));
  return found ? found.phone : '';
}

export default getContactsForCustomer;
