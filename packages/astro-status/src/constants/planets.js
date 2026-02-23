/**
 * 天体定義モジュール
 *
 * Swiss Ephemeris の天体IDと、astroStatus で使用する天体情報を対応付ける。
 * 将来的な解釈パターン切り替え（伝統 / モダン）に対応できるよう、
 * プリセットとして分離している。
 */

// Swiss Ephemeris 天体ID（swisseph モジュールの定数と同値）
const SE_PLANET_ID = {
  SUN: 0,
  MOON: 1,
  MERCURY: 2,
  VENUS: 3,
  MARS: 4,
  JUPITER: 5,
  SATURN: 6,
  URANUS: 7,
  NEPTUNE: 8,
  PLUTO: 9,
  MEAN_NODE: 10,   // 平均ノード（ドラゴンヘッド）
  TRUE_NODE: 11,    // 真ノード
};

/**
 * 天体定義
 * id: Swiss Ephemeris の天体ID
 * name: 表示名（日本語）
 * category: 分類（luminary / personal / social / transpersonal / node）
 * retrogradeNotice: 逆行/留の事前通知日数（仕様: 水星金星火星=10日、木星以降=14日）
 */
const PLANET_DEFS = [
  { id: SE_PLANET_ID.SUN,     name: '太陽',     category: 'luminary',      retrogradeNotice: null },
  { id: SE_PLANET_ID.MOON,    name: '月',       category: 'luminary',      retrogradeNotice: null },
  { id: SE_PLANET_ID.MERCURY, name: '水星',     category: 'personal',      retrogradeNotice: 10 },
  { id: SE_PLANET_ID.VENUS,   name: '金星',     category: 'personal',      retrogradeNotice: 10 },
  { id: SE_PLANET_ID.MARS,    name: '火星',     category: 'personal',      retrogradeNotice: 10 },
  { id: SE_PLANET_ID.JUPITER, name: '木星',     category: 'social',        retrogradeNotice: 14 },
  { id: SE_PLANET_ID.SATURN,  name: '土星',     category: 'social',        retrogradeNotice: 14 },
  { id: SE_PLANET_ID.URANUS,  name: '天王星',   category: 'transpersonal', retrogradeNotice: 14 },
  { id: SE_PLANET_ID.NEPTUNE, name: '海王星',   category: 'transpersonal', retrogradeNotice: 14 },
  { id: SE_PLANET_ID.PLUTO,   name: '冥王星',   category: 'transpersonal', retrogradeNotice: 14 },
];

// ── プリセット ──
// ボイド判定や各種計算で「どの天体を対象にするか」を切り替えるためのセット

/** 伝統占星術: 太陽〜土星 */
const TRADITIONAL_PLANETS = PLANET_DEFS.filter(
  p => ['luminary', 'personal', 'social'].includes(p.category)
);

/** モダン占星術: 太陽〜冥王星 */
const MODERN_PLANETS = PLANET_DEFS.filter(
  p => ['luminary', 'personal', 'social', 'transpersonal'].includes(p.category)
);

/** 逆行追跡対象（太陽と月は逆行しないので除外） */
const RETROGRADE_TARGETS = PLANET_DEFS.filter(
  p => p.retrogradeNotice !== null
);

/** ボイド判定のアスペクト対象（月以外の天体） */
const VOID_ASPECT_TARGETS_TRADITIONAL = TRADITIONAL_PLANETS.filter(p => p.name !== '月');
const VOID_ASPECT_TARGETS_MODERN = MODERN_PLANETS.filter(p => p.name !== '月');

module.exports = {
  SE_PLANET_ID,
  PLANET_DEFS,
  TRADITIONAL_PLANETS,
  MODERN_PLANETS,
  RETROGRADE_TARGETS,
  VOID_ASPECT_TARGETS_TRADITIONAL,
  VOID_ASPECT_TARGETS_MODERN,
};
