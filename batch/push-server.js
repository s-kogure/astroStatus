/**
 * push通知 購読管理ミニサーバー
 *
 * 購読登録/解除のAPIだけを提供する軽量HTTPサーバー。
 * Nginx からリバースプロキシで /api/push/* を転送する想定。
 *
 * エンドポイント:
 *   POST /api/push/subscribe   - 購読を登録
 *   POST /api/push/unsubscribe - 購読を解除
 *   GET  /api/push/vapid-key   - VAPID公開鍵を返す
 *
 * 環境変数:
 *   VAPID_PUBLIC_KEY  - VAPID公開鍵
 *   PUSH_SERVER_PORT  - ポート番号（デフォルト: 3900）
 *
 * 使い方:
 *   node batch/push-server.js
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const SUBS_FILE = path.resolve(__dirname, 'subscriptions.json');
const PORT = parseInt(process.env.PUSH_SERVER_PORT, 10) || 3900;

function loadSubscriptions() {
  try {
    return JSON.parse(fs.readFileSync(SUBS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveSubscriptions(subs) {
  fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2), 'utf-8');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function respond(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    respond(res, 204, {});
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // VAPID公開鍵の取得
  if (url.pathname === '/api/push/vapid-key' && req.method === 'GET') {
    respond(res, 200, { publicKey: process.env.VAPID_PUBLIC_KEY || '' });
    return;
  }

  // 購読登録
  if (url.pathname === '/api/push/subscribe' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      if (!body.endpoint) {
        respond(res, 400, { error: 'endpoint is required' });
        return;
      }
      const subs = loadSubscriptions();
      const exists = subs.some((s) => s.endpoint === body.endpoint);
      if (!exists) {
        subs.push(body);
        saveSubscriptions(subs);
        console.log(`購読登録: ${body.endpoint.slice(0, 60)}...`);
      }
      respond(res, 200, { ok: true });
    } catch (err) {
      respond(res, 400, { error: err.message });
    }
    return;
  }

  // 購読解除
  if (url.pathname === '/api/push/unsubscribe' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const subs = loadSubscriptions();
      const filtered = subs.filter((s) => s.endpoint !== body.endpoint);
      saveSubscriptions(filtered);
      console.log(`購読解除: ${(body.endpoint || '').slice(0, 60)}...`);
      respond(res, 200, { ok: true });
    } catch (err) {
      respond(res, 400, { error: err.message });
    }
    return;
  }

  respond(res, 404, { error: 'Not Found' });
});

server.listen(PORT, () => {
  console.log(`push-server listening on port ${PORT}`);
});
