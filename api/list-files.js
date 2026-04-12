const fetch = require('node-fetch');

const DL_BASE  = 'https://www.call2all.co.il/ym/dl.php';
const enc = encodeURIComponent;

const COMMON_FILES = ['ApprovalAll.ymgr', 'ApprovalAll.ini', 'All.ini', 'data.ini', 'Data.ini', 'FormData.ini', 'records.ini'];

async function tryFile(token, ext, fileName) {
  const what = `ivr2:${ext}/${fileName}`;
  const url  = `${DL_BASE}?token=${enc(token)}&what=${enc(what)}`;
  try {
    const r = await Promise.race([
      fetch(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ]);
    const text = await r.text();
    if (!text || !text.trim()) return null;
    if (text.trimStart().startsWith('<')) return null; // HTML error page

    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
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
