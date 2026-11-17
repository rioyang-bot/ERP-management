/**
 * MAC Address Information（LDA FIREWALL 等設備的出貨文件）
 *
 * 各埠的 MAC 都是 P1 往上加：第 n 埠 = P1 + (n − 1)，16 進位、滿位往前一個位元組進位。
 * 表格一列一組 Pair：Server Port 是 Pk、Exchange Port 是 Pk+1；
 * P3,P4、P7,P8 … P35,P36 沒有，跳過 —— 也就是 P1,P2、P5,P6 … P37,P38，共 10 列。
 * 最後一列 MGT(LAN,IPMI) 不是算的，由管理者自行填寫，可以留空。
 *
 * OUI 取 P1 的前 4 個位元組（例如 a0:19:b2:c0），與 LDA 原本的文件一致。
 */

export const OUI_VENDOR = 'LDA Technologies';
/** 每組 Pair 的第一個埠：1, 5, 9 … 37 */
export const PAIR_STARTS = Array.from({ length: 10 }, (_, i) => 1 + i * 4);
/** 表格會用到的最大埠號 */
export const LAST_PORT = PAIR_STARTS[PAIR_STARTS.length - 1] + 1;
export const OUI_BYTES = 4;

const MAX_MAC = 0xffffffffffffn;

/**
 * 把使用者輸入的 MAC 整理成小寫、冒號分隔；接受 a0:19:b2:c0:c5:95、A0-19-B2-C0-C5-95、
 * a019.b2c0.c595、a019b2c0c595。空白回傳空字串；格式不對回傳 null。
 */
export function normalizeMac(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  const hex = raw.replace(/[\s:.-]/g, '');
  if (!/^[0-9a-fA-F]{12}$/.test(hex)) return null;
  return hex.toLowerCase().match(/.{2}/g).join(':');
}

const toBigInt = (mac) => BigInt(`0x${mac.replace(/:/g, '')}`);
const fromBigInt = (n) => n.toString(16).padStart(12, '0').match(/.{2}/g).join(':');

/** MAC 加上 offset；格式不對或超過 ff:ff:ff:ff:ff:ff 回傳 null */
export function addToMac(mac, offset) {
  const norm = normalizeMac(mac);
  if (!norm) return null;
  const n = toBigInt(norm) + BigInt(offset);
  if (n < 0n || n > MAX_MAC) return null;
  return fromBigInt(n);
}

/** 第 port 埠的 MAC（P1 = 1） */
export const portMac = (baseMac, port) => addToMac(baseMac, port - 1);

/** P1 的前 4 個位元組，例如 a0:19:b2:c0 */
export function ouiOf(baseMac) {
  const norm = normalizeMac(baseMac);
  return norm ? norm.split(':').slice(0, OUI_BYTES).join(':') : '';
}

/**
 * 檢查 P1：空白不算錯（還沒填）；回傳錯誤訊息或空字串
 */
export function validateBaseMac(input) {
  const norm = normalizeMac(input);
  if (norm === '') return '';
  if (norm === null) return 'MAC 格式不正確，請輸入 12 位 16 進位數字，例如 a0:19:b2:c0:c5:95';
  if (!portMac(norm, LAST_PORT)) return `P1 往上加到 P${LAST_PORT} 會超過 ff:ff:ff:ff:ff:ff，請確認 P1 是否正確`;
  return '';
}

/** MGT 的 LAN、IPMI：空白可以，有填就要是 MAC */
export function validateOptionalMac(input) {
  return normalizeMac(input) === null ? 'MAC 格式不正確，請輸入 12 位 16 進位數字' : '';
}

/**
 * 整張表的內容。P1 沒填或不正確時 Server／Exchange Port 留空，Pair 欄照常列出。
 * @returns {{ oui: string, rows: { pair: string, server: string, exchange: string, mgt?: boolean }[] }}
 */
export function buildMacTable({ baseMac = '', mgtLan = '', mgtIpmi = '' } = {}) {
  const valid = !validateBaseMac(baseMac) && normalizeMac(baseMac);
  const rows = PAIR_STARTS.map((p) => ({
    pair: `P${p},P${p + 1}`,
    server: valid ? portMac(valid, p) : '',
    exchange: valid ? portMac(valid, p + 1) : '',
  }));
  rows.push({ pair: 'MGT(LAN,IPMI)', server: normalizeMac(mgtLan) || '', exchange: normalizeMac(mgtIpmi) || '', mgt: true });
  return { oui: valid ? ouiOf(valid) : '', rows };
}

/** 出機檢查表上可以填的三個欄位（logLabel 用在事件紀錄） */
export const MAC_FIELDS = [
  { key: 'baseMac', label: 'P1 MAC (Server Port)', logLabel: 'MAC 表 P1', placeholder: '例如 a0:19:b2:c0:c5:95' },
  { key: 'mgtLan', label: 'MGT LAN MAC', logLabel: 'MAC 表 MGT LAN', placeholder: '管理者自行填寫，可留空' },
  { key: 'mgtIpmi', label: 'MGT IPMI MAC', logLabel: 'MAC 表 MGT IPMI', placeholder: '管理者自行填寫，可留空' },
];

/** 某個欄位的錯誤訊息；沒有錯回傳空字串 */
export const macFieldError = (key, value) => (key === 'baseMac' ? validateBaseMac(value) : validateOptionalMac(value));

/** 這台設備是否需要 MAC 表：符合的主項目只要有一個勾了「需要 MAC 表」 */
export const needsMacTable = (groups, device, matchLevel) =>
  (groups || []).some((g) => g?.mac_table && matchLevel(g, device));
