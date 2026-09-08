/**
 * 智慧客戶/廠商與聯絡人比對工具
 * 支援精準、分詞 (Token)、前綴/後綴、以及模糊比對 (例如 'Niky imc' 匹配 'Niky')
 */

/**
 * 字串標準化：轉小寫、去除多餘前後空白
 */
export function normalizeStr(str) {
  return String(str || '').trim().toLowerCase();
}

/**
 * 將字串切割為獨立分詞 (Tokens)
 * 支援中英文、數字，依據常見標點符號、空白與括號分割
 */
export function getTokens(str) {
  if (!str) return [];
  return String(str)
    .toLowerCase()
    .split(/[\s,，、/\\|_\-()（）[\]{}<>:：;；+]+|(?<=[\u4e00-\u9fa5])(?=[a-z0-9])|(?<=[a-z0-9])(?=[\u4e00-\u9fa5])/)
    .map(t => t.trim())
    .filter(Boolean);
}

/**
 * 智慧比對聯絡人與客戶/廠商
 * @param {string} rawContact - 匯入或輸入的聯絡人字串 (例: 'Niky imc')
 * @param {string} rawClient - 匯入或輸入的客戶/廠商名稱 (例: '元大Yuanta' 或 '')
 * @param {Array} partners - 系統中的 partners 清單 (含 id, name, contact, contact_person, phone, type 等)
 * @returns {Object} 比對結果
 */
export function matchPartnerContact(rawContact = '', rawClient = '', partners = []) {
  const cleanRawContact = String(rawContact || '').trim();
  const cleanRawClient = String(rawClient || '').trim();

  // 若兩者皆未輸入，無從比對
  if (!cleanRawContact && !cleanRawClient) {
    return {
      matched: false,
      partner: null,
      contact_person: '',
      contact_phone: '',
      client: '',
      raw_contact: '',
      raw_client: '',
      isFuzzy: false,
      score: 0
    };
  }

  const normRawContact = normalizeStr(cleanRawContact);
  const normRawClient = normalizeStr(cleanRawClient);
  const rawContactTokens = getTokens(cleanRawContact);
  const rawClientTokens = getTokens(cleanRawClient);

  let bestPartner = null;
  let bestScore = 0;
  let bestMatchedProject = '';

  for (const p of partners) {
    if (!p) continue;
    const pContact = String(p.contact || p.contact_person || '').trim();
    const pName = String(p.name || '').trim();
    const pProject = String(p.project_info || '').trim();

    const normPContact = normalizeStr(pContact);
    const normPName = normalizeStr(pName);
    const normPProject = normalizeStr(pProject);
    const pContactTokens = getTokens(pContact);
    const pNameTokens = getTokens(pName);
    const pProjectTokens = getTokens(pProject);

    let score = 0;
    let currentMatchedProject = '';

    // 1. 聯絡人比對 (權重最高)
    if (normRawContact && normPContact) {
      if (normRawContact === normPContact) {
        // 完全一致
        score += 100;
      } else if (rawContactTokens.includes(normPContact)) {
        // 分詞完全命中，例如 'Niky imc' 包含 'niky'
        score += 85;
      } else if (pContactTokens.includes(normRawContact)) {
        // 反向分詞命中，例如 'Niky' 包含在 partner 的 'Niky (宏訊)'
        score += 85;
      } else {
        // 任一 token 命中 (長度 >= 2)
        const commonToken = pContactTokens.some(t => t.length >= 2 && rawContactTokens.includes(t));
        if (commonToken) {
          score += 75;
        } else if (normRawContact.startsWith(normPContact) || normRawContact.endsWith(normPContact)) {
          // 前後綴包含
          score += 70;
        } else if (normRawContact.includes(normPContact) && normPContact.length >= 2) {
          // 子字串包含
          score += 60;
        } else if (normPContact.includes(normRawContact) && normRawContact.length >= 2) {
          score += 50;
        }
      }
    }

    // 2. 客戶/公司名稱比對 (輔助鎖定或單獨補正)
    if (normRawClient && normPName) {
      if (normRawClient === normPName) {
        score += 60;
      } else if (normPName.includes(normRawClient) || normRawClient.includes(normPName)) {
        score += 35;
      } else {
        const commonNameToken = pNameTokens.some(t => t.length >= 2 && rawClientTokens.includes(t));
        if (commonNameToken) score += 25;
      }
    }

    // 3. rawClient 包含聯絡人 (例如 rawClient 為 'Yuanta Ryan'，其中包含 'Ryan')
    if (normRawClient && normPContact) {
      if (rawClientTokens.includes(normPContact)) {
        score += 70;
      } else if (pContactTokens.some(t => t.length >= 2 && rawClientTokens.includes(t))) {
        score += 60;
      } else if (normRawClient.includes(normPContact) && normPContact.length >= 2) {
        score += 50;
      }
    }

    // 4. 特殊狀況：rawContact 中可能包含公司名稱 (例如 '元大 Niky')
    if (normRawContact && normPName && (normRawContact.includes(normPName) || pNameTokens.some(t => t.length >= 2 && rawContactTokens.includes(t)))) {
      score += 30;
    }

    // 5. 特殊狀況：rawContact 為空，但 rawClient 精準比對到唯一客戶，且該客戶有聯絡人
    if (!normRawContact && normRawClient && normRawClient === normPName && normPContact) {
      score += 45;
    }

    // 6. 專案資訊 / 關鍵字比對 (例如 rawContact 為 'Yuanta imc'，其中 'imc' 命中 Niky 的專案資訊 '國法、IMC')
    if (pProject) {
      const rawProjectList = pProject.split(/[\s,，、/\\|;；]+/).map(s => s.trim()).filter(Boolean);
      for (const projName of rawProjectList) {
        const normProj = normalizeStr(projName);
        if (
          rawContactTokens.includes(normProj) || 
          rawClientTokens.includes(normProj) ||
          (normRawContact && normRawContact.includes(normProj)) ||
          (normRawClient && normRawClient.includes(normProj))
        ) {
          currentMatchedProject = projName; // 保留原始大小寫名稱 (如 IMC)
          break;
        }
      }

      if (pProjectTokens.length > 0) {
        // 6.1 rawContact 包含專案 token (如 'imc')
        const matchedContactProjectToken = pProjectTokens.find(t => t.length >= 2 && rawContactTokens.includes(t));
        if (matchedContactProjectToken) {
          score += 85;
          // 若同時 rawContact 包含公司名稱 (例如 'Yuanta imc' 中的 'Yuanta')，加成至精準定址
          if (normRawContact.includes(normPName) || pNameTokens.some(t => t.length >= 2 && rawContactTokens.includes(t))) {
            score += 35;
          }
        }

        // 6.2 rawClient 包含專案 token
        const matchedClientProjectToken = pProjectTokens.find(t => t.length >= 2 && rawClientTokens.includes(t));
        if (matchedClientProjectToken) {
          score += 75;
        }

        // 6.3 子字串直接包含整個專案名稱
        if (normPProject && (normRawContact.includes(normPProject) || normRawClient.includes(normPProject))) {
          score += 65;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestPartner = p;
      bestMatchedProject = currentMatchedProject;
    }
  }

  // 門檻值設定為 50 分以上視為匹配成功
  if (bestPartner && bestScore >= 50) {
    const standardContact = String(bestPartner.contact || bestPartner.contact_person || '').trim();
    const standardPhone = String(bestPartner.phone || '').trim();
    const standardClient = String(bestPartner.name || '').trim();

    return {
      matched: true,
      partner: bestPartner,
      contact_person: standardContact || cleanRawContact,
      contact_phone: standardPhone,
      client: cleanRawClient || standardClient,
      raw_contact: cleanRawContact,
      raw_client: cleanRawClient,
      matched_project: bestMatchedProject || '',
      isFuzzy: cleanRawContact
        ? (normRawContact !== normalizeStr(standardContact))
        : Boolean(standardContact && (normRawClient !== normalizeStr(standardClient) || normRawClient.includes(normalizeStr(standardContact)))),
      score: bestScore
    };
  }

  // 未匹配到則保留原始輸入
  return {
    matched: false,
    partner: null,
    contact_person: cleanRawContact,
    contact_phone: '',
    client: cleanRawClient,
    raw_contact: cleanRawContact,
    raw_client: cleanRawClient,
    matched_project: '',
    isFuzzy: false,
    score: 0
  };
}
