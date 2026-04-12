'use strict';

const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DEFAULT_BASE = 'https://www.call2all.co.il/ym/api';

// ─── Login (username + password → token) ──────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password, apiBase } = req.body;
  const base = (apiBase || DEFAULT_BASE).replace(/\/$/, '');
  try {
    const r = await fetch(
      `${base}/Login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
    );
    const json = await r.json();
    res.json(json);
  } catch (e) {
    res.status(502).json({ responseStatus: 'ERROR', message: e.message });
  }
});

// ─── GetIvrTables proxy ────────────────────────────────────────────────────────
app.post('/api/get-data', async (req, res) => {
  const { token, tablePath, apiBase } = req.body;
  const base = (apiBase || DEFAULT_BASE).replace(/\/$/, '');

  try {
    const url = `${base}/GetIvrTables?token=${encodeURIComponent(token)}&path=${encodeURIComponent(tablePath)}`;
    const r = await fetch(url);
    const text = await r.text();

    // Try JSON parse first
    try {
      const json = JSON.parse(text);

      // ימות המשיח error response
      if (json.responseStatus && json.responseStatus !== 'OK') {
        return res.json({ ok: false, message: json.message || json.responseStatus });
      }

      // If it has a "table" string field → treat as CSV
      if (typeof json.table === 'string') {
        return res.json({ ok: true, format: 'csv', data: json.table });
      }

      return res.json({ ok: true, format: 'json', data: json });
    } catch {
      // Plain text / CSV response
      if (!text.trim()) {
        return res.json({ ok: true, format: 'csv', data: '' });
      }
      return res.json({ ok: true, format: 'csv', data: text });
    }
  } catch (e) {
    res.status(502).json({ ok: false, message: e.message });
  }
});

// ─── List files in a path (tries sibling paths) ───────────────────────────────
app.post('/api/list-files', async (req, res) => {
  const listFiles = require('./api/list-files');
  return listFiles(req, res);
});

// ─── Generic proxy (for advanced / custom endpoints) ──────────────────────────
app.post('/api/proxy', async (req, res) => {
  const { url } = req.body;
  if (!url || !url.startsWith('https://')) {
    return res.status(400).json({ ok: false, message: 'כתובת URL לא תקינה' });
  }
  try {
    const r = await fetch(url);
    const text = await r.text();
    try {
      res.json({ ok: true, format: 'json', data: JSON.parse(text) });
    } catch {
      res.json({ ok: true, format: 'csv', data: text });
    }
  } catch (e) {
    res.status(502).json({ ok: false, message: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀  מערכת ניהול ימות המשיח פועלת`);
  console.log(`📱  פתח בדפדפן: http://localhost:${PORT}\n`);
});
