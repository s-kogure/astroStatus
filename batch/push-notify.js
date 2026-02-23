/**
 * push通知バッチ
 *
 * cron（1時間おき推奨）で実行し、schedule.json / current.json を読み取り、
 * 通知条件に合致するイベントがあれば Web Push で送信する。
 *
 * 依存: web-push (npm install web-push)
 *
 * 環境変数:
 *   VAPID_PUBLIC_KEY  - VAPID公開鍵
 *   VAPID_PRIVATE_KEY - VAPID秘密鍵
 *   VAPID_SUBJECT     - mailto:xxx or https://xxx
 *
 * VAPID鍵生成:
 *   npx web-push generate-vapid-keys
 *
 * 使い方:
 *   node batch/push-notify.js
 */

const fs = require('node:fs');
const path = require('node:path');

// web-push はVPS上でinstallされる前提
let webpush;
try {
  webpush = require('web-push');
} catch {
  console.error('web-push が見つかりません。npm install web-push を実行してください。');
  process.exit(1);
}

// ── 設定 ──

const DATA_DIR = path.resolve(__dirname, '../public/data');
const SUBS_FILE = path.resolve(__dirname, 'subscriptions.json');
const SENT_LOG = path.resolve(__dirname, 'sent-notifications.json');

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// VAPID設定
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@astro-query.com',
  process.env.VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
);

// ── ユーティリティ ──

function loadJson(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch {
    return null;
  }
}

function saveJson(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

function getSubscriptions() {
  return loadJson(SUBS_FILE) || [];
}

function getSentLog() {
  return loadJson(SENT_LOG) || {};
}

function saveSentLog(log) {
  saveJson(SENT_LOG, log);
}

/** UTC文字列 → JST Date */
function toJst(utcString) {
  const ms = Date.parse(utcString);
  if (isNaN(ms)) return null;
  return new Date(ms + JST_OFFSET_MS);
}

/** JSTの時 (0-23) を取得 */
function getJstHour(utcString) {
  const jst = toJst(utcString);
  return jst ? jst.getUTCHours() : null;
}

/** JST日付文字列（重複チェック用） */
function jstDateKey(utcString) {
  const jst = toJst(utcString);
  if (!jst) return null;
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatJst(utcString) {
  const jst = toJst(utcString);
  if (!jst) return '不明';
  const m = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();
  const h = String(jst.getUTCHours()).padStart(2, '0');
  const min = String(jst.getUTCMinutes()).padStart(2, '0');
  return `${m}月${d}日 ${h}:${min}`;
}

/** 夜間判定 (JST 0:00〜7:59) */
function isNightHourJst(utcString) {
  const h = getJstHour(utcString);
  return h !== null && h < 8;
}

/** 現在のJST時刻が送信可能か (8:00〜23:59) */
function isNowSendable() {
  const now = new Date();
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  const h = jstNow.getUTCHours();
  return h >= 8 && h <= 23;
}

// ── 通知判定ロジック ──

/**
 * ボイドタイム通知の判定
 *
 * ルール（issue_20260223.md 準拠）:
 * 1. 3時間以上のボイドのみ対象
 * 2. 通知する1: 通知時刻(ボイド2h前)が日中(8:00〜24:00) → 2h前に送信
 * 3. 通知する2: ボイド開始は夜間だが終了が朝9時以降 → 23時までに送信
 * 4. 遅延する: 通知時刻が夜間だがボイド自体は朝以降もまたぐ → 8:00に送信
 * 5. スキップ: 夜間に始まって朝8時台までに終わる → 通知しない
 */
function checkVoidNotifications(current, nowMs) {
  const notifications = [];
  const voids = current?.upcomingVoids || [];

  for (const v of voids) {
    const startMs = Date.parse(v.startUtc);
    const endMs = Date.parse(v.endUtc);
    if (isNaN(startMs) || isNaN(endMs)) continue;

    const durationHours = (endMs - startMs) / (1000 * 60 * 60);
    if (durationHours < 3) continue; // 3時間未満はスキップ

    const twoHoursBefore = startMs - 2 * 60 * 60 * 1000;
    const startJstH = getJstHour(v.startUtc);
    const endJst = toJst(v.endUtc);
    const endJstH = endJst ? endJst.getUTCHours() : 0;

    let sendAtMs = null;
    let reason = '';

    // ルール1: 通知時刻（2h前）が日中
    if (!isNightHourJst(new Date(twoHoursBefore).toISOString())) {
      sendAtMs = twoHoursBefore;
      reason = '2h前通常';
    }
    // ルール5チェック: 夜間開始で朝8時台までに終了 → スキップ
    else if (startJstH !== null && startJstH < 8 && endJstH < 9) {
      continue; // 通知しない
    }
    // ルール2: ボイド開始は夜間だが終了が朝9時以降 → 前日23時
    else if (startJstH !== null && startJstH < 8 && endJstH >= 9) {
      // 前日の23時(JST)に送信
      const startJst = toJst(v.startUtc);
      const prevDay23Jst = new Date(Date.UTC(
        startJst.getUTCFullYear(),
        startJst.getUTCMonth(),
        startJst.getUTCDate() - 1,
        23, 0, 0
      ));
      sendAtMs = prevDay23Jst.getTime() - JST_OFFSET_MS; // JST→UTC
      reason = '前日23時送信';
    }
    // ルール3: 通知時刻が夜間だがボイドが朝以降もまたぐ → 8:00送信
    else {
      const startJst = toJst(v.startUtc);
      const morning8Jst = new Date(Date.UTC(
        startJst.getUTCFullYear(),
        startJst.getUTCMonth(),
        startJst.getUTCDate(),
        8, 0, 0
      ));
      sendAtMs = morning8Jst.getTime() - JST_OFFSET_MS;
      reason = '朝8時遅延';
    }

    if (sendAtMs === null) continue;

    // 送信タイミング判定: sendAt の前後30分なら送信
    const diffMs = Math.abs(nowMs - sendAtMs);
    if (diffMs <= 30 * 60 * 1000) {
      notifications.push({
        tag: `void-${jstDateKey(v.startUtc)}-${startJstH}`,
        title: 'ボイドタイム予告',
        body: `${formatJst(v.startUtc)} 〜 ${formatJst(v.endUtc)}（${Math.round(durationHours * 10) / 10}時間）`,
        reason,
      });
    }
  }

  return notifications;
}

/**
 * 水星逆行通知の判定
 *
 * ルール（issue_20260223.md 準拠）:
 * - 逆行開始: 320時間前のJST12:00 ＆ 開始時刻
 * - 逆行終了: 72時間以上前のJST12:00
 */
function checkMercuryRetroNotifications(schedule, nowMs) {
  const notifications = [];
  const events = schedule?.planetEvents || [];

  for (const ev of events) {
    if (ev.planet !== '水星') continue;
    const evMs = Date.parse(ev.utc);
    if (isNaN(evMs)) continue;

    if (ev.type === 'station_retrograde') {
      // 320時間前のJST12:00に通知
      const preNotifyMs = evMs - 320 * 60 * 60 * 1000;
      const preJst = new Date(preNotifyMs + JST_OFFSET_MS);
      const noon320Jst = new Date(Date.UTC(
        preJst.getUTCFullYear(), preJst.getUTCMonth(), preJst.getUTCDate(), 12, 0, 0
      ));
      const noon320UtcMs = noon320Jst.getTime() - JST_OFFSET_MS;

      if (Math.abs(nowMs - noon320UtcMs) <= 30 * 60 * 1000) {
        notifications.push({
          tag: `mercury-retro-pre-${jstDateKey(ev.utc)}`,
          title: '水星逆行まもなく',
          body: `水星逆行開始: ${formatJst(ev.utc)}（約${Math.round((evMs - nowMs) / (1000 * 60 * 60))}時間後）`,
        });
      }

      // 開始時刻に通知
      if (Math.abs(nowMs - evMs) <= 30 * 60 * 1000) {
        notifications.push({
          tag: `mercury-retro-start-${jstDateKey(ev.utc)}`,
          title: '水星逆行開始',
          body: `水星が逆行を開始しました（${formatJst(ev.utc)}）`,
        });
      }
    }

    if (ev.type === 'station_direct' && ev.planet === '水星') {
      // 72時間以上前のJST12:00に通知
      const preNotifyMs = evMs - 72 * 60 * 60 * 1000;
      const preJst = new Date(preNotifyMs + JST_OFFSET_MS);
      const noon72Jst = new Date(Date.UTC(
        preJst.getUTCFullYear(), preJst.getUTCMonth(), preJst.getUTCDate(), 12, 0, 0
      ));
      const noon72UtcMs = noon72Jst.getTime() - JST_OFFSET_MS;

      if (Math.abs(nowMs - noon72UtcMs) <= 30 * 60 * 1000) {
        notifications.push({
          tag: `mercury-direct-pre-${jstDateKey(ev.utc)}`,
          title: '水星逆行まもなく終了',
          body: `水星順行復帰: ${formatJst(ev.utc)}（約${Math.round((evMs - nowMs) / (1000 * 60 * 60))}時間後）`,
        });
      }
    }
  }

  return notifications;
}

// ── 送信 ──

async function sendNotification(subscription, payload) {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // 購読が無効化されている
      return 'expired';
    }
    console.error('送信エラー:', err.message);
    return false;
  }
}

async function broadcastNotifications(notifications) {
  if (notifications.length === 0) return;

  const subscriptions = getSubscriptions();
  if (subscriptions.length === 0) {
    console.log('購読者がいないため送信スキップ');
    return;
  }

  const sentLog = getSentLog();
  const today = new Date().toISOString().slice(0, 10);
  const expiredIndices = [];

  for (const notif of notifications) {
    // 重複チェック
    if (sentLog[notif.tag]) {
      console.log(`  スキップ（送信済み）: ${notif.tag}`);
      continue;
    }

    console.log(`  送信: ${notif.title} - ${notif.body}`);

    for (let i = 0; i < subscriptions.length; i++) {
      const result = await sendNotification(subscriptions[i], {
        title: notif.title,
        body: notif.body,
        tag: notif.tag,
        url: './',
      });
      if (result === 'expired') {
        expiredIndices.push(i);
      }
    }

    sentLog[notif.tag] = today;
  }

  // 無効な購読を削除
  if (expiredIndices.length > 0) {
    const unique = [...new Set(expiredIndices)].sort((a, b) => b - a);
    const cleaned = [...subscriptions];
    for (const idx of unique) cleaned.splice(idx, 1);
    saveJson(SUBS_FILE, cleaned);
    console.log(`  ${unique.length}件の無効な購読を削除`);
  }

  // 古い送信ログを掃除（30日以上前のエントリ削除）
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  for (const key of Object.keys(sentLog)) {
    if (sentLog[key] < thirtyDaysAgo) delete sentLog[key];
  }

  saveSentLog(sentLog);
}

// ── メイン ──

async function main() {
  console.log('[push-notify] 通知チェック開始...');

  // 夜間は送信しない
  if (!isNowSendable()) {
    console.log('  夜間のため送信スキップ（JST 0:00〜7:59）');
    return;
  }

  const current = loadJson(path.join(DATA_DIR, 'current.json'));
  const schedule = loadJson(path.join(DATA_DIR, 'schedule.json'));

  if (!current || !schedule) {
    console.error('  データファイルが見つかりません');
    process.exit(1);
  }

  const nowMs = Date.now();
  const notifications = [];

  // ボイドタイム通知
  const voidNotifs = checkVoidNotifications(current, nowMs);
  notifications.push(...voidNotifs);

  // 水星逆行通知
  const retroNotifs = checkMercuryRetroNotifications(schedule, nowMs);
  notifications.push(...retroNotifs);

  console.log(`  ${notifications.length}件の通知候補`);

  await broadcastNotifications(notifications);

  console.log('[push-notify] 完了');
}

main().catch((err) => {
  console.error('push-notify エラー:', err);
  process.exit(1);
});
