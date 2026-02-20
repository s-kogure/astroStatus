// ── 天体定義・プリセット ──
const {
  SE_PLANET_ID,
  PLANET_DEFS,
  TRADITIONAL_PLANETS,
  MODERN_PLANETS,
  RETROGRADE_TARGETS,
  VOID_ASPECT_TARGETS_TRADITIONAL,
  VOID_ASPECT_TARGETS_MODERN,
} = require('./constants/planets');

// ── Swiss Ephemeris ラッパー ──
const ephemeris = require('./services/ephemeris');

// ── サイン・天体ステータス ──
const {
  SIGN_NAMES,
  getSignIndex,
  getSignName,
  getPlanetStatus,
  findStations,
  findIngresses,
  findPlanetEvents,
} = require('./services/retrograde');

// ── 月相・蝕 ──
const {
  findLunarPhases,
  getSunMoonElongation,
  checkEclipse,
  SYNODIC_MONTH,
} = require('./services/lunar-phases');

// ── ボイドオブコース（モダン版） ──
const {
  getVoidStatus,
  findVoidPeriods,
} = require('./services/void-of-course');

module.exports = {
  // 天体定義・プリセット
  SE_PLANET_ID,
  PLANET_DEFS,
  TRADITIONAL_PLANETS,
  MODERN_PLANETS,
  RETROGRADE_TARGETS,
  VOID_ASPECT_TARGETS_TRADITIONAL,
  VOID_ASPECT_TARGETS_MODERN,

  // Swiss Ephemeris ラッパー
  ephemeris,

  // サイン・天体ステータス
  SIGN_NAMES,
  getSignIndex,
  getSignName,
  getPlanetStatus,

  // 逆行・留・イングレス
  findStations,
  findIngresses,
  findPlanetEvents,

  // 月相・蝕
  findLunarPhases,
  getSunMoonElongation,
  checkEclipse,
  SYNODIC_MONTH,

  // ボイドオブコース（モダン版）
  getVoidStatus,
  findVoidPeriods,
};
