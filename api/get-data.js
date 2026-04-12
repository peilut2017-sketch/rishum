const fetch = require('node-fetch');

const API_BASE = 'https://www.call2all.co.il/ymot/api';
const enc = encodeURIComponent;

// Parse YMGR raw text format:
//   Each record is on its own line.
//   Within a record, fields are separated by '*'.
//   Within each field, key and value are separated by '^'.
// e.g.: "שם^ישראל*טלפון^050-1234567"  → { שם: 'ישראל', טלפון: '050-1234567' }
function parseYmgrContent(raw) {
  if (!raw || !raw.trim()) return { headers: [], rows: [] };

  const lines = raw.trim().split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { headers: [], rows: [] };

  const headerOrder = [];
  const headerSet   = new Set();

  const rows = lines.map(line => {
    const record = {};
    line.split('*').forEach(pair => {
      const idx = pair.indexOf('^');
      if (idx === -1) return;
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      if (!key) return;
      record[key] = val;
      if (!headerSet.has(key)) { headerSet.add(key); headerOrder.push(key); }
    });
    return record;
  }).filter(r => Object.keys(r).length > 0);

  return { headers: headerOrder, rows };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, extension, fileName } = req.body;

  if (!token)     return res.json({ ok: false, message: 'נדרש מפתח API' });
  if (!extension) return res.json({ ok: false, message: 'נדרש מספר שלוחה' });

  const file = fileName || 'approval_all.ymgr';
  const ext  = String(extension).replace(/^\//, '');
  const path = `ivr2:${ext}/${file}`;
  const url  = `${API_BASE}/RenderYMGRFile?token=${enc(token)}&path=${enc(path)}`;

  try {
    const r    = await fetch(url);
    const text = await r.text();

    if (!text || !text.trim()) {
      return res.json({ ok: false, message: `הקובץ ${file} ריק או לא קיים בשלוחה ${ext}` });
    }

    if (text.trimStart().startsWith('<')) {
      return res.json({ ok: false, message: `שגיאת שרת — הקובץ לא נמצא (בדוק token ומספר שלוחה)` });
    }

    const parsed = parseYmgrContent(text);
    res.json({ ok: true, ...parsed, raw: text });

  } catch (e) {
    res.status(502).json({ ok: false, message: e.message });
  }
};
