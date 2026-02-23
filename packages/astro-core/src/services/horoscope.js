const path = require('node:path');
const { createRequire } = require('node:module');

function loadSwisseph() {
  try {
    return require('swisseph');
  } catch {
    // 同一PJ内MVP向け: 実行側プロジェクトの依存から解決する
    try {
      const appRequireFromCwd = createRequire(path.join(process.cwd(), 'package.json'));
      return appRequireFromCwd('swisseph');
    } catch {
      const appRequireFromRepo = createRequire(path.resolve(__dirname, '../../../../horary-app/package.json'));
      return appRequireFromRepo('swisseph');
    }
  }
}

const swe = loadSwisseph();
const { getAspect, getVoidOfCourseStatus } = require('../utils/aspect');

// Swiss Ephemerisの初期化
swe.swe_set_ephe_path('');

/**
 * 天体計算をPromise化
 * @param {number} julday - ユリウス日
 * @param {number} planetId - 天体ID
 * @param {string} planetName - 天体名
 * @returns {Promise<Object>} 天体情報
 */
function calcPlanet(julday, planetId, planetName) {
  return new Promise((resolve) => {
    swe.swe_calc_ut(julday, planetId, swe.SEFLG_SPEED, (result) => {
      resolve({
        name: planetName,
        longitude: result.longitude,
        speed: result.longitudeSpeed,
        retrograde: result.longitudeSpeed < 0
      });
    });
  });
}

/**
 * ハウス計算をPromise化
 * @param {number} julday - ユリウス日
 * @param {number} lat - 緯度
 * @param {number} lon - 経度
 * @returns {Promise<Object>} ハウス情報
 */
function calcHouses(julday, lat, lon) {
  return new Promise((resolve) => {
    swe.swe_houses(julday, lat, lon, 'R', (result) => {
      resolve(result);
    });
  });
}

function calcVoidEndsAtUtc(year, month, day, hour, minute, second, tzHours, daysToExit) {
  if (!Number.isFinite(daysToExit)) return null;
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, second) - (tzHours * 60 * 60 * 1000);
  return new Date(baseUtcMs + daysToExit * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * ホロスコープ計算
 * @param {number} year - 年
 * @param {number} month - 月
 * @param {number} day - 日
 * @param {number} hour - 時
 * @param {number} minute - 分
 * @param {number} second - 秒
 * @param {number} lat - 緯度
 * @param {number} lon - 経度
 * @returns {Promise<Object>} ホロスコープ情報
 */
async function calculateHoroscope(year, month, day, hour, minute, second, lat, lon, tzHours = 0) {
  // ローカル時刻 → UTC変換（クライアントのタイムゾーンを使用）
  const utc = await new Promise((resolve) => {
    swe.swe_utc_time_zone(year, month, day, hour, minute, second, tzHours, resolve);
  });

  // ユリウス日を取得
  const jd = await new Promise((resolve) => {
    swe.swe_utc_to_jd(utc.year, utc.month, utc.day, utc.hour, utc.minute, utc.second, swe.SE_GREG_CAL, resolve);
  });

  const julday = jd.julianDayUT;

  // 全天体を計算
  const planets = await Promise.all([
    calcPlanet(julday, swe.SE_SUN, '太陽'),
    calcPlanet(julday, swe.SE_MOON, '月'),
    calcPlanet(julday, swe.SE_MERCURY, '水星'),
    calcPlanet(julday, swe.SE_VENUS, '金星'),
    calcPlanet(julday, swe.SE_MARS, '火星'),
    calcPlanet(julday, swe.SE_JUPITER, '木星'),
    calcPlanet(julday, swe.SE_SATURN, '土星')
  ]);

  // ハウス計算
  const houses = await calcHouses(julday, lat, lon);

  // 月のアスペクト
  const moon = planets.find(p => p.name === '月');
  const otherPlanets = planets.filter(p => p.name !== '月');

  const moonAspects = [];
  for (const planet of otherPlanets) {
    const aspect = getAspect(moon.longitude, planet.longitude, moon.speed, planet.speed);
    if (aspect) {
      moonAspects.push({
        planet: planet.name,
        type: aspect.type,
        orb: aspect.orb.toFixed(2),
        applying: aspect.applying
      });
    }
  }

  // パート・オブ・フォーチュン計算
  const sun = planets.find(p => p.name === '太陽');
  const asc = houses.ascendant;
  // 昼夜判定: 太陽が地平線上（ASCからDSCまで反時計回り = ハウス7〜12側）なら昼
  // 簡易判定: 太陽経度からASC経度を引いた差が0〜180なら太陽は地平線上（昼）
  let sunAboveHorizon = ((sun.longitude - asc + 360) % 360) < 180;
  let pof;
  if (sunAboveHorizon) {
    // 昼: ASC + Moon - Sun
    pof = (asc + moon.longitude - sun.longitude + 360) % 360;
  } else {
    // 夜: ASC + Sun - Moon
    pof = (asc + sun.longitude - moon.longitude + 360) % 360;
  }

  // ボイド判定
  const voidStatus = getVoidOfCourseStatus(moon.longitude, moon.speed, otherPlanets);
  const isVoid = voidStatus.isVoid;
  const voidEndsAtUtc = isVoid
    ? calcVoidEndsAtUtc(year, month, day, hour, minute, second, tzHours, voidStatus.daysToExit)
    : null;

  return {
    planets,
    houses,
    moonAspects,
    isVoid,
    voidEndsAtUtc,
    pof,
    isDayChart: sunAboveHorizon
  };
}

async function calculateVoidStatus(year, month, day, hour, minute, second, tzHours = 0) {
  const utc = await new Promise((resolve) => {
    swe.swe_utc_time_zone(year, month, day, hour, minute, second, tzHours, resolve);
  });

  const jd = await new Promise((resolve) => {
    swe.swe_utc_to_jd(utc.year, utc.month, utc.day, utc.hour, utc.minute, utc.second, swe.SE_GREG_CAL, resolve);
  });

  const julday = jd.julianDayUT;
  const planets = await Promise.all([
    calcPlanet(julday, swe.SE_MOON, '月'),
    calcPlanet(julday, swe.SE_SUN, '太陽'),
    calcPlanet(julday, swe.SE_MERCURY, '水星'),
    calcPlanet(julday, swe.SE_VENUS, '金星'),
    calcPlanet(julday, swe.SE_MARS, '火星'),
    calcPlanet(julday, swe.SE_JUPITER, '木星'),
    calcPlanet(julday, swe.SE_SATURN, '土星')
  ]);

  const moon = planets.find(p => p.name === '月');
  const otherPlanets = planets.filter(p => p.name !== '月');
  const voidStatus = getVoidOfCourseStatus(moon.longitude, moon.speed, otherPlanets);

  return {
    isVoid: voidStatus.isVoid,
    voidEndsAtUtc: voidStatus.isVoid
      ? calcVoidEndsAtUtc(year, month, day, hour, minute, second, tzHours, voidStatus.daysToExit)
      : null
  };
}

module.exports = { calculateHoroscope, calculateVoidStatus };
