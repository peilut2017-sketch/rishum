const fetch = require('node-fetch');

const DL_URL = 'https://www.call2all.co.il/ym/dl.php';
const enc = encodeURIComponent;

const COMMON_FILENAMES = [
  'ApprovalAll.ini', 'All.ini', 'data.ini', 'Data.ini',
  'registrations.ini', 'form.ini', 'FormData.ini',
  'records.ini', 'output.ini', 'results.ini',
  '1.ini', '2.ini', '3.ini'
];

function withTimeout(promise, ms = 5000) {
  return Promise.race([
    promise,
    new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))
  ]);
}

async function tryFetch(token, what) {
  const url = `${DL_URL}?token=${enc(token)}&what=${enc(what)}`;
  try {
    const r = await withTimeout(fetch(url), 5000);
    const text = await r.text();
    if (!text || !text.trim()) return null;
    const t = text.trim();
    if (/invalid|error|not.?found|forbidden/i.test(t) && !t.includes(',')) return null;

    // Parse headers and row count
    const lines = t.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length || !lines[0].includes(',')) return null;
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim()).filter(Boolean);
    const rowCount = Math.max(0, lines.length - 1);
    return { path: what, headers, rowCount };
  } catch {
    return null;
  }
}

// Extract the base directory from a full path or ivr2: reference
function extractDir(basePath) {
  const s = basePath.trim();

  // Full dl.php URL
  if (s.includes('dl.php')) {
    try {
      const u = new URL(s.startsWith('http') ? s : 'https://www.call2all.co.il' + s);
      const w = u.searchParams.get('what') || '';
      const noProto = w.startsWith('ivr2:') ? w.slice(5) : w;
      const parts = noProto.split('/');
      parts.pop(); // remove filename
      return parts.join('/');
    } catch {}
  }

  // ivr2:dir/file  or  ivr2:dir/
  if (s.startsWith('ivr2:')) {
    const inner = s.slice(5);
    const parts = inner.split('/');
    if (!inner.endsWith('/')) parts.pop();
    return parts.join('/');
  }

  // Plain path like /2/1/1 or /2/1
  const plain = s.replace(/^\//, '');
  const parts = plain.split('/');
  if (!s.endsWith('/') && !s.includes('.')) parts.pop();
  return parts.join('/');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, basePath } = req.body;
  const dir = extractDir(basePath);

  // Build list of what= values to try
  const toTry = COMMON_FILENAMES.map(f => `ivr2:${dir}/${f}`);

  // Also add the basePath itself if it looks like a file
  if (basePath.includes('.ini')) {
    const s = basePath.trim();
    if (s.startsWith('ivr2:')) toTry.unshift(s);
    else if (s.includes('dl.php')) {
      try {
        const u = new URL(s.startsWith('http') ? s : 'https://www.call2all.co.il' + s);
        const w = u.searchParams.get('what');
        if (w) toTry.unshift(w);
      } catch {}
    }
  }

  const results = await Promise.all(toTry.map(what => tryFetch(token, what)));

  const seen = new Set();
  const found = results.filter(r => {
    if (!r) return false;
    const key = r.path.replace(/^ivr2:/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  res.json({ ok: true, files: found });
};
