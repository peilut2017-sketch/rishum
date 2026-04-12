const fetch = require('node-fetch');

const API_BASE = 'https://www.call2all.co.il/ymot/api';
const enc = encodeURIComponent;

// Parse INI/CSV content from ימות המשיח into { headers, rows }
function parseIniContent(text) {
  if (!text || !text.trim()) return { headers: [], rows: [] };
  const raw = text.trim();

  // Detect separator: pipe | or comma ,
  const firstLine = raw.split(/\r?\n/)[0];
  const sep = firstLine.includes('|') ? '|' : ',';

  const lines = raw.split(/\r?\n/).filter(l => l.trim() && !l.startsWith(';') && !l.startsWith('#'));
  if (!lines.length) return { headers: [], rows: [] };

  const headers = lines[0].split(sep).map(h => h.replace(/"/g, '').trim());
  const rows = lines.slice(1).map(line => {
    const vals = line.split(sep).map(v => v.replace(/"/g, '').trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  }).filter(r => headers.some(h => r[h]));

  return { headers, rows };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, extension, fileName } = req.body;

  if (!token)     return res.json({ ok: false, message: 'נדרש מפתח API' });
  if (!extension) return res.json({ ok: false, message: 'נדרש מספר שלוחה' });

  const file = fileName || 'ApprovalAll.ymgr';
  const ext  = String(extension).replace(/^\//, ''); // strip leading slash
  const path = `ivr2:${ext}/${file}`;
  const url  = `${API_BASE}/GetTextFile?token=${enc(token)}&path=${enc(path)}`;

  try {
    const r = await fetch(url);
    const text = await r.text();

    if (!text || !text.trim()) {
      return res.json({ ok: false, message: `הקובץ ${file} ריק או לא קיים בשלוחה ${ext}` });
    }

    // Try to parse as JSON (ימות המשיח wraps content in JSON envelope)
    let content = null;
    try {
      const json = JSON.parse(text);
      if (json.responseStatus && json.responseStatus !== 'OK') {
        return res.json({ ok: false, message: json.message || json.responseStatus || 'שגיאת API' });
      }
      content = json.file ?? json.content ?? json.data ?? json.text ?? null;
    } catch {
      // Not JSON — treat the raw response as the file content directly
      content = text;
    }

    if (!content || !content.trim()) {
      return res.json({ ok: false, message: `הקובץ ${file} ריק או לא קיים בשלוחה ${ext}` });
    }

    const parsed = parseIniContent(content);
    res.json({ ok: true, ...parsed, raw: content });

  } catch (e) {
    res.status(502).json({ ok: false, message: e.message });
  }
};
