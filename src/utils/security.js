/**
 * 依照 SECURITY_GUIDELINES.md 實作的安全性過濾函式
 * 用於處理 Named Query 的參數過濾
 */
export function sanitizeParams(params) {
  if (!Array.isArray(params)) return [];
  return params.map(val => {
    if (typeof val !== 'string') return val;
    
    // 1. 濾除規範要求的特殊字元列表 (排除雙引號 " 以支援 JSON)
    // | & ; $ % @ ' \ ( ) + CR LF ,
    let s = val.replace(/[|&;$%@'\\()+\r\n]/g, ''); 
    
    // 2. 濾除 Mass SQL Injection 強制要求的關鍵字
    const sqlKeywords = /\b(Select|Insert|Dbo|Declare|Cast|Drop|Union|Exec|Nvarchar)\b/gi;
    s = s.replace(sqlKeywords, '');
    
    return s.trim();
  });
}
