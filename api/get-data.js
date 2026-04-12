const fetch = require('node-fetch');

const DL_URL  = 'https://www.call2all.co.il/ym/dl.php';
const API_URL = 'https://www.call2all.co.il/ym/api';
const enc = encodeURIComponent;

// Accept any of these input formats and return the "what" value:
//   https://...dl.php?what=ivr2:2/1/Foo.ini  → ivr2:2/1/Foo.ini
//   ivr2:2/1/Foo.ini                          → ivr2:2/1/Foo.ini
//   /2/1/1  or  2/1/1                         → ivr2:2/1/1
function toWhat(tablePath) {
  const s = (tablePath || '').trim();
  if (s.includes('dl.php')) {
    try {
      const u = new URL(s.startsWith('http') ? s : 'https://www.call2all.co.il' + s);
      const w = u.searchParams.get('what');
      if (w) return w;
    } catch {}
  }
  if (s.startsWith('ivr2:')) return s;
  const plain = s.startsWith('/') ? s.slice(1) : s;
  return `ivr2:${plain}`;
}

async function tryFetch(url) {
  try {
    const r = await fetch(url);
    const text = await r.text();
    if (!text || !text.trim()) return null;
    return text.trim();
  } catch {
    return null;
  }
}

function parseText(text) {
  if (!text) return null;
  // JSON
  try {
    const j = JSON.parse(text);
    if (j.responseStatus === 'ERROR' || j.responseStatus === 'NOT_AUTHENTICATED') return { error: j.message || j.responseStatus };
    if (typeof j.table === 'string') return { format: 'csv', data: j.table };
    return { format: 'json', data: j };
  } catch {}
  // Looks like an error string (no comma = not CSV)
  if (!text.includes(',') && /invalid|error|not.?found|denied|forbidden/i.test(text)) {
    return { error: text.slice(0, 300) };
  }
  // Treat as CSV/INI
  return { format: 'csv', data: text };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, tablePath, apiBase } = req.body;
  const what = toWhat(tablePath);
  const base = (apiBase || API_URL).replace(/\/$/, '');

  // Try in order: session-token auth, apiKey param, no-auth (in case public)
  const urls = [
    `${DL_URL}?token=${enc(token)}&what=${enc(what)}`,
    `${DL_URL}?apiKey=${enc(token)}&what=${enc(what)}`,
    `${DL_URL}?key=${enc(token)}&what=${enc(what)}`,
    // Legacy API endpoints
    `${base}/GetIvrTables?token=${enc(token)}&path=${enc(what)}`,
    `${base}/GetTextFile?token=${enc(token)}&path=${enc(what)}`,
  ];

  let lastError = 'לא התקבלה תגובה מהשרת';

  for (const url of urls) {
    const text = await tryFetch(url);
    if (!text) continue;
    const parsed = parseText(text);
    if (!parsed) continue;
    if (parsed.error) { lastError = parsed.error; continue; }
    return res.json({ ok: true, format: parsed.format, data: parsed.data });
  }

  res.json({ ok: false, message: `שגיאת API: ${lastError}` });
};
