/**
 * ボイドオブコース計算モジュール（astroStatus用）
 *
 * 既存の aspect.js の getVoidOfCourseStatus をベースに、
 * 外惑星対応と、ボイドタイムの開始・終了時刻の算出を行う。
 *
 * aspect.js はastroQuery側でも使われるため、そちらは変更せず
 * こちらで拡張版を提供する。
 */

const { calcPlanets, localToJulday, juldayToUtc } = require('./ephemeris');
const { getVoidOfCourseStatus } = require('@astroquery/astro-core');
const { MODERN_PLANETS, VOID_ASPECT_TARGETS_MODERN } = require('../constants/planets');
const { getSignName } = require('./retrograde');

/**
 * 現在のボイドステータスを取得（モダン版・外惑星込み）
 *
 * @param {number} julday - ユリウス日
 * @param {Array} [aspectTargets] - ボイド判定に使う天体セット（省略時はモダンプリセット）
 * @returns {Promise<Object>} ボイドステータス
 */
async function getVoidStatus(julday, aspectTargets) {
  const targets = aspectTargets || VOID_ASPECT_TARGETS_MODERN;

  // 月 + 判定対象天体をまとめて計算
  const moonDef = MODERN_PLANETS.find(p => p.name === '月');
  const allDefs = [moonDef, ...targets];
  const positions = await calcPlanets(julday, allDefs);

  const moon = positions.find(p => p.name === '月');
  const otherPlanets = positions.filter(p => p.name !== '月');

  // 既存のボイド判定ロジックを利用
  const status = getVoidOfCourseStatus(moon.longitude, moon.speed, otherPlanets);

  // 終了時刻をUTCで算出
  let voidEndsAtJd = null;
  let voidEndsAtUtc = null;
  if (status.isVoid && status.daysToExit !== null && Number.isFinite(status.daysToExit)) {
    voidEndsAtJd = julday + status.daysToExit;
    voidEndsAtUtc = await juldayToUtc(voidEndsAtJd);
  }

  return {
    isVoid: status.isVoid,
    moonLongitude: moon.longitude,
    moonSign: getSignName(moon.longitude),
    moonSpeed: moon.speed,
    daysToSignExit: status.daysToExit,
    voidEndsAtJd,
    voidEndsAtUtc,
  };
}

/**
 * 指定期間のボイドタイム一覧を検出
 *
 * 一定間隔で走査し、ボイド開始/終了の区間を特定する。
 *
 * @param {number} jdStart - 開始ユリウス日
 * @param {number} jdEnd - 終了ユリウス日
 * @param {number} stepHours - 走査間隔（時間）
 * @param {Array} [aspectTargets] - ボイド判定に使う天体セット
 * @returns {Promise<Array<Object>>} ボイド区間の配列
 */
async function findVoidPeriods(jdStart, jdEnd, stepHours = 0.5, aspectTargets) {
  const stepDays = stepHours / 24;
  const periods = [];
  let currentVoid = null;

  for (let jd = jdStart; jd <= jdEnd; jd += stepDays) {
    const status = await getVoidStatus(jd, aspectTargets);

    if (status.isVoid && !currentVoid) {
      // ボイド開始を検出
      currentVoid = {
        startJd: jd,
        startUtc: await juldayToUtc(jd),
        moonSign: status.moonSign,
      };
    } else if (!status.isVoid && currentVoid) {
      // ボイド終了を検出
      const endUtc = await juldayToUtc(jd);
      const durationHours = (jd - currentVoid.startJd) * 24;
      periods.push({
        type: 'void_of_course',
        startJd: currentVoid.startJd,
        startUtc: currentVoid.startUtc,
        endJd: jd,
        endUtc,
        durationHours,
        moonSign: currentVoid.moonSign,
      });
      currentVoid = null;
    }
  }

  // 期間終了時にまだボイド中の場合
  if (currentVoid) {
    const status = await getVoidStatus(jdEnd, aspectTargets);
    periods.push({
      type: 'void_of_course',
      startJd: currentVoid.startJd,
      startUtc: currentVoid.startUtc,
      endJd: status.voidEndsAtJd || jdEnd,
      endUtc: status.voidEndsAtUtc || await juldayToUtc(jdEnd),
      durationHours: ((status.voidEndsAtJd || jdEnd) - currentVoid.startJd) * 24,
      moonSign: currentVoid.moonSign,
    });
  }

  return periods;
}

module.exports = {
  getVoidStatus,
  findVoidPeriods,
};
