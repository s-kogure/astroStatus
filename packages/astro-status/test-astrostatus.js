/**
 * astroStatus 用モジュール動作確認スクリプト
 *
 * 各モジュールが正常に動作するかを確認する。
 * 実行: node test-astrostatus.js
 */

const {
  // 天体定義
  MODERN_PLANETS,
  RETROGRADE_TARGETS,
  // Ephemeris
  ephemeris,
  // 逆行・留・イングレス
  getPlanetStatus,
  findStations,
  findIngresses,
  findPlanetEvents,
  SIGN_NAMES,
  // 月相
  findLunarPhases,
  // ボイド
  getVoidStatus,
} = require('./src');

async function main() {
  console.log('=== astroStatus モジュール動作確認 ===\n');

  // 2026年2月20日 12:00 JST (UTC+9)
  const julday = await ephemeris.localToJulday(2026, 2, 20, 12, 0, 0, 9);
  console.log(`基準日時: 2026-02-20 12:00 JST`);
  console.log(`ユリウス日: ${julday.toFixed(6)}\n`);

  // --- 1. 全天体の現在ステータス ---
  console.log('--- 1. 全天体の現在ステータス（モダン10天体） ---');
  for (const def of MODERN_PLANETS) {
    const status = await getPlanetStatus(julday, def);
    const retroLabel = status.retrograde ? ' [逆行中]' : '';
    console.log(
      `  ${status.name}: ${status.sign} ${status.degreeInSign.toFixed(2)}°` +
      ` (速度: ${status.speed.toFixed(4)}°/日)${retroLabel}`
    );
  }
  console.log();

  // --- 2. ボイドオブコース判定（モダン版） ---
  console.log('--- 2. ボイドオブコース判定（モダン版） ---');
  const voidStatus = await getVoidStatus(julday);
  console.log(`  ボイド中: ${voidStatus.isVoid ? 'はい' : 'いいえ'}`);
  console.log(`  月のサイン: ${voidStatus.moonSign}`);
  if (voidStatus.isVoid && voidStatus.voidEndsAtUtc) {
    console.log(`  ボイド終了(UTC): ${JSON.stringify(voidStatus.voidEndsAtUtc)}`);
  }
  console.log();

  // --- 3. 水星の留・イングレス検出（2026年1月〜3月） ---
  console.log('--- 3. 水星の留・イングレス検出（2026年1月〜3月） ---');
  const jdJan = await ephemeris.localToJulday(2026, 1, 1, 0, 0, 0, 0);
  const jdApr = await ephemeris.localToJulday(2026, 4, 1, 0, 0, 0, 0);
  const mercuryDef = RETROGRADE_TARGETS.find(p => p.name === '水星');
  const mercuryEvents = await findPlanetEvents(mercuryDef, jdJan, jdApr);

  console.log('  [留]');
  for (const s of mercuryEvents.stations) {
    const utc = s.utc;
    console.log(`    ${s.type}: ${utc.year}/${utc.month}/${utc.day} ${Math.floor(utc.hour)}:${String(Math.floor(utc.minute)).padStart(2, '0')} UTC - ${s.sign} ${s.degreeInSign.toFixed(2)}°`);
  }
  console.log('  [イングレス]');
  for (const ing of mercuryEvents.ingresses) {
    const utc = ing.utc;
    const retroLabel = ing.retrograde ? ' (逆行中)' : '';
    console.log(`    ${utc.year}/${utc.month}/${utc.day} ${Math.floor(utc.hour)}:${String(Math.floor(utc.minute)).padStart(2, '0')} UTC: ${ing.fromSign} → ${ing.toSign}${retroLabel}`);
  }
  console.log();

  // --- 4. 新月・満月・蝕（2026年1月〜3月） ---
  console.log('--- 4. 新月・満月・蝕（2026年1月〜3月） ---');
  const lunarPhases = await findLunarPhases(jdJan, jdApr);
  for (const phase of lunarPhases) {
    const utc = phase.utc;
    const eclipseLabel = phase.eclipse ? ` *** ${phase.eclipse.label} ***` : '';
    console.log(
      `  ${phase.label}: ${utc.year}/${utc.month}/${utc.day} ${Math.floor(utc.hour)}:${String(Math.floor(utc.minute)).padStart(2, '0')} UTC` +
      ` - ${phase.moonSign}${eclipseLabel}`
    );
  }
  console.log();

  console.log('=== 動作確認完了 ===');
}

main().catch(console.error);
