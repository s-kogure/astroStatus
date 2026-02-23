/**
 * 天体ステータスJSON生成バッチ
 *
 * 実行すると public/data/ に以下のJSONを出力する:
 *   - current.json : 現在の天体ステータス（1時間おきcron想定）
 *   - schedule.json: 月間スケジュール（月次バッチ想定）
 *
 * 使い方:
 *   node batch/generate-status.js
 *   node batch/generate-status.js --current-only  (currentだけ更新)
 *   node batch/generate-status.js --schedule-only  (scheduleだけ更新)
 */

const fs = require('node:fs');
const path = require('node:path');

const {
  MODERN_PLANETS,
  RETROGRADE_TARGETS,
  ephemeris,
  getPlanetStatus,
  findPlanetEvents,
  findLunarPhases,
  getVoidStatus,
  findVoidPeriods,
} = require('../packages/astro-status/src');

const OUTPUT_DIR = path.resolve(__dirname, '../public/data');

// ── ユーティリティ ──

function formatUtc(utc) {
  if (!utc) return null;
  const h = Math.floor(utc.hour);
  const m = Math.floor(utc.minute);
  const s = Math.floor(utc.second);
  return `${utc.year}-${String(utc.month).padStart(2, '0')}-${String(utc.day).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}Z`;
}

function writeJson(filename, data) {
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`  -> ${filepath}`);
}

// ── 現在のステータス生成 ──

async function generateCurrent() {
  console.log('[current.json] 現在の天体ステータスを生成中...');

  const now = new Date();
  const julday = await ephemeris.localToJulday(
    now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(),
    now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), 0
  );

  // 全天体のステータス
  const planets = [];
  for (const def of MODERN_PLANETS) {
    const status = await getPlanetStatus(julday, def);
    planets.push({
      name: status.name,
      sign: status.sign,
      degreeInSign: Math.round(status.degreeInSign * 100) / 100,
      speed: Math.round(status.speed * 10000) / 10000,
      retrograde: status.retrograde,
    });
  }

  // ボイドステータス
  const voidStatus = await getVoidStatus(julday);
  const voidInfo = {
    isVoid: voidStatus.isVoid,
    moonSign: voidStatus.moonSign,
    endsAt: voidStatus.voidEndsAtUtc ? formatUtc(voidStatus.voidEndsAtUtc) : null,
  };

  // 直近48時間のボイド期間
  const voidPeriods = await findVoidPeriods(julday, julday + 2, 0.25);
  const upcomingVoids = voidPeriods.map(v => ({
    startUtc: formatUtc(v.startUtc),
    endUtc: formatUtc(v.endUtc),
    durationHours: Math.round(v.durationHours * 10) / 10,
    moonSign: v.moonSign,
    startedBeforeRangeStart: !!v.startedBeforeRangeStart,
    startEstimated: !!v.startEstimated,
  }));

  const data = {
    generatedAt: now.toISOString(),
    julday,
    planets,
    void: voidInfo,
    upcomingVoids,
  };

  writeJson('current.json', data);
  console.log('[current.json] 完了');
}

// ── 月間スケジュール生成 ──

async function generateSchedule() {
  console.log('[schedule.json] 月間スケジュールを生成中...');

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  // 月相用: 今月の1日〜2ヶ月先（従来どおり）
  const jdStart = await ephemeris.localToJulday(year, month, 1, 0, 0, 0, 0);
  const endMonth2m = month + 2 > 12 ? month + 2 - 12 : month + 2;
  const endYear2m = month + 2 > 12 ? year + 1 : year;
  const jdEnd2m = await ephemeris.localToJulday(endYear2m, endMonth2m, 1, 0, 0, 0, 0);

  // 天体イベント用: 今月の1日〜1年先
  const endMonth12m = month > 12 ? month - 12 : month;
  const endYear12m = year + 1;
  const jdEnd12m = await ephemeris.localToJulday(endYear12m, endMonth12m, 1, 0, 0, 0, 0);

  // 新月・満月・蝕（2ヶ月分）
  console.log('  月相を計算中...');
  const lunarPhases = await findLunarPhases(jdStart, jdEnd2m);
  const phases = lunarPhases.map(p => ({
    type: p.type,
    label: p.label,
    utc: formatUtc(p.utc),
    moonSign: p.moonSign,
    sunSign: p.sunSign,
    eclipse: p.eclipse ? {
      type: p.eclipse.type,
      label: p.eclipse.label,
    } : null,
  }));

  // 各天体の逆行/留/イングレス（1年分）
  console.log('  天体イベントを計算中（1年分）...');
  const planetEvents = [];
  for (const def of RETROGRADE_TARGETS) {
    console.log(`    ${def.name}...`);
    const events = await findPlanetEvents(def, jdStart, jdEnd12m);

    for (const s of events.stations) {
      planetEvents.push({
        type: s.type,
        planet: s.planet,
        utc: formatUtc(s.utc),
        sign: s.sign,
        degreeInSign: Math.round(s.degreeInSign * 100) / 100,
      });
    }

    for (const ing of events.ingresses) {
      planetEvents.push({
        type: 'ingress',
        planet: ing.planet,
        utc: formatUtc(ing.utc),
        fromSign: ing.fromSign,
        toSign: ing.toSign,
        retrograde: ing.retrograde,
      });
    }
  }

  // 時系列でソート
  planetEvents.sort((a, b) => a.utc.localeCompare(b.utc));

  const data = {
    generatedAt: now.toISOString(),
    period: {
      from: `${year}-${String(month).padStart(2, '0')}-01`,
      to: `${endYear12m}-${String(endMonth12m).padStart(2, '0')}-01`,
    },
    lunarPhases: phases,
    planetEvents,
  };

  writeJson('schedule.json', data);
  console.log('[schedule.json] 完了');
}

// ── メイン ──

async function main() {
  const args = process.argv.slice(2);
  const currentOnly = args.includes('--current-only');
  const scheduleOnly = args.includes('--schedule-only');

  if (!currentOnly && !scheduleOnly) {
    await generateCurrent();
    await generateSchedule();
  } else if (currentOnly) {
    await generateCurrent();
  } else if (scheduleOnly) {
    await generateSchedule();
  }

  console.log('\nバッチ完了！');
}

main().catch(err => {
  console.error('バッチエラー:', err);
  process.exit(1);
});
