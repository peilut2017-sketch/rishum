const fetch = require('node-fetch');

const DEFAULT_BASE = 'https://www.call2all.co.il/ym/api';

function fetchWithTimeout(url, ms = 5000) {
  return Promise.race([
    fetch(url),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

async function tryPath(base, token, path) {
  try {
    const url = `${base}/GetIvrTables?token=${encodeURIComponent(token)}&path=${encodeURIComponent(path)}`;
    const r = await fetchWithTimeout(url, 5000);
    const text = await r.text();
    if (!text || !text.trim()) return null;

    // JSON response
    try {
      const json = JSON.parse(text);
      if (json.responseStatus === 'ERROR' || json.responseStatus === 'NOT_AUTHENTICATED') return null;
      if (typeof json.table === 'string') {
        return parseFileInfo(path, json.table);
      }
      return { path, type: 'json', headers: [], rowCount: '?' };
    } catch {
      // CSV text
      return parseFileInfo(path, text);
    }
  } catch {
    return null;
  }
}

function parseFileInfo(path, csvText) {
  const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return null;
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim()).filter(Boolean);
  const rowCount = Math.max(0, lines.length - 1);
  return { path, type: 'csv', headers, rowCount };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, basePath, apiBase } = req.body;
  const base = (apiBase || DEFAULT_BASE).replace(/\/$/, '');

  // Build list of paths to try:
  // 1. The exact path given
  // 2. Siblings: if path ends with /N, try /1 through /9
  const pathsToTry = new Set([basePath]);

  const parts = basePath.replace(/\/$/, '').split('/').filter(Boolean);
  const parent = '/' + parts.slice(0, -1).join('/');

  for (let i = 1; i <= 9; i++) {
    pathsToTry.add(`${parent}/${i}`);
  }

  // Also try the parent itself in case it returns a listing
  if (parent && parent !== '/') pathsToTry.add(parent);

  const attempts = [...pathsToTry].map(p => tryPath(base, token, p));
  const results = await Promise.all(attempts);

  const found = results.filter(Boolean);

  res.json({ ok: true, files: found });
};
