/**
 * ボイドオブコース計算モジュール（astroStatus用）
 *
 * 既存の aspect.js の getVoidOfCourseStatus をベースに、
 * 外惑星対応と、ボイドタイムの開始・終了時刻の算出を行う。
 *
 * aspect.js はastroQuery側でも使われるため、そちらは変更せず
 * こちらで拡張版を提供する。
 */

const { calcPlanets, juldayToUtc } = require('./ephemeris');
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
  if (jdEnd <= jdStart) return [];

  const stepDays = stepHours / 24;
  if (stepDays <= 0) {
    throw new Error('stepHours must be greater than 0');
  }

  const periods = [];
  let currentVoid = null;
  let prevJd = jdStart;
  let prevStatus = await getVoidStatus(jdStart, aspectTargets);

  // 期間開始時点ですでにボイド中なら、直前へ遡って実開始時刻を推定する
  if (prevStatus.isVoid) {
    const startInfo = await findVoidStartFromOngoing(jdStart, stepDays, aspectTargets);
    currentVoid = {
      startJd: startInfo.startJd,
      startUtc: await juldayToUtc(startInfo.startJd),
      moonSign: prevStatus.moonSign,
      startedBeforeRangeStart: true,
      startEstimated: !startInfo.precise,
    };
  }

  for (let jd = jdStart + stepDays; jd <= jdEnd; jd += stepDays) {
    const currStatus = await getVoidStatus(jd, aspectTargets);

    if (!prevStatus.isVoid && currStatus.isVoid && !currentVoid) {
      // ボイド開始を検出（ステップ間の遷移時刻を二分探索で補間）
      const startJd = await bisectVoidTransition(prevJd, jd, true, aspectTargets);
      currentVoid = {
        startJd,
        startUtc: await juldayToUtc(startJd),
        moonSign: currStatus.moonSign,
        startedBeforeRangeStart: false,
        startEstimated: false,
      };
    } else if (prevStatus.isVoid && !currStatus.isVoid && currentVoid) {
      // ボイド終了を検出（ステップ間の遷移時刻を二分探索で補間）
      const endJd = await bisectVoidTransition(prevJd, jd, false, aspectTargets);
      const endUtc = await juldayToUtc(endJd);
      const durationHours = (endJd - currentVoid.startJd) * 24;
      periods.push({
        type: 'void_of_course',
        startJd: currentVoid.startJd,
        startUtc: currentVoid.startUtc,
        endJd,
        endUtc,
        durationHours,
        moonSign: currentVoid.moonSign,
        startedBeforeRangeStart: currentVoid.startedBeforeRangeStart,
        startEstimated: currentVoid.startEstimated,
      });
      currentVoid = null;
    }

    prevJd = jd;
    prevStatus = currStatus;
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
      startedBeforeRangeStart: currentVoid.startedBeforeRangeStart,
      startEstimated: currentVoid.startEstimated,
    });
  }

  return periods;
}

/**
 * 期間開始時点で進行中のボイドの開始時刻を、指定日数まで遡って探索する
 * （通常のボイド継続時間より十分長い5日を上限にする）
 */
async function findVoidStartFromOngoing(jdStart, stepDays, aspectTargets, maxBacktrackDays = 5) {
  let highJd = jdStart;
  let lowJd = jdStart - stepDays;
  const minJd = jdStart - maxBacktrackDays;

  while (lowJd >= minJd) {
    const lowStatus = await getVoidStatus(lowJd, aspectTargets);
    if (!lowStatus.isVoid) {
      const startJd = await bisectVoidTransition(lowJd, highJd, true, aspectTargets);
      return { startJd, precise: true };
    }
    highJd = lowJd;
    lowJd -= stepDays;
  }

  return { startJd: jdStart, precise: false };
}

/**
 * ボイド状態の遷移境界を二分探索で求める
 * @param {number} jdNonVoid - 非ボイド側の時刻
 * @param {number} jdVoid - ボイド側の時刻
 * @param {boolean} nonVoidToVoid - true: 非ボイド→ボイド, false: ボイド→非ボイド
 */
async function bisectVoidTransition(jdA, jdB, nonVoidToVoid, aspectTargets, iterations = 25) {
  let low = jdA;
  let high = jdB;

  for (let i = 0; i < iterations; i++) {
    const mid = (low + high) / 2;
    const midStatus = await getVoidStatus(mid, aspectTargets);

    if (nonVoidToVoid) {
      // low: 非ボイド, high: ボイド
      if (midStatus.isVoid) {
        high = mid;
      } else {
        low = mid;
      }
    } else {
      // low: ボイド, high: 非ボイド
      if (midStatus.isVoid) {
        low = mid;
      } else {
        high = mid;
      }
    }
  }

  return (low + high) / 2;
}

module.exports = {
  getVoidStatus,
  findVoidPeriods,
};
