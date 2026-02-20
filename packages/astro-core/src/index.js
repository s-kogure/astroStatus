const { calculateHoroscope, calculateVoidStatus } = require('./services/horoscope');
const { getAspect, isVoidOfCourse, getVoidOfCourseStatus } = require('./utils/aspect');
const {
  getDignities,
  getDignityScore,
  normalizeRulerName,
  PLANET_NAME_NORMALIZATION,
  DIGNITY_TABLE,
  SCORE,
} = require('./utils/dignityTable');

module.exports = {
  calculateHoroscope,
  calculateVoidStatus,
  getAspect,
  isVoidOfCourse,
  getVoidOfCourseStatus,
  getDignities,
  getDignityScore,
  normalizeRulerName,
  PLANET_NAME_NORMALIZATION,
  DIGNITY_TABLE,
  SCORE,
};
