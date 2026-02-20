/**
 * 逆行・留・イングレス検出モジュール
 *
 * 天体の状態変化（順行⇔逆行、サイン移動）を検出する。
 * バッチで定期的に呼び出し、状態変化の時刻を特定する用途。
 */

const { calcPlanet, localToJulday, juldayToUtc } = require('./ephemeris');

// サイン名（経度→サイン変換用）
const SIGN_NAMES = [
  '牡羊座', '牡牛座', '双子座', '蟹座', '獅子座', '乙女座',
  '天秤座', '蠍座', '射手座', '山羊座', '水瓶座', '魚座',
];

/**
 * 経度からサインインデックスを取得
 */
function getSignIndex(longitude) {
  return Math.floor(((longitude % 360) + 360) % 360 / 30);
}

/**
 * 経度からサイン名を取得
 */
function getSignName(longitude) {
  return SIGN_NAMES[getSignIndex(longitude)];
}

/**
 * 天体の現在の状態を取得
 *
 * @param {number} julday - ユリウス日
 * @param {Object} planetDef - 天体定義 { id, name }
 * @returns {Promise<Object>} 状態情報
 */
async function getPlanetStatus(julday, planetDef) {
  const pos = await calcPlanet(julday, planetDef.id, planetDef.name);
  const signIndex = getSignIndex(pos.longitude);

  return {
    name: pos.name,
    id: pos.id,
    longitude: pos.longitude,
    speed: pos.speed,
    retrograde: pos.retrograde,
    sign: SIGN_NAMES[signIndex],
    signIndex,
    degreeInSign: pos.longitude % 30,
  };
}

/**
 * 留（ステーション）の時刻を二分探索で特定する
 *
 * 速度の符号が変わる区間を探し、速度≒0となる瞬間を求める。
 *
 * @param {number} planetId - 天体ID
 * @param {string} planetName - 天体名
 * @param {number} jdStart - 探索開始ユリウス日
 * @param {number} jdEnd - 探索終了ユリウス日
 * @param {number} stepDays - 初期走査のステップ幅（日）
 * @returns {Promise<Array<Object>>} 留のイベント配列
 */
async function findStations(planetId, planetName, jdStart, jdEnd, stepDays = 1) {
  const stations = [];

  // ステップごとに速度の符号変化を検出
  let prevPos = await calcPlanet(jdStart, planetId, planetName);

  for (let jd = jdStart + stepDays; jd <= jdEnd; jd += stepDays) {
    const currPos = await calcPlanet(jd, planetId, planetName);

    // 速度の符号が変わった → この区間に留がある
    if ((prevPos.speed > 0 && currPos.speed < 0) || (prevPos.speed < 0 && currPos.speed > 0)) {
      const stationType = currPos.speed < 0 ? 'station_retrograde' : 'station_direct';
      const exactJd = await bisectStation(planetId, planetName, jd - stepDays, jd);
      const exactUtc = await juldayToUtc(exactJd);
      const exactPos = await calcPlanet(exactJd, planetId, planetName);

      stations.push({
        type: stationType,
        planet: planetName,
        julday: exactJd,
        utc: exactUtc,
        longitude: exactPos.longitude,
        sign: getSignName(exactPos.longitude),
        degreeInSign: exactPos.longitude % 30,
      });
    }

    prevPos = currPos;
  }

  return stations;
}

/**
 * 留の正確な時刻を二分探索で求める
 * 速度が0に最も近い時刻を探す
 */
async function bisectStation(planetId, planetName, jdLow, jdHigh, iterations = 30) {
  for (let i = 0; i < iterations; i++) {
    const jdMid = (jdLow + jdHigh) / 2;
    const posLow = await calcPlanet(jdLow, planetId, planetName);
    const posMid = await calcPlanet(jdMid, planetId, planetName);

    // 符号が変わる側に絞り込む
    if ((posLow.speed > 0 && posMid.speed < 0) || (posLow.speed < 0 && posMid.speed > 0)) {
      jdHigh = jdMid;
    } else {
      jdLow = jdMid;
    }
  }

  return (jdLow + jdHigh) / 2;
}

/**
 * イングレス（サイン移動）の時刻を検出する
 *
 * @param {number} planetId - 天体ID
 * @param {string} planetName - 天体名
 * @param {number} jdStart - 探索開始ユリウス日
 * @param {number} jdEnd - 探索終了ユリウス日
 * @param {number} stepDays - 初期走査のステップ幅（日）
 * @returns {Promise<Array<Object>>} イングレスのイベント配列
 */
async function findIngresses(planetId, planetName, jdStart, jdEnd, stepDays = 1) {
  const ingresses = [];

  let prevPos = await calcPlanet(jdStart, planetId, planetName);
  let prevSign = getSignIndex(prevPos.longitude);

  for (let jd = jdStart + stepDays; jd <= jdEnd; jd += stepDays) {
    const currPos = await calcPlanet(jd, planetId, planetName);
    const currSign = getSignIndex(currPos.longitude);

    if (prevSign !== currSign) {
      // サインが変わった → この区間で二分探索
      const exactJd = await bisectIngress(planetId, planetName, jd - stepDays, jd, prevSign);
      const exactUtc = await juldayToUtc(exactJd);
      const exactPos = await calcPlanet(exactJd, planetId, planetName);

      // toSign は検出時の currSign を使う
      // （境界ぴったりだと浮動小数点精度で元サインに判定されうるため）
      ingresses.push({
        type: 'ingress',
        planet: planetName,
        julday: exactJd,
        utc: exactUtc,
        fromSign: SIGN_NAMES[prevSign],
        toSign: SIGN_NAMES[currSign],
        longitude: exactPos.longitude,
        retrograde: exactPos.retrograde,
      });

      prevSign = currSign;
    } else {
      prevSign = currSign;
    }

    prevPos = currPos;
  }

  return ingresses;
}

/**
 * イングレスの正確な時刻を二分探索で求める
 */
async function bisectIngress(planetId, planetName, jdLow, jdHigh, fromSign, iterations = 30) {
  for (let i = 0; i < iterations; i++) {
    const jdMid = (jdLow + jdHigh) / 2;
    const posMid = await calcPlanet(jdMid, planetId, planetName);
    const midSign = getSignIndex(posMid.longitude);

    if (midSign === fromSign) {
      jdLow = jdMid;
    } else {
      jdHigh = jdMid;
    }
  }

  return (jdLow + jdHigh) / 2;
}

/**
 * 指定期間の天体イベント（留・イングレス）をまとめて取得
 *
 * @param {Object} planetDef - 天体定義 { id, name, retrogradeNotice }
 * @param {number} jdStart - 探索開始ユリウス日
 * @param {number} jdEnd - 探索終了ユリウス日
 * @param {number} stepDays - 走査ステップ幅（外惑星は大きめでOK）
 * @returns {Promise<Object>} { stations: [...], ingresses: [...] }
 */
async function findPlanetEvents(planetDef, jdStart, jdEnd, stepDays) {
  // 天体ごとに適切なステップ幅を設定
  // 内惑星は動きが速いので細かく、外惑星は粗くてOK
  const step = stepDays || getDefaultStep(planetDef.category);

  const [stations, ingresses] = await Promise.all([
    findStations(planetDef.id, planetDef.name, jdStart, jdEnd, step),
    findIngresses(planetDef.id, planetDef.name, jdStart, jdEnd, step),
  ]);

  return { stations, ingresses };
}

/**
 * カテゴリに応じたデフォルトのステップ幅
 */
function getDefaultStep(category) {
  switch (category) {
    case 'personal':      return 0.5;  // 水星〜火星: 0.5日刻み
    case 'social':        return 1;    // 木星・土星: 1日刻み
    case 'transpersonal': return 2;    // 天王星〜冥王星: 2日刻み
    default:              return 1;
  }
}

module.exports = {
  SIGN_NAMES,
  getSignIndex,
  getSignName,
  getPlanetStatus,
  findStations,
  findIngresses,
  findPlanetEvents,
};
