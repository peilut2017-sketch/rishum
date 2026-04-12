const fetch = require('node-fetch');

const DEFAULT_BASE = 'https://www.call2all.co.il/ym/api';

async function callGetIvrTables(base, token, path) {
  const url = `${base}/GetIvrTables?token=${encodeURIComponent(token)}&path=${encodeURIComponent(path)}`;
  const r = await fetch(url);
  const text = await r.text();

  // Try to parse as JSON
  try {
    const json = JSON.parse(text);

    // API returned an error
    if (json.responseStatus && json.responseStatus !== 'OK') {
      return { ok: false, rawError: json.message || json.responseStatus, raw: text };
    }

    // JSON with embedded CSV string
    if (typeof json.table === 'string') {
      return { ok: true, format: 'csv', data: json.table };
    }

    return { ok: true, format: 'json', data: json };
  } catch {
    // Plain CSV text
    if (!text.trim()) return { ok: false, rawError: 'תגובה ריקה מהשרת', raw: '' };
    return { ok: true, format: 'csv', data: text.trim() };
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, tablePath, apiBase } = req.body;
  const base = (apiBase || DEFAULT_BASE).replace(/\/$/, '');

  // Build list of path variants to try (with and without leading slash)
  const paths = [tablePath];
  if (tablePath.startsWith('/')) paths.push(tablePath.slice(1));
  else paths.push('/' + tablePath);

  try {
    let lastError = '';
    for (const p of paths) {
      const result = await callGetIvrTables(base, token, p);
      if (result.ok) return res.json(result);
      lastError = result.rawError || 'שגיאה לא ידועה';
    }
    // All paths failed — return the last error with details
    return res.json({ ok: false, message: `שגיאת API: ${lastError}` });
  } catch (e) {
    res.status(502).json({ ok: false, message: e.message });
  }
};
