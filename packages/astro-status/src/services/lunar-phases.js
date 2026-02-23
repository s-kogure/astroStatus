/**
 * 新月・満月・日食・月食 計算モジュール
 *
 * 太陽と月の経度差から新月(合)・満月(衝)の正確な時刻を求める。
 * さらにノード軸との距離から日食・月食の可能性を判定する。
 */

const { calcPlanet, juldayToUtc } = require('./ephemeris');
const { SE_PLANET_ID } = require('../constants/planets');
const { getSignName } = require('./retrograde');

// 朔望月の平均周期（日）
const SYNODIC_MONTH = 29.530588;

// 蝕判定のノード距離しきい値（度）
// 太陽-月のコンジャンクション/オポジション時にノードから何度以内なら蝕の可能性があるか
const ECLIPSE_ORB = {
  solar: 18.5,   // 日食: ノードから18.5度以内（部分日食含む）
  lunar: 12.0,   // 月食: ノードから12度以内（部分月食含む）
};

/**
 * 太陽と月の経度差を計算（0〜360度）
 */
async function getSunMoonElongation(julday) {
  const [sun, moon] = await Promise.all([
    calcPlanet(julday, SE_PLANET_ID.SUN, '太陽'),
    calcPlanet(julday, SE_PLANET_ID.MOON, '月'),
  ]);
  const elongation = ((moon.longitude - sun.longitude) % 360 + 360) % 360;
  return { elongation, sun, moon };
}

/**
 * 新月・満月の正確な時刻を二分探索で求める
 *
 * @param {number} jdStart - 探索開始ユリウス日
 * @param {number} jdEnd - 探索終了ユリウス日
 * @param {number} targetElongation - 目標角度差（0=新月, 180=満月）
 * @param {number} iterations - 二分探索の反復回数
 * @returns {Promise<number>} 正確なユリウス日
 */
async function bisectPhase(jdStart, jdEnd, targetElongation, iterations = 40) {
  let jdLow = jdStart;
  let jdHigh = jdEnd;

  for (let i = 0; i < iterations; i++) {
    const jdMid = (jdLow + jdHigh) / 2;
    const { elongation } = await getSunMoonElongation(jdMid);

    // 目標角度との差を計算（-180〜180の範囲に正規化）
    let diff = elongation - targetElongation;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    // 月の方が太陽より速いので、elongationは基本的に増加する
    // diff < 0 → まだ目標角に達していない
    if (diff < 0) {
      jdLow = jdMid;
    } else {
      jdHigh = jdMid;
    }
  }

  return (jdLow + jdHigh) / 2;
}

/**
 * 指定期間の新月・満月イベントを検出
 *
 * @param {number} jdStart - 探索開始ユリウス日
 * @param {number} jdEnd - 探索終了ユリウス日
 * @returns {Promise<Array<Object>>} 月相イベントの配列
 */
async function findLunarPhases(jdStart, jdEnd) {
  const phases = [];
  const stepDays = 1; // 1日刻みで走査

  let prev = await getSunMoonElongation(jdStart);

  for (let jd = jdStart + stepDays; jd <= jdEnd; jd += stepDays) {
    const curr = await getSunMoonElongation(jd);

    // 新月の検出: elongationが360→0を跨ぐ（330以上から30未満へ）
    if (prev.elongation > 300 && curr.elongation < 60) {
      const exactJd = await bisectPhase(jd - stepDays, jd, 0);
      const event = await buildPhaseEvent(exactJd, 'new_moon', '新月');
      phases.push(event);
    }

    // 満月の検出: elongationが180を跨ぐ（150未満から210以上、もしくは逆）
    if (prev.elongation < 180 && curr.elongation >= 180) {
      const exactJd = await bisectPhase(jd - stepDays, jd, 180);
      const event = await buildPhaseEvent(exactJd, 'full_moon', '満月');
      phases.push(event);
    }

    prev = curr;
  }

  return phases;
}

/**
 * 月相イベントオブジェクトを構築（蝕判定含む）
 */
async function buildPhaseEvent(julday, type, label) {
  const utc = await juldayToUtc(julday);
  const [sun, moon, node] = await Promise.all([
    calcPlanet(julday, SE_PLANET_ID.SUN, '太陽'),
    calcPlanet(julday, SE_PLANET_ID.MOON, '月'),
    calcPlanet(julday, SE_PLANET_ID.TRUE_NODE, 'ドラゴンヘッド'),
  ]);

  // ノードとの距離で蝕判定
  const eclipse = checkEclipse(type, sun, moon, node);

  return {
    type,
    label,
    julday,
    utc,
    moonLongitude: moon.longitude,
    moonSign: getSignName(moon.longitude),
    sunLongitude: sun.longitude,
    sunSign: getSignName(sun.longitude),
    eclipse,
  };
}

/**
 * 蝕の判定
 *
 * @param {string} phaseType - 'new_moon' | 'full_moon'
 * @param {Object} sun - 太陽位置
 * @param {Object} moon - 月位置
 * @param {Object} node - ドラゴンヘッド位置
 * @returns {Object|null} 蝕情報（null=蝕ではない）
 */
function checkEclipse(phaseType, sun, moon, node) {
  // ノード軸: ドラゴンヘッドとドラゴンテイル（180度対向）
  const nodeLon = node.longitude;
  const antiNodeLon = (nodeLon + 180) % 360;

  // 太陽（≒月、新月時）または月（満月時）とノードとの最小距離
  const targetLon = phaseType === 'new_moon' ? sun.longitude : moon.longitude;

  let distToNode = Math.abs(targetLon - nodeLon);
  if (distToNode > 180) distToNode = 360 - distToNode;

  let distToAntiNode = Math.abs(targetLon - antiNodeLon);
  if (distToAntiNode > 180) distToAntiNode = 360 - distToAntiNode;

  const minDist = Math.min(distToNode, distToAntiNode);

  if (phaseType === 'new_moon' && minDist <= ECLIPSE_ORB.solar) {
    return {
      type: 'solar',
      label: '日食',
      distanceToNode: minDist,
    };
  }

  if (phaseType === 'full_moon' && minDist <= ECLIPSE_ORB.lunar) {
    return {
      type: 'lunar',
      label: '月食',
      distanceToNode: minDist,
    };
  }

  return null;
}

module.exports = {
  findLunarPhases,
  getSunMoonElongation,
  checkEclipse,
  SYNODIC_MONTH,
};
