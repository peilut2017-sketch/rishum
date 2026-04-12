const fetch = require('node-fetch');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, tablePath, apiBase } = req.body;
  const base = (apiBase || 'https://www.call2all.co.il/ym/api').replace(/\/$/, '');

  try {
    const url = `${base}/GetIvrTables?token=${encodeURIComponent(token)}&path=${encodeURIComponent(tablePath)}`;
    const r = await fetch(url);
    const text = await r.text();

    try {
      const json = JSON.parse(text);
      if (json.responseStatus && json.responseStatus !== 'OK') {
        return res.json({ ok: false, message: json.message || json.responseStatus });
      }
      if (typeof json.table === 'string') {
        return res.json({ ok: true, format: 'csv', data: json.table });
      }
      return res.json({ ok: true, format: 'json', data: json });
    } catch {
      return res.json({ ok: true, format: 'csv', data: text.trim() });
    }
  } catch (e) {
    res.status(502).json({ ok: false, message: e.message });
  }
};
