const fetch = require('node-fetch');

const API_BASE = 'https://www.call2all.co.il/ym/api';
const enc = encodeURIComponent;

const COMMON_FILES = [
  'APPROVALALL.YMGR', 'ApprovalAll.ymgr', 'approval_all.ymgr',
  'ALL.YMGR', 'All.ymgr', 'DATA.YMGR', 'data.ymgr',
];

// Try fetching a file; return parsed metadata or null
async function tryFile(token, ext, fileName) {
  const path = `ivr2:${ext}/${fileName}`;
  // Send token both as query param AND as header for maximum compatibility
  const url  = `${API_BASE}/DownloadFile?path=${enc(path)}&token=${enc(token)}`;
  try {
    const r = await Promise.race([
      fetch(url, { headers: { authorization: token } }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 7000))
    ]);
    const text = await r.text();
    if (!text || !text.trim())            return null;
    if (text.trimStart().startsWith('<')) return null;

    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return null;

    // Accept the file even if we can't parse YMGR headers —
    // it still has content, so it exists.
    const headers = [];
    const seen = new Set();
    lines[0].split('*').forEach(pair => {
      const idx = pair.indexOf('^');
      if (idx === -1) return;
      const key = pair.slice(0, idx).trim();
      if (key && !seen.has(key)) { seen.add(key); headers.push(key); }
    });

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

  // Also return a debug sample so the client can show what the server returned
  // for APPROVALALL.YMGR if nothing was found
  let debugSample = null;
  if (!found.length) {
    try {
      const path = `ivr2:${ext}/APPROVALALL.YMGR`;
      const url  = `${API_BASE}/DownloadFile?path=${enc(path)}&token=${enc(token)}`;
      const r    = await fetch(url, { headers: { authorization: token } });
      const text = await r.text();
      debugSample = text.slice(0, 300);
    } catch(e) {
      debugSample = e.message;
    }
  }

  res.json({ ok: true, files: found, debugSample });
};
