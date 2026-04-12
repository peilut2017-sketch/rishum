const fetch = require('node-fetch');

const API_BASE = 'https://www.call2all.co.il/ym/api';

// Parse HTML table from RenderYMGRFile?format=html
function parseHtmlTable(html) {
  const headers = [];
  const rows    = [];
  const trRe    = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;

  while ((trMatch = trRe.exec(html)) !== null) {
    const cells   = [];
    const cellRe  = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cm;
    while ((cm = cellRe.exec(trMatch[1])) !== null) {
      let val = cm[1].replace(/<[^>]+>/g, '').trim()
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
      // Data may arrive URI-encoded
      try { val = decodeURIComponent(val); } catch { /* keep as-is */ }
      cells.push(val);
    }
    if (!cells.length) continue;

    if (!headers.length) {
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

  const file = (fileName || 'ApprovalAll.ymgr').trim();
  const ext  = String(extension).replace(/^\/+/, '');
  const what = `ivr2:${ext}/${file}`;   // e.g. ivr2:5/ApprovalAll.ymgr

  // Use POST so URLSearchParams handles encoding — avoids double-encoding issues
  // API has server-side typo: parameter is 'wath' not 'what'
  const body = new URLSearchParams({ wath: what, format: 'html', token });

  try {
    const r = await fetch(`${API_BASE}/RenderYMGRFile`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        authorization:  token,
      },
      body: body.toString(),
    });

    const text = await r.text();

    if (!text || !text.trim()) {
      return res.json({ ok: false, message: `הקובץ ${file} ריק או לא קיים בשלוחה ${ext}` });
    }

    // Non-HTML → probably a JSON error from the API
    if (!text.trimStart().startsWith('<')) {
      try {
        const json = JSON.parse(text);
        if (json.responseStatus && json.responseStatus !== 'OK') {
          return res.json({ ok: false, message: json.message || json.responseStatus });
        }
      } catch { /* not JSON */ }
      return res.json({ ok: false, message: 'פורמט לא צפוי מהשרת', rawPreview: text.slice(0, 300) });
    }

    const { headers, rows } = parseHtmlTable(text);

    if (!rows.length) {
      return res.json({ ok: false, message: 'לא נמצאו שורות נתונים', rawPreview: text.slice(0, 400) });
    }

    res.json({ ok: true, headers, rows });

  } catch (e) {
    res.status(502).json({ ok: false, message: e.message });
  }
};
