const fetch = require('node-fetch');

const API_BASE = 'https://www.call2all.co.il/ymot/api';
const enc = encodeURIComponent;

const COMMON_FILES = ['ApprovalAll.ymgr', 'ApprovalAll.ini', 'All.ini', 'data.ini', 'Data.ini', 'FormData.ini', 'records.ini'];

async function tryFile(token, ext, fileName) {
  const path = `ivr2:${ext}/${fileName}`;
  const url  = `${API_BASE}/GetTextFile?token=${enc(token)}&path=${enc(path)}`;
  try {
    const r = await Promise.race([
      fetch(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ]);
    const text = await r.text();
    if (!text || !text.trim()) return null;

    // Try JSON envelope first, fall back to raw text as file content
    let content = null;
    try {
      const json = JSON.parse(text);
      if (json.responseStatus && json.responseStatus !== 'OK') return null;
      content = json.file ?? json.content ?? json.data ?? json.text ?? null;
    } catch {
      content = text;
    }
    if (!content || !content.trim()) return null;

    const lines = content.trim().split(/\r?\n/).filter(l => l.trim());
    const sep = lines[0]?.includes('|') ? '|' : ',';
    const headers = (lines[0] || '').split(sep).map(h => h.replace(/"/g, '').trim()).filter(Boolean);
    const rowCount = Math.max(0, lines.length - 1);
    return { path: `ivr2:${ext}/${fileName}`, fileName, headers, rowCount };
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, extension } = req.body;
  if (!token || !extension) return res.json({ ok: false, message: 'נדרש token ומספר שלוחה' });

  const ext = String(extension).replace(/^\//, '');

  const attempts = COMMON_FILES.map(f => tryFile(token, ext, f));
  const results  = await Promise.all(attempts);
  const found    = results.filter(Boolean);

  res.json({ ok: true, files: found });
};
