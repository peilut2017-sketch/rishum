const fetch = require('node-fetch');

const DEFAULT_BASE = 'https://www.call2all.co.il/ym/api';
const enc = encodeURIComponent;

// All endpoint+parameter combinations to try, in priority order
function buildUrls(base, token, path) {
  const p  = path;
  const p2 = path.startsWith('/') ? path.slice(1) : '/' + path;  // alternate slash variant

  return [
    // Most common ימות המשיח endpoints
    `${base}/GetIvrTables?token=${enc(token)}&path=${enc(p)}`,
    `${base}/GetIvrTables?token=${enc(token)}&path=${enc(p2)}`,
    `${base}/GetTextFile?token=${enc(token)}&path=${enc(p)}`,
    `${base}/GetTextFile?token=${enc(token)}&path=${enc(p2)}`,
    `${base}/GetFile?token=${enc(token)}&path=${enc(p)}`,
    `${base}/GetFile?token=${enc(token)}&path=${enc(p2)}`,
    // Try with "fileName" param instead of "path"
    `${base}/GetIvrTables?token=${enc(token)}&fileName=${enc(p)}`,
    `${base}/GetIvrTables?token=${enc(token)}&fileName=${enc(p2)}`,
    // Try with "name" param
    `${base}/GetIvrTables?token=${enc(token)}&name=${enc(p)}`,
  ];
}

async function tryUrl(url) {
  try {
    const r = await fetch(url);
    const text = await r.text();
    if (!text || !text.trim()) return null;

    try {
      const json = JSON.parse(text);
      if (json.responseStatus === 'ERROR' || json.responseStatus === 'NOT_AUTHENTICATED') return null;
      if (typeof json.table === 'string') return { ok: true, format: 'csv', data: json.table, url };
      return { ok: true, format: 'json', data: json, url };
    } catch {
      // Plain text/CSV — only accept if it looks like tabular data
      const lines = text.trim().split('\n');
      if (lines.length >= 1 && lines[0].includes(',')) {
        return { ok: true, format: 'csv', data: text.trim(), url };
      }
      return null;
    }
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, tablePath, apiBase } = req.body;
  const base = (apiBase || DEFAULT_BASE).replace(/\/$/, '');

  const urls = buildUrls(base, token, tablePath);

  try {
    // Try all URLs in parallel, return first success
    const results = await Promise.all(urls.map(tryUrl));
    const success = results.find(r => r && r.ok);

    if (success) {
      return res.json({ ok: true, format: success.format, data: success.data });
    }

    // All failed — return helpful message
    res.json({
      ok: false,
      message: `לא נמצאו נתונים בנתיב "${tablePath}". נסה endpoint או נתיב אחר בהגדרות.`,
      triedUrls: urls
    });
  } catch (e) {
    res.status(502).json({ ok: false, message: e.message });
  }
};
