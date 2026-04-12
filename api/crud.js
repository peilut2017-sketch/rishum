const fetch = require('node-fetch');
const API_BASE = 'https://www.call2all.co.il/ym/api';

// Safely decode a URI-encoded value
function dec(v) {
  try { return decodeURIComponent(String(v ?? '')); } catch { return String(v ?? ''); }
}

// ── Content hash ─────────────────────────────────────────────────────────
// Uses raw (encoded) data lines so it stays consistent across reads.
// Simple row-count + last-line-prefix is enough for "simple optimistic locking".
function contentHash(dataLines) {
  if (!dataLines.length) return '0:';
  return `${dataLines.length}:${dataLines[dataLines.length - 1].slice(0, 40)}`;
}

// ── Fetch raw file via GetTextFile ────────────────────────────────────────
async function getTextFile(token, what) {
  const body = new URLSearchParams({ token, what });
  const r = await Promise.race([
    fetch(`${API_BASE}/GetTextFile`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', authorization: token },
      body:    body.toString(),
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout reading file')), 12000)),
  ]);
  const text = await r.text();

  // Yemot returns JSON on API-level errors
  if (text.trimStart().startsWith('{')) {
    let j; try { j = JSON.parse(text); } catch {}
    if (j && j.responseStatus && j.responseStatus !== 'OK')
      throw new Error(j.message || j.responseStatus);
  }
  return text;
}

// ── Write file via UploadTextFile ─────────────────────────────────────────
async function uploadTextFile(token, what, contents) {
  const body = new URLSearchParams({ token, path: what, contents });
  const r = await Promise.race([
    fetch(`${API_BASE}/UploadTextFile`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', authorization: token },
      body:    body.toString(),
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout writing file')), 12000)),
  ]);
  const text = await r.text();
  if (text.trimStart().startsWith('{')) {
    let j; try { j = JSON.parse(text); } catch {}
    if (j && j.responseStatus && j.responseStatus !== 'OK')
      throw new Error(j.message || j.responseStatus);
  }
  return true;
}

// ── Parse raw file text ───────────────────────────────────────────────────
// Returns { headerLine, headers (decoded), dataLines (raw, untouched) }
function parseRaw(text) {
  // Split on \n, strip trailing empty lines only
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!lines.length) return { headerLine: '', headers: [], dataLines: [] };
  return {
    headerLine: lines[0],
    headers:    lines[0].split(',').map(dec),
    dataLines:  lines.slice(1),
  };
}

// ── Build a new encoded CSV line ──────────────────────────────────────────
// For UNCHANGED rows we keep the raw line as-is (byte-for-byte preservation).
// This function is only called for EDITED or NEW rows.
const READONLY_COLS = ['ApiCallId', 'ApiTime', 'ApiPhone', 'ApiExtension'];

function buildLine(headers, rowData, existingRawLine) {
  const existing = existingRawLine ? existingRawLine.split(',') : [];
  return headers.map((h, i) => {
    if (READONLY_COLS.includes(h)) return existing[i] ?? '';  // preserve system cols
    const val = rowData?.[h];
    if (val === undefined) return existing[i] ?? '';           // preserve if not supplied
    // Strip commas to avoid breaking CSV structure
    return encodeURIComponent(String(val).replace(/,/g, ''));
  }).join(',');
}

// ── Find row index by ApiCallId ───────────────────────────────────────────
function findRowByApiCallId(dataLines, idColIdx, apiCallId) {
  return dataLines.findIndex(line => {
    const parts = line.split(',');
    return dec(parts[idColIdx] ?? '') === apiCallId;
  });
}

// ══════════════════════════════════════════════════════════════════════════
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, extension, fileName, action, rowData, apiCallId, clientHash } = req.body || {};

  if (!token)     return res.json({ ok: false, message: 'חסר token' });
  if (!extension) return res.json({ ok: false, message: 'חסר מספר שלוחה' });
  if (!fileName)  return res.json({ ok: false, message: 'חסר שם קובץ' });
  if (!action)    return res.json({ ok: false, message: 'חסרת פעולה (add/edit/delete)' });

  const ext  = String(extension).replace(/^\/+/, '');
  const what = `ivr2:${ext}/${fileName}`;

  try {
    // ── 1. Always read the current file fresh ────────────────────────────
    const rawText = await getTextFile(token, what);
    const { headerLine, headers, dataLines } = parseRaw(rawText);
    if (!headers.length) return res.json({ ok: false, message: 'הקובץ ריק או לא נמצא' });

    // ── 2. Optimistic lock check (edit / delete only) ────────────────────
    if (clientHash && action !== 'add') {
      const serverHash = contentHash(dataLines);
      if (serverHash !== clientHash) {
        return res.json({
          ok:       false,
          conflict: true,
          message:  'הקובץ השתנה מאז פתיחת העריכה. אנא רענן את הדף ונסה שוב.',
        });
      }
    }

    // ── 3. Locate ApiCallId column ───────────────────────────────────────
    const idColIdx = headers.findIndex(h => h === 'ApiCallId');

    let newDataLines;

    // ── 4. Apply the requested action ────────────────────────────────────
    if (action === 'delete') {
      if (!apiCallId)    return res.json({ ok: false, message: 'חסר apiCallId' });
      if (idColIdx < 0)  return res.json({ ok: false, message: 'עמודת ApiCallId לא נמצאה בקובץ' });

      const idx = findRowByApiCallId(dataLines, idColIdx, apiCallId);
      if (idx < 0)
        return res.json({ ok: false, message: `שורה עם ApiCallId "${apiCallId}" לא נמצאה` });

      newDataLines = [...dataLines.slice(0, idx), ...dataLines.slice(idx + 1)];
    }

    else if (action === 'edit') {
      if (!apiCallId)   return res.json({ ok: false, message: 'חסר apiCallId' });
      if (idColIdx < 0) return res.json({ ok: false, message: 'עמודת ApiCallId לא נמצאה בקובץ' });

      const idx = findRowByApiCallId(dataLines, idColIdx, apiCallId);
      if (idx < 0)
        return res.json({ ok: false, message: `שורה עם ApiCallId "${apiCallId}" לא נמצאה` });

      const updatedLine = buildLine(headers, rowData, dataLines[idx]);
      newDataLines = [
        ...dataLines.slice(0, idx),
        updatedLine,
        ...dataLines.slice(idx + 1),
      ];
    }

    else if (action === 'add') {
      // For new rows, system cols (ApiCallId etc.) are left empty
      const newLine = headers.map(h => {
        if (READONLY_COLS.includes(h)) return '';
        return encodeURIComponent(String(rowData?.[h] ?? '').replace(/,/g, ''));
      }).join(',');
      newDataLines = [...dataLines, newLine];
    }

    else {
      return res.json({ ok: false, message: `פעולה לא מוכרת: ${action}` });
    }

    // ── 5. Rebuild file text and upload ──────────────────────────────────
    // headerLine is kept byte-for-byte identical; only data lines may change.
    const newContent = [headerLine, ...newDataLines].join('\n');
    await uploadTextFile(token, what, newContent);

    const newHash = contentHash(newDataLines);
    res.json({ ok: true, rowCount: newDataLines.length, newHash });

  } catch (e) {
    res.status(502).json({ ok: false, message: e.message });
  }
};
