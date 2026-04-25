function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderInsightsReport(data) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenCode Insights</title>
  <style>
    :root { color-scheme: light dark; }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #0b1020; --panel: #121a2b; --text: #f3f7ff; }
    }
    @media (prefers-color-scheme: light) {
      :root { --bg: #f6f8fc; --panel: #ffffff; --text: #101828; }
    }
    :root[data-theme="dark"] { --bg: #0b1020; --panel: #121a2b; --text: #f3f7ff; }
    :root[data-theme="light"] { --bg: #f6f8fc; --panel: #ffffff; --text: #101828; }
    body { margin: 0; font: 14px/1.5 system-ui, sans-serif; background: var(--bg); color: var(--text); }
    .wrap { max-width: 1040px; margin: 0 auto; padding: 32px 20px 96px; }
    .card { background: var(--panel); border-radius: 16px; padding: 20px; margin-bottom: 16px; }
    .kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="card">
      <p>OpenCode Insights</p>
      <h1>30-day development retrospective</h1>
      <button type="button" data-theme-toggle>Toggle theme</button>
    </header>
    <section class="kpis">
      <article class="card"><strong>${escapeHtml(data.summary.sessionsAnalyzed)}</strong><div>Sessions</div></article>
      <article class="card"><strong>${escapeHtml(data.summary.totalTokens)}</strong><div>Total tokens</div></article>
      <article class="card"><strong>${escapeHtml(data.summary.averageDurationMinutes)}</strong><div>Avg minutes</div></article>
    </section>
    <section class="card"><h2>Friction Ranking</h2><p>${escapeHtml(data.frictionRanking[0]?.label ?? 'None')}</p></section>
    <section class="card"><h2>Workflow Suggestions</h2><p>${escapeHtml(data.workflowSuggestions[0] ?? 'None')}</p></section>
  </div>
  <script>
    const key = 'opencode-insights-theme';
    const root = document.documentElement;
    try {
      const saved = localStorage.getItem(key);
      if (saved) root.dataset.theme = saved;
    } catch {}
    document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
      const current = root.dataset.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = current === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try {
        localStorage.setItem(key, next);
      } catch {}
    });
  </script>
</body>
</html>`;
}
