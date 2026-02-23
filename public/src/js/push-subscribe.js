/**
 * push通知の購読管理（フロント側）
 *
 * Service Worker 登録後に呼ばれ、通知の許可取得 → VAPID鍵取得 → 購読登録を行う。
 */

const API_BASE = './api/push';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getVapidKey() {
  const res = await fetch(`${API_BASE}/vapid-key`);
  const data = await res.json();
  return data.publicKey;
}

async function sendSubscription(subscription) {
  await fetch(`${API_BASE}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });
}

export async function initPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push通知非対応ブラウザ');
    return;
  }

  const registration = await navigator.serviceWorker.ready;

  // 既に購読済みならスキップ
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    console.log('Push通知: 購読済み');
    return;
  }

  // 通知許可を要求
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.log('Push通知: 許可されませんでした');
    return;
  }

  try {
    const vapidKey = await getVapidKey();
    if (!vapidKey) {
      console.warn('VAPID公開鍵が取得できません');
      return;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    await sendSubscription(subscription);
    console.log('Push通知: 購読登録完了');
  } catch (err) {
    console.warn('Push通知の購読に失敗:', err);
  }
}
