/**
 * Swiss Ephemeris ラッパーモジュール
 *
 * swisseph のコールバックAPIをPromise化し、
 * astroStatus の各計算モジュールから共通で利用できるようにする。
 *
 * 既存の horoscope.js から低レベル部分を抽出・拡張したもの。
 */

const path = require('node:path');
const { createRequire } = require('node:module');

// ── swisseph ロード ──
// astro-core の依存にある swisseph を解決する。
// 直接依存が見つからない場合は astro-core 経由、最後に cwd から探す。
function loadSwisseph() {
  try {
    return require('swisseph');
  } catch {
    try {
      // astro-core の node_modules から解決
      const coreRequire = createRequire(require.resolve('@astroquery/astro-core'));
      return coreRequire('swisseph');
    } catch {
      const appRequireFromCwd = createRequire(path.join(process.cwd(), 'package.json'));
      return appRequireFromCwd('swisseph');
    }
  }
}

const swe = loadSwisseph();
swe.swe_set_ephe_path('');

// ── 時刻変換 ──

/**
 * ローカル時刻をUTCに変換
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @param {number} hour
 * @param {number} minute
 * @param {number} second
 * @param {number} tzHours - タイムゾーンオフセット（時間）
 * @returns {Promise<Object>} UTC時刻オブジェクト
 */
function localToUtc(year, month, day, hour, minute, second, tzHours) {
  return new Promise((resolve) => {
    swe.swe_utc_time_zone(year, month, day, hour, minute, second, tzHours, resolve);
  });
}

/**
 * UTC時刻からユリウス日を取得
 * @param {Object} utc - { year, month, day, hour, minute, second }
 * @returns {Promise<number>} ユリウス日（UT）
 */
async function utcToJulday(utc) {
  const jd = await new Promise((resolve) => {
    swe.swe_utc_to_jd(utc.year, utc.month, utc.day, utc.hour, utc.minute, utc.second, swe.SE_GREG_CAL, resolve);
  });
  return jd.julianDayUT;
}

/**
 * ローカル時刻からユリウス日を一発で取得
 */
async function localToJulday(year, month, day, hour, minute, second, tzHours = 0) {
  const utc = await localToUtc(year, month, day, hour, minute, second, tzHours);
  return utcToJulday(utc);
}

/**
 * ユリウス日からUTC日時に変換
 * @param {number} julday - ユリウス日
 * @returns {Promise<Object>} { year, month, day, hour, minute, second }
 */
function juldayToUtc(julday) {
  return new Promise((resolve) => {
    swe.swe_jdut1_to_utc(julday, swe.SE_GREG_CAL, (result) => {
      resolve(result);
    });
  });
}

// ── 天体計算 ──

/**
 * 天体の位置・速度を計算
 * @param {number} julday - ユリウス日
 * @param {number} planetId - Swiss Ephemeris 天体ID
 * @param {string} planetName - 表示用天体名
 * @returns {Promise<Object>} { name, longitude, speed, retrograde }
 */
function calcPlanet(julday, planetId, planetName) {
  return new Promise((resolve) => {
    swe.swe_calc_ut(julday, planetId, swe.SEFLG_SPEED, (result) => {
      resolve({
        name: planetName,
        id: planetId,
        longitude: result.longitude,
        latitude: result.latitude,
        speed: result.longitudeSpeed,
        retrograde: result.longitudeSpeed < 0,
      });
    });
  });
}

/**
 * 複数天体を一括計算
 * @param {number} julday - ユリウス日
 * @param {Array<{id: number, name: string}>} planetDefs - 天体定義配列
 * @returns {Promise<Array<Object>>} 天体情報の配列
 */
function calcPlanets(julday, planetDefs) {
  return Promise.all(
    planetDefs.map(def => calcPlanet(julday, def.id, def.name))
  );
}

// ── エクスポート ──

module.exports = {
  swe,
  localToUtc,
  utcToJulday,
  localToJulday,
  juldayToUtc,
  calcPlanet,
  calcPlanets,
};
