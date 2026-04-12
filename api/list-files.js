const fetch = require('node-fetch');

const API_BASE = 'https://www.call2all.co.il/ym/api';

const COMMON_FILES = [
  'ApprovalAll.ymgr', 'approvalall.ymgr', 'approval_all.ymgr',
  'All.ymgr', 'data.ymgr', 'FormData.ymgr',
];

async function tryFile(token, ext, fileName) {
  const what = `ivr2:${ext}/${fileName}`;
  const body = new URLSearchParams({ wath: what, convertType: 'json', token });
  try {
    const r = await Promise.race([
      fetch(`${API_BASE}/RenderYMGRFile`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', authorization: token },
        body:    body.toString(),
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 7000))
    ]);
    const text = await r.text();
    if (!text || !text.trim()) return { found: false, fileName, preview: '(empty)' };

    let json;
    try { json = JSON.parse(text); } catch {
      return { found: false, fileName, preview: text.slice(0, 150) };
    }

    if (json.responseStatus && json.responseStatus !== 'OK') {
      return { found: false, fileName, preview: json.message || json.responseStatus };
    }

    // Extract headers and row count from JSON
    const data = json.rows || json.data || (Array.isArray(json) ? json : null);
    if (!data || !data.length) return { found: false, fileName, preview: 'empty data' };

    const rowCount = data.length;
    const firstRow = Array.isArray(data[0]) ? null : data[0];
    const headers  = json.headers
      ? json.headers.map(h => { try { return decodeURIComponent(h); } catch { return h; } })
      : firstRow ? Object.keys(firstRow) : [];

    return { found: true, path: `ivr2:${ext}/${fileName}`, fileName, headers, rowCount };
  } catch(e) {
    return { found: false, fileName, preview: e.message };
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, extension } = req.body;
  if (!token || !extension) return res.json({ ok: false, message: 'נדרש token ומספר שלוחה' });

  const ext = String(extension).replace(/^\//, '');

  const results = await Promise.all(COMMON_FILES.map(f => tryFile(token, ext, f)));
  const found   = results.filter(r => r.found);
  const debug   = results.filter(r => !r.found).slice(0, 2); // first 2 failures for diagnosis

  res.json({ ok: true, files: found, debug });
};
