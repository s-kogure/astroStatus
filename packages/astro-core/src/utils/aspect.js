// アスペクト計算用モジュール

const ORB = {
  conjunction: 8,
  sextile: 6,
  square: 8,
  trine: 8,
  opposition: 8
};

function getAspect(lon1, lon2, speed1, speed2) {
  let diff = Math.abs(lon1 - lon2);
  if (diff > 180) diff = 360 - diff;

  let aspect = null;

  if (diff <= ORB.conjunction) {
    aspect = { type: 'conjunction', angle: 0, orb: diff };
  } else if (Math.abs(diff - 60) <= ORB.sextile) {
    aspect = { type: 'sextile', angle: 60, orb: Math.abs(diff - 60) };
  } else if (Math.abs(diff - 90) <= ORB.square) {
    aspect = { type: 'square', angle: 90, orb: Math.abs(diff - 90) };
  } else if (Math.abs(diff - 120) <= ORB.trine) {
    aspect = { type: 'trine', angle: 120, orb: Math.abs(diff - 120) };
  } else if (Math.abs(diff - 180) <= ORB.opposition) {
    aspect = { type: 'opposition', angle: 180, orb: Math.abs(diff - 180) };
  }

  if (aspect && speed1 !== undefined && speed2 !== undefined) {
    // orbベースでアプライ/セパレート判定
    // 少し未来（0.01日後）のorbを計算し、現在のorbと比較する
    const dt = 0.01; // 0.01日後
    const future_lon1 = (lon1 + speed1 * dt + 360) % 360;
    const future_lon2 = (lon2 + speed2 * dt + 360) % 360;

    // 未来の角度差を計算
    let futureDiff = Math.abs(future_lon1 - future_lon2);
    if (futureDiff > 180) futureDiff = 360 - futureDiff;

    // 未来のorb（目標角度からのずれ）を計算
    const futureOrb = Math.abs(futureDiff - aspect.angle);

    // デバッグログ
    console.log(`[アスペクト判定] ${aspect.type} (${aspect.angle}°)`);
    console.log(`  lon1=${lon1.toFixed(2)}° speed1=${speed1.toFixed(4)}°/日`);
    console.log(`  lon2=${lon2.toFixed(2)}° speed2=${speed2.toFixed(4)}°/日`);
    console.log(`  現在orb=${aspect.orb.toFixed(4)}° 未来orb=${futureOrb.toFixed(4)}°`);
    console.log(`  判定: ${futureOrb < aspect.orb ? 'アプライ' : 'セパレート'}`);

    // orbが減る = アプライ、orbが増える = セパレート
    if (futureOrb < aspect.orb) {
      aspect.applying = true;  // アプライ
    } else {
      aspect.applying = false; // セパレート
    }
  }

  return aspect;
}

const ASPECT_ANGLES = [0, 60, 90, 120, 180];

/**
 * 古典方式のボイドオブコース判定
 * 月が現在のサインを離れるまでにメジャーアスペクトをイグザクトに形成するかを計算。
 * 他天体の移動も速度ベースで考慮する。
 */
function isVoidOfCourse(moonLon, moonSpeed, planets) {
  return getVoidOfCourseStatus(moonLon, moonSpeed, planets).isVoid;
}

/**
 * 古典方式のボイド判定詳細
 * @returns {{ isVoid: boolean, daysToExit: number | null }}
 */
function getVoidOfCourseStatus(moonLon, moonSpeed, planets) {
  // 月が逆行中の場合はサインの先頭（下端）に向かう
  const currentSignStart = Math.floor(moonLon / 30) * 30;
  const currentSignEnd = currentSignStart + 30;

  // 月がサインの境界に到達するまでの度数
  let degreesToBoundary;
  if (moonSpeed >= 0) {
    degreesToBoundary = currentSignEnd - moonLon;
  } else {
    degreesToBoundary = moonLon - currentSignStart;
  }

  // サイン境界に到達するまでの日数（概算）
  const absSpeed = Math.abs(moonSpeed);
  if (absSpeed === 0) {
    return { isVoid: true, daysToExit: null };
  }
  const daysToExit = degreesToBoundary / absSpeed;

  for (const planet of planets) {
    for (const angle of ASPECT_ANGLES) {
      // 月がアスペクトをイグザクトに形成する経度を計算
      // 各アスペクト角度に対して+と-の2方向をチェック
      const targets = [
        (planet.longitude + angle) % 360,
        (planet.longitude - angle + 360) % 360
      ];

      for (const baseTarget of targets) {
        // 他天体の移動を考慮: 線形近似で天体の未来位置を推定
        // アスペクト完成時刻を反復的に求める（簡易1回補正）
        let estimatedDays = 0;
        let target = baseTarget;

        for (let iter = 0; iter < 3; iter++) {
          target = (baseTarget + planet.speed * estimatedDays + 360) % 360;

          // 月の現在位置からtargetまでの移動量
          let moveNeeded;
          if (moonSpeed >= 0) {
            moveNeeded = (target - moonLon + 360) % 360;
            if (moveNeeded > 180) continue; // 反対方向は無視
          } else {
            moveNeeded = (moonLon - target + 360) % 360;
            if (moveNeeded > 180) continue;
          }

          if (absSpeed === 0) break;
          estimatedDays = moveNeeded / absSpeed;
        }

        // 月がサインを出る前にアスペクトが完成するか
        if (estimatedDays > 0 && estimatedDays <= daysToExit) {
          // 完成時の月の位置がまだ同じサイン内か確認
          const moonAtAspect = moonLon + moonSpeed * estimatedDays;
          const normalizedMoon = ((moonAtAspect % 360) + 360) % 360;
          if (normalizedMoon >= currentSignStart && normalizedMoon < currentSignEnd) {
            return { isVoid: false, daysToExit };
          }
        }
      }
    }
  }
  return { isVoid: true, daysToExit };
}

module.exports = { getAspect, isVoidOfCourse, getVoidOfCourseStatus };
