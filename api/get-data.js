const fetch = require('node-fetch');

const API_BASE = 'https://www.call2all.co.il/ym/api';
const enc = encodeURIComponent;

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

  const file = fileName || 'APPROVALALL.YMGR';
  const ext  = String(extension).replace(/^\//, '');
  const path = `ivr2:${ext}/${file}`;
  // token both in URL and header for maximum compatibility
  const url  = `${API_BASE}/DownloadFile?path=${enc(path)}&token=${enc(token)}`;

  try {
    const r    = await fetch(url, { headers: { authorization: token } });
    const text = await r.text();

    if (!text || !text.trim()) {
      return res.json({ ok: false, message: `הקובץ ${file} ריק או לא קיים בשלוחה ${ext}` });
    }

    if (text.trimStart().startsWith('<')) {
      return res.json({ ok: false, message: `שגיאת שרת ${r.status} — בדוק token ומספר שלוחה`, debug: text.slice(0, 200) });
    }

    const parsed = parseYmgrContent(text);

    if (!parsed.rows.length) {
      // File exists but couldn't parse as YMGR — return raw for debugging
      return res.json({ ok: false, message: 'הקובץ נמצא אך לא ניתן לפרסר — פורמט לא צפוי', debug: text.slice(0, 300) });
    }

    res.json({ ok: true, ...parsed, raw: text });

  } catch (e) {
    res.status(502).json({ ok: false, message: e.message });
  }
};
