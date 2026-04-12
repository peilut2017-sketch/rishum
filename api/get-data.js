const fetch = require('node-fetch');

const API_BASE = 'https://www.call2all.co.il/ym/api';

// decodeURIComponent safely
function dec(v) {
  try { return decodeURIComponent(String(v ?? '')); } catch { return String(v ?? ''); }
}

// Parse the JSON structure returned by RenderYMGRFile?convertType=json
// Returns { headers, rows } or null if unrecognised
function parseJsonResponse(json) {
  // Structure 1: { headers: [...], rows: [[...], ...] }
  if (Array.isArray(json.headers) && Array.isArray(json.rows)) {
    const headers = json.headers.map(dec);
    const rows = json.rows.map(r => {
      const row = {};
      if (Array.isArray(r)) {
        headers.forEach((h, i) => { row[h] = dec(r[i]); });
      } else {
        Object.entries(r).forEach(([k, v]) => { row[dec(k)] = dec(v); });
      }
      return row;
    }).filter(r => headers.some(h => r[h]));
    return { headers, rows };
  }

  // Structure 2: array of objects  [{ col: val }, ...]
  if (Array.isArray(json)) {
    if (!json.length) return { headers: [], rows: [] };
    const headers = [...new Set(json.flatMap(r => Object.keys(r)))].map(dec);
    const rows = json.map(r => {
      const row = {};
      Object.entries(r).forEach(([k, v]) => { row[dec(k)] = dec(v); });
      return row;
    });
    return { headers, rows };
  }

  // Structure 3: { data: [...] }
  if (Array.isArray(json.data)) {
    return parseJsonResponse(json.data);
  }

  // Structure 4: { table: { headers, rows } }
  if (json.table) {
    return parseJsonResponse(json.table);
  }

  return null; // unknown
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, extension, fileName } = req.body;
  if (!token)     return res.json({ ok: false, message: 'נדרש מפתח API' });
  if (!extension) return res.json({ ok: false, message: 'נדרש מספר שלוחה' });

  const file = (fileName || 'ApprovalAll.ymgr').trim();
  const ext  = String(extension).replace(/^\/+/, '');
  const what = `ivr2:${ext}/${file}`;   // e.g. ivr2:5/ApprovalAll.ymgr

  // Send as POST body — avoids double-encoding of ivr2: path
  // 'wath' is the server-side typo for 'what'
  const body = new URLSearchParams({ wath: what, convertType: 'json', token });

  try {
    const r    = await fetch(`${API_BASE}/RenderYMGRFile`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', authorization: token },
      body:    body.toString(),
    });
    const text = await r.text();

    if (!text || !text.trim()) {
      return res.json({ ok: false, message: `הקובץ ${file} ריק או לא קיים בשלוחה ${ext}` });
    }

    let json;
    try { json = JSON.parse(text); } catch {
      return res.json({ ok: false, message: 'התשובה מהשרת אינה JSON', rawPreview: text.slice(0, 400) });
    }

    // API-level error
    if (json.responseStatus && json.responseStatus !== 'OK') {
      return res.json({ ok: false, message: json.message || json.responseStatus });
    }

    const parsed = parseJsonResponse(json);
    if (!parsed || !parsed.rows.length) {
      return res.json({ ok: false, message: 'לא נמצאו שורות נתונים', rawPreview: text.slice(0, 500) });
    }

    res.json({ ok: true, headers: parsed.headers, rows: parsed.rows });

  } catch (e) {
    res.status(502).json({ ok: false, message: e.message });
  }
};
