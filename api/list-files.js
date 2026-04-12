const fetch = require('node-fetch');

const API_BASE = 'https://www.call2all.co.il/ym/api';
const enc = encodeURIComponent;

const COMMON_FILES = [
  'approvalall.ymgr', 'ApprovalAll.ymgr', 'approval_all.ymgr',
  'ALL.YMGR', 'All.ymgr', 'DATA.YMGR', 'data.ymgr', 'FORMDATA.YMGR',
];

async function tryFile(token, ext, fileName) {
  const what = `ivr2:/${ext}/${fileName}`;
  const url  = `${API_BASE}/RenderYMGRFile?wath=${enc(what)}&format=html&token=${enc(token)}`;
  try {
    const r    = await Promise.race([
      fetch(url, { headers: { authorization: token } }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 7000))
    ]);
    const html = await r.text();
    const preview = (html || '').slice(0, 200);

    if (!html || !html.trim())  return { found: false, fileName, preview: '(empty)' };
    if (!html.includes('<td'))  return { found: false, fileName, preview };

    const rowCount = (html.match(/<tr[^>]*>/gi) || []).length - 1;
    if (rowCount < 1) return { found: false, fileName, preview };

    const headers = [];
    const thRe = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let m;
    while ((m = thRe.exec(html)) !== null) {
      headers.push(m[1].replace(/<[^>]+>/g, '').trim());
    }

    return { found: true, path: `ivr2:/${ext}/${fileName}`, fileName, headers, rowCount };
  } catch(e) {
    return { found: false, fileName, preview: e.message };
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, extension } = req.body;
  if (!token || !extension) return res.json({ ok: false, message: 'נדרש token ומספר שלוחה' });

  const ext = String(extension).replace(/^\//, '');

  const results = await Promise.all(COMMON_FILES.map(f => tryFile(token, ext, f)));
  const found   = results.filter(r => r.found);
  const debug   = results.filter(r => !r.found).slice(0, 2); // first 2 failures for diagnosis

  res.json({ ok: true, files: found, debug });
};
