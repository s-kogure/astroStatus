/**
 * エッセンシャル・ディグニティ テーブル & 判定モジュール
 *
 * ウィリアム・リリー『Christian Astrology』準拠
 * データソース: /_csv/dignity_score.csv, /_csv/dignity_notes.md
 *
 * 自己完結型モジュール（外部依存なし）
 * 将来的に npm パッケージとして切り出すことを想定
 */

// ── スコアリング定数 ──
const SCORE = {
  domicile: 5,
  exaltation: 4,
  triplicity: 3,
  term: 2,
  face: 1,
  detriment: -5,
  fall: -4,
  peregrine: -5,
};

// CSV由来の曖昧値を内部表記へ正規化するルール
// - 「近世」は入力ミス由来の値として扱い、金星へ補正する
const PLANET_NAME_NORMALIZATION = Object.freeze({
  火: '火星',
  水: '水星',
  近世: '金星',
});

function normalizeRulerName(name) {
  if (name == null) return name;
  return PLANET_NAME_NORMALIZATION[name] || name;
}

// ── ディグニティテーブル ──
// 配列インデックス = サインインデックス (0=牡羊座 ... 11=魚座)
// boundary = 「数え度数」。判定は degree < boundary で行う
const DIGNITY_TABLE = [
  // 0: 牡羊座
  {
    domicile: '火星',
    exaltation: '太陽',
    triplicityDay: '太陽',
    triplicityNight: '木星',
    terms: [
      { planet: '木星', boundary: 6 },
      { planet: '金星', boundary: 14 },
      { planet: '水星', boundary: 21 },
      { planet: '火星', boundary: 26 },
      { planet: '土星', boundary: 30 },
    ],
    faces: [
      { planet: '火星', boundary: 10 },
      { planet: '太陽', boundary: 20 },
      { planet: '金星', boundary: 30 },
    ],
    detriment: '金星',
    fall: '土星',
  },
  // 1: 牡牛座
  {
    domicile: '金星',
    exaltation: '月',
    triplicityDay: '金星',
    triplicityNight: '月',
    terms: [
      { planet: '金星', boundary: 8 },
      { planet: '水星', boundary: 15 },
      { planet: '木星', boundary: 22 },
      { planet: '土星', boundary: 26 },
      { planet: '火星', boundary: 30 },
    ],
    faces: [
      { planet: '水星', boundary: 10 },
      { planet: '月', boundary: 20 },
      { planet: '土星', boundary: 30 },
    ],
    detriment: '火星',
    fall: null,
  },
  // 2: 双子座
  {
    domicile: '水星',
    exaltation: 'ドラゴンヘッド', // 7天体外のためマッチしない
    triplicityDay: '土星',
    triplicityNight: '水星',
    terms: [
      { planet: '水星', boundary: 7 },
      { planet: '木星', boundary: 14 },
      { planet: '金星', boundary: 21 },
      { planet: '土星', boundary: 25 },
      { planet: '火星', boundary: 30 },
    ],
    faces: [
      { planet: '木星', boundary: 10 },
      { planet: '火星', boundary: 20 },
      { planet: '太陽', boundary: 30 },
    ],
    detriment: '木星',
    fall: null,
  },
  // 3: 蟹座
  {
    domicile: '月',
    exaltation: '木星',
    triplicityDay: '火星',
    triplicityNight: '火星',
    terms: [
      { planet: '火星', boundary: 6 },
      { planet: '木星', boundary: 13 },
      { planet: '水星', boundary: 20 },
      { planet: '金星', boundary: 27 },
      { planet: '土星', boundary: 30 },
    ],
    faces: [
      { planet: '金星', boundary: 10 },
      { planet: '水星', boundary: 20 },
      { planet: '月', boundary: 30 },
    ],
    detriment: '土星',
    fall: '火星',
  },
  // 4: 獅子座
  {
    domicile: '太陽',
    exaltation: null,
    triplicityDay: '太陽',
    triplicityNight: '木星',
    terms: [
      { planet: '土星', boundary: 6 },
      { planet: '水星', boundary: 13 },
      { planet: '金星', boundary: 19 },
      { planet: '木星', boundary: 25 },
      { planet: '火星', boundary: 30 },
    ],
    faces: [
      { planet: '土星', boundary: 10 },
      { planet: '木星', boundary: 20 },
      { planet: '火星', boundary: 30 },
    ],
    detriment: '土星',
    fall: null,
  },
  // 5: 乙女座
  {
    domicile: '水星',
    exaltation: '水星',
    triplicityDay: '金星',
    triplicityNight: '火星',
    terms: [
      { planet: '水星', boundary: 6 },
      { planet: '金星', boundary: 13 },
      { planet: '木星', boundary: 18 },
      { planet: '土星', boundary: 24 },
      { planet: '火星', boundary: 30 },
    ],
    faces: [
      { planet: '太陽', boundary: 10 },
      { planet: '金星', boundary: 20 },
      { planet: '水星', boundary: 30 },
    ],
    detriment: '木星',
    fall: '金星',
  },
  // 6: 天秤座
  {
    domicile: '金星',
    exaltation: '土星',
    triplicityDay: '土星',
    triplicityNight: '水星',
    terms: [
      { planet: '土星', boundary: 6 },
      { planet: '金星', boundary: 11 },
      { planet: '木星', boundary: 19 },
      { planet: '水星', boundary: 24 },
      { planet: '土星', boundary: 30 },
    ],
    faces: [
      { planet: '月', boundary: 10 },
      { planet: '土星', boundary: 20 },
      { planet: '木星', boundary: 30 },
    ],
    detriment: '火星',
    fall: '太陽',
  },
  // 7: 蠍座
  {
    domicile: '火星',
    exaltation: null,
    triplicityDay: '火星',
    triplicityNight: '火星',
    terms: [
      { planet: '火星', boundary: 6 },
      { planet: '木星', boundary: 14 },
      { planet: '金星', boundary: 21 },
      { planet: '水星', boundary: 27 },
      { planet: '火星', boundary: 30 },
    ],
    faces: [
      { planet: '火星', boundary: 10 },
      { planet: '太陽', boundary: 20 },
      { planet: '金星', boundary: 30 },
    ],
    detriment: '金星',
    fall: '月',
  },
  // 8: 射手座
  {
    domicile: '木星',
    exaltation: 'ドラゴンテイル', // 7天体外のためマッチしない
    triplicityDay: '太陽',
    triplicityNight: '木星',
    terms: [
      { planet: '木星', boundary: 8 },
      { planet: '金星', boundary: 14 },
      { planet: '水星', boundary: 19 },
      { planet: '土星', boundary: 25 },
      { planet: '火星', boundary: 30 },
    ],
    faces: [
      { planet: '水星', boundary: 10 },
      { planet: '月', boundary: 20 },
      { planet: '土星', boundary: 30 },
    ],
    detriment: '水星',
    fall: null,
  },
  // 9: 山羊座
  {
    domicile: '土星',
    exaltation: '火星',
    triplicityDay: '金星',
    triplicityNight: '水星',
    terms: [
      { planet: '金星', boundary: 6 },
      { planet: '水星', boundary: 12 },
      { planet: '木星', boundary: 19 },
      { planet: '火星', boundary: 25 },
      { planet: '土星', boundary: 30 },
    ],
    faces: [
      { planet: '木星', boundary: 10 },
      { planet: '火星', boundary: 20 },
      { planet: '太陽', boundary: 30 },
    ],
    detriment: '月',
    fall: '木星',
  },
  // 10: 水瓶座
  {
    domicile: '土星',
    exaltation: null,
    triplicityDay: '土星',
    triplicityNight: '水星',
    terms: [
      { planet: '土星', boundary: 6 },
      { planet: '水星', boundary: 12 },
      { planet: '金星', boundary: 20 },
      { planet: '木星', boundary: 25 },
      { planet: '火星', boundary: 30 },
    ],
    faces: [
      { planet: '金星', boundary: 10 },
      { planet: '水星', boundary: 20 },
      { planet: '月', boundary: 30 },
    ],
    detriment: '太陽',
    fall: null,
  },
  // 11: 魚座
  {
    domicile: '木星',
    exaltation: '金星',
    triplicityDay: '火星',
    triplicityNight: '火星',
    terms: [
      { planet: '金星', boundary: 8 },
      { planet: '木星', boundary: 14 },
      { planet: '水星', boundary: 20 },
      { planet: '火星', boundary: 25 },
      { planet: '火星', boundary: 30 },
    ],
    faces: [
      { planet: '土星', boundary: 10 },
      { planet: '木星', boundary: 20 },
      { planet: '火星', boundary: 30 },
    ],
    detriment: '水星',
    fall: '水星',
  },
];

/**
 * 指定天体の全ディグニティを判定する
 *
 * @param {string} planetName - 天体名（日本語: '太陽','月','水星','金星','火星','木星','土星'）
 * @param {number} signIndex  - サインインデックス 0-11 (Math.floor(longitude / 30))
 * @param {number} degree     - サイン内度数 (longitude % 30, float 0-29.xx)
 * @param {boolean} isDayChart - 昼チャートか (true=昼, false=夜)
 * @returns {Object} 各ディグニティの真偽値とスコア
 */
function getDignities(planetName, signIndex, degree, isDayChart) {
  const sign = DIGNITY_TABLE[signIndex];
  if (!sign) {
    return { domicile: false, exaltation: false, triplicity: false, term: false, face: false, detriment: false, fall: false, peregrine: true, score: SCORE.peregrine };
  }

  const normalizedPlanetName = normalizeRulerName(planetName);
  const domicile = normalizeRulerName(sign.domicile) === normalizedPlanetName;
  const exaltation = normalizeRulerName(sign.exaltation) === normalizedPlanetName;
  const detriment = normalizeRulerName(sign.detriment) === normalizedPlanetName;
  const fall = normalizeRulerName(sign.fall) === normalizedPlanetName;

  // トリプシティ: 昼夜で支配星が異なる
  const triplicity = isDayChart
    ? normalizeRulerName(sign.triplicityDay) === normalizedPlanetName
    : normalizeRulerName(sign.triplicityNight) === normalizedPlanetName;

  // ターム: degree < boundary で最初にマッチした区間
  let term = false;
  for (const t of sign.terms) {
    if (degree < t.boundary) {
      term = normalizeRulerName(t.planet) === normalizedPlanetName;
      break;
    }
  }

  // フェイス: degree < boundary で最初にマッチした区間
  let face = false;
  for (const f of sign.faces) {
    if (degree < f.boundary) {
      face = normalizeRulerName(f.planet) === normalizedPlanetName;
      break;
    }
  }

  // ペレグリン: いずれのエッセンシャルディグニティにも該当しない
  const hasAnyDignity = domicile || exaltation || triplicity || term || face;
  const peregrine = !hasAnyDignity;

  const score = getDignityScore({ domicile, exaltation, triplicity, term, face, detriment, fall, peregrine });

  return { domicile, exaltation, triplicity, term, face, detriment, fall, peregrine, score };
}

/**
 * ディグニティスコアを算出する
 *
 * @param {Object} dignities - 各ディグニティの真偽値
 * @returns {number} 合計スコア
 */
function getDignityScore(dignities) {
  let score = 0;
  if (dignities.domicile) score += SCORE.domicile;
  if (dignities.exaltation) score += SCORE.exaltation;
  if (dignities.triplicity) score += SCORE.triplicity;
  if (dignities.term) score += SCORE.term;
  if (dignities.face) score += SCORE.face;
  if (dignities.detriment) score += SCORE.detriment;
  if (dignities.fall) score += SCORE.fall;
  if (dignities.peregrine) score += SCORE.peregrine;
  return score;
}

module.exports = {
  getDignities,
  getDignityScore,
  normalizeRulerName,
  PLANET_NAME_NORMALIZATION,
  DIGNITY_TABLE,
  SCORE,
};
