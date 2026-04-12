const fetch = require('node-fetch');

const DEFAULT_BASE = 'https://www.call2all.co.il/ym/api';
const enc = encodeURIComponent;

function fetchWithTimeout(url, ms = 5000) {
  return Promise.race([
    fetch(url),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

async function tryPath(base, token, path) {
  // Try the two most likely endpoints for this path
  const urls = [
    `${base}/GetIvrTables?token=${enc(token)}&path=${enc(path)}`,
    `${base}/GetTextFile?token=${enc(token)}&path=${enc(path)}`,
  ];

  for (const url of urls) {
    try {
      const r = await fetchWithTimeout(url, 4000);
      const text = await r.text();
      if (!text || !text.trim()) continue;

      try {
        const json = JSON.parse(text);
        if (json.responseStatus === 'ERROR' || json.responseStatus === 'NOT_AUTHENTICATED') continue;
        if (typeof json.table === 'string') return parseInfo(path, json.table);
        return { path, type: 'json', headers: [], rowCount: '?' };
      } catch {
        const info = parseInfo(path, text);
        if (info) return info;
      }
    } catch {
      // skip failed attempts
    }
  }
  return null;
}

function parseInfo(path, csvText) {
  const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return null;
  // Must look like CSV (has comma) to be considered a real data file
  if (!lines[0].includes(',') && lines.length < 2) return null;
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim()).filter(Boolean);
  const rowCount = Math.max(0, lines.length - 1);
  return { path, type: 'csv', headers, rowCount };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, basePath, apiBase } = req.body;
  const base = (apiBase || DEFAULT_BASE).replace(/\/$/, '');

  // Explore CHILDREN of basePath: basePath/1 … basePath/9
  // Also try basePath itself in case it's a direct file
  const normalized = basePath.replace(/\/$/, '');
  const withoutSlash = normalized.startsWith('/') ? normalized.slice(1) : normalized;
  const withSlash = normalized.startsWith('/') ? normalized : '/' + normalized;

  const pathsToTry = new Set();

  // The path itself (in case it IS a file)
  pathsToTry.add(withSlash);
  pathsToTry.add(withoutSlash);

  // Children /1 through /9
  for (let i = 1; i <= 9; i++) {
    pathsToTry.add(`${withSlash}/${i}`);
    pathsToTry.add(`${withoutSlash}/${i}`);
  }

  const attempts = [...pathsToTry].map(p => tryPath(base, token, p));
  const results = await Promise.all(attempts);

  // Deduplicate by path (keep unique paths only)
  const seen = new Set();
  const found = results.filter(r => {
    if (!r) return false;
    // Normalize path for dedup
    const key = r.path.replace(/^\//, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  res.json({ ok: true, files: found });
};
