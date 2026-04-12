const fetch = require('node-fetch');

const API_BASE = 'https://www.call2all.co.il/ym/api';
const enc = encodeURIComponent;

// Parse an HTML table returned by RenderYMGRFile?format=html
// Extracts <tr>/<th>/<td> into { headers, rows }
function parseHtmlTable(html) {
  const headers = [];
  const rows    = [];

  // Pull all <tr> blocks
  const trRe   = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;

  let trMatch;
  while ((trMatch = trRe.exec(html)) !== null) {
    const cellBlock = trMatch[1];
    const cells = [];
    let cellMatch;
    const cellRe2 = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    while ((cellMatch = cellRe2.exec(cellBlock)) !== null) {
      // Strip inner tags, decode basic HTML entities
      const text = cellMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
        .trim();
      cells.push(text);
    }
    if (!cells.length) continue;

    if (!headers.length) {
      // First row → headers
      headers.push(...cells);
    } else {
      const row = {};
      headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
      if (headers.some(h => row[h])) rows.push(row);
    }
  }

  return { headers, rows };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, extension, fileName } = req.body;
  if (!token)     return res.json({ ok: false, message: 'נדרש מפתח API' });
  if (!extension) return res.json({ ok: false, message: 'נדרש מספר שלוחה' });

  const file = fileName || 'APPROVALALL.YMGR';
  const ext  = String(extension).replace(/^\//, '');
  const what = `ivr2:${ext}/${file}`;

  // RenderYMGRFile with format=html returns a readable HTML table
  const url = `${API_BASE}/RenderYMGRFile?what=${enc(what)}&format=html&token=${enc(token)}`;

  try {
    const r    = await fetch(url, { headers: { authorization: token } });
    const html = await r.text();

    if (!html || !html.trim()) {
      return res.json({ ok: false, message: `הקובץ ${file} ריק או לא קיים בשלוחה ${ext}` });
    }

    if (!html.includes('<') ) {
      // Not HTML — unexpected plain text
      return res.json({ ok: false, message: 'פורמט לא צפוי מהשרת', rawPreview: html.slice(0, 400) });
    }

    const parsed = parseHtmlTable(html);

    if (!parsed.rows.length) {
      return res.json({ ok: false, message: 'הקובץ נמצא אך לא נמצאו שורות נתונים', rawPreview: html.slice(0, 500) });
    }

    res.json({ ok: true, ...parsed });

  } catch (e) {
    res.status(502).json({ ok: false, message: e.message });
  }
};
