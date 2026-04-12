const fetch = require('node-fetch');

const API_BASE = 'https://www.call2all.co.il/ym/api';
const enc = encodeURIComponent;

// Common filenames to probe (case variants included)
const COMMON_FILES = [
  'APPROVALALL.YMGR', 'ApprovalAll.ymgr', 'approval_all.ymgr',
  'ALL.YMGR', 'All.ymgr',
  'DATA.YMGR', 'data.ymgr',
  'FORMDATA.YMGR', 'FormData.ymgr',
];

async function tryFile(token, ext, fileName) {
  const path = `ivr2:${ext}/${fileName}`;
  const url  = `${API_BASE}/DownloadFile?path=${enc(path)}`;
  try {
    const r = await Promise.race([
      fetch(url, { headers: { authorization: token } }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))
    ]);
    const text = await r.text();
    if (!text || !text.trim())              return null;
    if (text.trimStart().startsWith('<'))   return null; // HTML error page

    // Parse to extract headers and row count
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return null;

    const headers = [];
    const seen = new Set();
    lines[0].split('*').forEach(pair => {
      const idx = pair.indexOf('^');
      if (idx === -1) return;
      const key = pair.slice(0, idx).trim();
      if (key && !seen.has(key)) { seen.add(key); headers.push(key); }
    });

    if (!headers.length) return null; // not a valid YMGR record

    return { path, fileName, headers, rowCount: lines.length };
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, extension } = req.body;
  if (!token || !extension) return res.json({ ok: false, message: 'נדרש token ומספר שלוחה' });

  const ext = String(extension).replace(/^\//, '');

  const results = await Promise.all(COMMON_FILES.map(f => tryFile(token, ext, f)));
  const found   = results.filter(Boolean);

  res.json({ ok: true, files: found });
};
