import React from 'react';

/**
 * 錯誤邊界
 *
 * React 在正式版建置中，只要有一處渲染丟出未捕捉的錯誤，就會把整棵元件樹卸載，
 * 畫面變成全白且沒有任何訊息 —— 使用者只看到「跳到空白頁」，無從得知原因。
 * （開發模式會顯示錯誤覆蓋層，所以本機通常不會察覺。）
 *
 * 這個元件攔截該錯誤，改為顯示可讀的訊息與錯誤內容，讓使用者能回報、
 * 也能直接按「返回」或「重新載入」繼續使用系統，不必重開瀏覽器。
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // 保留在主控台，方便開發者工具查看完整堆疊
    console.error('[ErrorBoundary] 畫面渲染發生未預期錯誤:', error, info);
    this.setState({ info });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleBack = () => {
    this.setState({ error: null, info: null });
    window.history.back();
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const detail = [
      error?.message || String(error),
      info?.componentStack ? `\n元件位置:${info.componentStack}` : '',
    ].join('');

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px', backgroundColor: 'var(--bg-base, #f8fafc)',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", "Microsoft JhengHei", sans-serif',
      }}>
        <div style={{
          maxWidth: '760px', width: '100%', backgroundColor: 'var(--bg-surface, #fff)',
          border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '12px',
          padding: '28px 32px', boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
        }}>
          <h2 style={{ margin: '0 0 8px', fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main, #0f172a)' }}>
            ⚠️ 畫面發生未預期的錯誤
          </h2>
          <p style={{ margin: '0 0 20px', color: 'var(--text-muted, #64748b)', lineHeight: 1.7 }}>
            這個畫面無法正常顯示，但您的資料沒有受到影響。
            可以按「返回上一頁」繼續使用系統；若要回報問題，請把下方的錯誤訊息一併提供。
          </p>

          <pre style={{
            margin: '0 0 20px', padding: '14px 16px', maxHeight: '260px', overflow: 'auto',
            backgroundColor: 'var(--bg-surface-subtle, #f1f5f9)', borderRadius: '8px',
            border: '1px solid var(--border-color, #e2e8f0)',
            fontSize: '12px', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            color: 'var(--text-main, #0f172a)',
          }}>{detail}</pre>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={this.handleBack}
              style={{
                padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700,
                border: '1px solid var(--border-color, #cbd5e1)',
                backgroundColor: 'var(--bg-surface, #fff)', color: 'var(--text-main, #0f172a)',
              }}
            >
              返回上一頁
            </button>
            <button
              onClick={this.handleReload}
              style={{
                padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700,
                border: 'none', backgroundColor: 'var(--primary-color, #6366f1)', color: '#fff',
              }}
            >
              重新載入系統
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
