const fetch = require('node-fetch');

const DL_URL  = 'https://www.call2all.co.il/ym/dl.php';
const API_URL = 'https://www.call2all.co.il/ym/api';
const enc = encodeURIComponent;

// Extract the "what" value from various input formats:
//   Full URL:  https://www.call2all.co.il/ym/dl.php?what=ivr2:2/1/Foo.ini
//   ivr2 path: ivr2:2/1/Foo.ini
//   Plain path: /2/1/1  (legacy, try as ivr2:)
function extractWhat(tablePath) {
  const s = tablePath.trim();
  // Full dl.php URL
  if (s.includes('dl.php')) {
    try {
      const u = new URL(s.startsWith('http') ? s : 'https://www.call2all.co.il' + s);
      const w = u.searchParams.get('what');
      if (w) return { what: w };
    } catch {}
  }
  // Already has ivr2: prefix
  if (s.startsWith('ivr2:')) return { what: s };
  // Legacy plain path → wrap as ivr2:
  const plain = s.startsWith('/') ? s.slice(1) : s;
  return { what: `ivr2:${plain}`, legacy: true };
}

// Parse text response into { format, data }
// ימות המשיח .ini data files are CSV-like (first row = headers)
function parseBody(text) {
  if (!text || !text.trim()) return null;
  const t = text.trim();

  // JSON response
  try {
    const json = JSON.parse(t);
    if (json.responseStatus === 'ERROR' || json.responseStatus === 'NOT_AUTHENTICATED') {
      return { error: json.message || json.responseStatus };
    }
    if (typeof json.table === 'string') return { format: 'csv', data: json.table };
    return { format: 'json', data: json };
  } catch {}

  // Detect error strings
  if (/invalid|error|not.?found|forbidden/i.test(t) && !t.includes(',')) {
    return { error: t.slice(0, 200) };
  }

  // Treat as CSV / INI data
  return { format: 'csv', data: t };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, tablePath, apiBase } = req.body;
  const { what, legacy } = extractWhat(tablePath);

  // Auth variants to try for dl.php
  const authVariants = [
    `${DL_URL}?token=${enc(token)}&what=${enc(what)}`,
    `${DL_URL}?apiKey=${enc(token)}&what=${enc(what)}`,
    `${DL_URL}?key=${enc(token)}&what=${enc(what)}`,
    `${DL_URL}?what=${enc(what)}&token=${enc(token)}`,
  ];

  // If legacy path, also try old GetIvrTables
  const legacyVariants = legacy ? [
    `${(apiBase || API_URL).replace(/\/$/, '')}/GetIvrTables?token=${enc(token)}&path=${enc(tablePath)}`,
    `${(apiBase || API_URL).replace(/\/$/, '')}/GetTextFile?token=${enc(token)}&path=${enc(tablePath)}`,
  ] : [];

  const allUrls = [...authVariants, ...legacyVariants];

  try {
    for (const url of allUrls) {
      let text;
      try {
        const r = await fetch(url);
        text = await r.text();
      } catch { continue; }

      const parsed = parseBody(text);
      if (!parsed) continue;
      if (parsed.error) continue;   // this URL returned an error, try next
      return res.json({ ok: true, format: parsed.format, data: parsed.data });
    }

    // All failed
    res.json({
      ok: false,
      message: 'לא ניתן לטעון את הנתונים. ודא שהנתיב בפורמט: ivr2:2/1/ApprovalAll.ini'
    });
  } catch (e) {
    res.status(502).json({ ok: false, message: e.message });
  }
};
