import { initLuckyEffects } from './ui_affects.js';
import { initPushSubscription } from './push-subscribe.js';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEK_JA = ['日', '月', '火', '水', '木', '金', '土'];
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

const PLANET_META = {
  Sun: { jp: '太陽', icon: 'sun' },
  Moon: { jp: '月', icon: 'moon' },
  Mercury: { jp: '水星', icon: 'mercury' },
  Venus: { jp: '金星', icon: 'venus' },
  Mars: { jp: '火星', icon: 'mars' },
  Jupiter: { jp: '木星', icon: 'jupiter' },
  Saturn: { jp: '土星', icon: 'saturn' },
  Uranus: { jp: '天王星', icon: 'uranus' },
  Neptune: { jp: '海王星', icon: 'neptune' },
  Pluto: { jp: '冥王星', icon: 'pluto' },
};

const SIGN_ICON = {
  牡羊座: 'aries',
  牡牛座: 'taurus',
  双子座: 'gemini',
  蟹座: 'cancer',
  獅子座: 'leo',
  乙女座: 'virgo',
  天秤座: 'libra',
  蠍座: 'scorpio',
  射手座: 'sagittarius',
  山羊座: 'capricorn',
  水瓶座: 'aquarius',
  魚座: 'pisces',
};

// ディグニティ簡易マッピング（伝統7天体 + モダンルーラー）
// 優先度: domicile > exaltation > detriment > fall > none
const DIGNITY_MAP = {
  太陽: {
    獅子座: 'domicile',
    牡羊座: 'exaltation',
    水瓶座: 'detriment',
    天秤座: 'fall',
  },
  月: {
    蟹座: 'domicile',
    牡牛座: 'exaltation',
    山羊座: 'detriment',
    蠍座: 'fall',
  },
  水星: {
    双子座: 'domicile',
    乙女座: 'domicile',
    射手座: 'detriment',
    魚座: 'detriment', // detrimentとfallの両方だが、detriment優先
  },
  金星: {
    牡牛座: 'domicile',
    天秤座: 'domicile',
    魚座: 'exaltation',
    牡羊座: 'detriment',
    蠍座: 'detriment',
    乙女座: 'fall',
  },
  火星: {
    牡羊座: 'domicile',
    蠍座: 'domicile',
    山羊座: 'exaltation',
    天秤座: 'detriment',
    牡牛座: 'detriment',
    蟹座: 'fall',
  },
  木星: {
    射手座: 'domicile',
    魚座: 'domicile',
    蟹座: 'exaltation',
    双子座: 'detriment',
    乙女座: 'detriment',
    山羊座: 'fall',
  },
  土星: {
    山羊座: 'domicile',
    水瓶座: 'domicile',
    天秤座: 'exaltation',
    蟹座: 'detriment',
    獅子座: 'detriment',
    牡羊座: 'fall',
  },
  // モダンルーラーシップ
  天王星: {
    水瓶座: 'domicile',
    獅子座: 'detriment',
  },
  海王星: {
    魚座: 'domicile',
    乙女座: 'detriment',
  },
  冥王星: {
    蠍座: 'domicile',
    牡牛座: 'detriment',
  },
};

const DIGNITY_LABELS = {
  domicile: 'Domicile',
  exaltation: 'Exaltation',
  detriment: 'Detriment',
  fall: 'Fall',
};

function getDignity(jpPlanetName, sign) {
  const map = DIGNITY_MAP[jpPlanetName];
  if (!map || !sign) return 'none';
  return map[sign] || 'none';
}

function getUtcMs(utcString) {
  if (!utcString) return null;
  const ms = Date.parse(utcString);
  return Number.isNaN(ms) ? null : ms;
}

function getJstDate(utcString) {
  const utcMs = getUtcMs(utcString);
  if (utcMs === null) return null;
  return new Date(utcMs + JST_OFFSET_MS);
}

function formatJst(utcString) {
  const d = getJstDate(utcString);
  if (!d) return 'none';
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const week = WEEK_JA[d.getUTCDay()];
  const hour = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${month}月${day}日(${week}) ${hour}:${min}`;
}

function formatJstYmdHm(utcString) {
  const d = getJstDate(utcString);
  if (!d) return '----/--/-- --:--';
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hour = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${min} JST`;
}

function formatDegree(degreeInSign) {
  const raw = typeof degreeInSign === 'number' ? degreeInSign : Number(degreeInSign);
  if (!Number.isFinite(raw)) return '--°--\'';

  let degree = Math.floor(raw);
  let minutes = Math.round((raw - degree) * 60);
  if (minutes >= 60) {
    degree += 1;
    minutes = 0;
  }
  return `${String(degree).padStart(2, '0')}°${String(minutes).padStart(2, '0')}'`;
}

function updateIconClass(element, baseClass, iconName) {
  if (!element || !iconName) return;
  const keep = [baseClass];
  element.className = keep.join(' ');
  element.classList.add(`icon-${iconName}`);
}

function setStatusIcon(card, status) {
  const icon = card.querySelector('.status_ico');
  if (!icon) return;
  icon.src = `./src/images/icons/status/status-${status}.png`;
  icon.alt = `status ${status}`;
}

function setText(container, selector, text) {
  const el = container.querySelector(selector);
  if (el) el.textContent = text;
}

function findNext(list, predicate, fromMs) {
  if (!Array.isArray(list)) return null;
  for (const item of list) {
    const utcMs = getUtcMs(item.utc || item.startUtc || item.endUtc);
    if (utcMs === null || utcMs < fromMs) continue;
    if (predicate(item)) return item;
  }
  return null;
}

function getPlanetEvents(schedule, jpPlanetName) {
  const events = Array.isArray(schedule?.planetEvents)
    ? schedule.planetEvents.filter((event) => event.planet === jpPlanetName)
    : [];
  return events.sort((a, b) => (getUtcMs(a.utc) || 0) - (getUtcMs(b.utc) || 0));
}

function findNextEventByType(events, type, fromMs) {
  return findNext(events, (event) => event.type === type, fromMs);
}

function pickStatus(planet, events, nowMs) {
  if (!planet) return 'notice';

  // 負のファクターをカウント
  let negatives = 0;
  if (planet.retrograde) negatives++;
  const dignity = getDignity(planet.name, planet.sign);
  if (dignity === 'detriment' || dignity === 'fall') negatives++;

  if (negatives >= 2) return 'caution';  // 赤: 二重苦
  if (negatives >= 1) return 'notice';   // 黄: 逆行 or 悪いディグニティ

  // 7日以内にイベントあり → 黄
  const nearest = findNext(events, () => true, nowMs);
  if (nearest) {
    const diffHours = ((getUtcMs(nearest.utc) || nowMs) - nowMs) / (1000 * 60 * 60);
    if (diffHours <= 24 * 7) return 'notice';
  }

  return 'ok';
}

function updateDignityLabel(card, jpPlanetName, sign) {
  const dignityEl = card.querySelector('.dignity_label');
  if (!dignityEl) return;

  const dignity = getDignity(jpPlanetName, sign);
  // クラスをリセットしてから新しいディグニティクラスを付与
  dignityEl.classList.remove('domicile', 'exaltation', 'detriment', 'fall', 'none');
  dignityEl.classList.add(dignity);
  dignityEl.textContent = DIGNITY_LABELS[dignity] || '';
}

function renderMoonDetails(card, current, schedule, nowMs) {
  const fullMoon = findNext(
    schedule?.lunarPhases,
    (phase) => phase.type === 'full_moon',
    nowMs
  );
  const eclipse = findNext(
    schedule?.lunarPhases,
    (phase) => Boolean(phase.eclipse),
    nowMs
  );
  const nextVoid = findNext(
    current?.upcomingVoids,
    () => true,
    nowMs
  );

  setText(
    card,
    '.moon_phase data',
    fullMoon ? `${formatJst(fullMoon.utc)} ${fullMoon.moonSign}` : 'none'
  );

  if (current?.void?.isVoid) {
    const voidItem = card.querySelector('.detail_item.void');
    if (voidItem) voidItem.classList.add('is-void');//void中はliエレメントに装飾
    const endsAt = current.void.endsAt ? formatJst(current.void.endsAt) : '終了時刻未定';
    setText(card, '.void data', `ボイド中 (${current.void.moonSign}) / 終了 ${endsAt}`);
  } else {
    const voidItem = card.querySelector('.detail_item.void');
    if (voidItem) voidItem.classList.remove('is-void');
    setText(card, '.void data', 'void  is none');
  }

  if (eclipse) {
    setText(
      card,
      '.eclipse data',
      `${eclipse.label} (${eclipse.eclipse.label}) ${formatJst(eclipse.utc)}`
    );
  } else {
    setText(card, '.eclipse data', 'none');
  }

  if (nextVoid) {
    const start = formatJst(nextVoid.startUtc);
    const end = formatJst(nextVoid.endUtc);
    const suffix = nextVoid.startedBeforeRangeStart ? ' (継続中)' : '';
    setText(card, '.nextvoid data', `${start} 〜 ${end}${suffix}`);
  } else {
    setText(card, '.nextvoid data', 'none');
  }

  if (current?.void?.isVoid) {
    setStatusIcon(card, 'caution');
  } else if (eclipse && ((getUtcMs(eclipse.utc) || nowMs) - nowMs) <= 24 * 7 * 60 * 60 * 1000) {
    setStatusIcon(card, 'notice');
  } else {
    setStatusIcon(card, 'ok');
  }
}

function renderPlanetDetails(card, planet, events, nowMs) {
  const retroTerm = card.querySelector('.retrograde_term');
  const retroTermTitle = retroTerm?.querySelector('h4');
  const retroTermData = retroTerm?.querySelector('data');

  // 逆行度数表示（.retrograde_deg）
  const retroDeg = card.querySelector('.retrograde_deg');
  const retroDegTitle = retroDeg?.querySelector('h4');
  const retroDegData = retroDeg?.querySelector('data');

  // イングレス（半年以内ルール）
  const ingressItem = card.querySelector('.ingress');
  const ingressData = ingressItem?.querySelector('data');
  const nextIngress = findNextEventByType(events, 'ingress', nowMs);

  if (ingressItem) {
    if (nextIngress) {
      const ingressMs = getUtcMs(nextIngress.utc) || 0;
      if (ingressMs - nowMs > SIX_MONTHS_MS) {
        ingressItem.style.display = 'none';
      } else {
        ingressItem.style.display = '';
        if (ingressData) {
          ingressData.textContent = `${formatJst(nextIngress.utc)} → ${nextIngress.toSign}`;
        }
      }
    } else {
      ingressItem.style.display = 'none';
    }
  }

  // 逆行関連のイベント取得
  const nextRetroStart = findNextEventByType(events, 'station_retrograde', nowMs);
  const nextRetroEnd = nextRetroStart
    ? findNextEventByType(events, 'station_direct', (getUtcMs(nextRetroStart.utc) || nowMs) + 1)
    : null;

  if (planet?.retrograde) {
    // 逆行中: 終了日時のみ表示
    const nextDirect = findNextEventByType(events, 'station_direct', nowMs);
    if (retroTermTitle) retroTermTitle.textContent = '逆行終了';
    if (retroTermData) retroTermData.textContent = nextDirect ? formatJst(nextDirect.utc) : 'none';

    // 逆行度数: 現在の逆行期間の開始度数〜終了度数
    if (retroDeg) {
      const allRetroStarts = events.filter((e) => e.type === 'station_retrograde');
      const currentRetroStart = allRetroStarts
        .filter((e) => (getUtcMs(e.utc) || 0) <= nowMs)
        .pop();
      if (currentRetroStart && nextDirect) {
        retroDeg.style.display = '';
        if (retroDegData) {
          const startDeg = formatDegree(currentRetroStart.degreeInSign);
          const endDeg = formatDegree(nextDirect.degreeInSign);
          retroDegData.textContent = `${startDeg} ${currentRetroStart.sign || ''} 〜 ${endDeg} ${nextDirect.sign || ''}`;
        }
      } else {
        retroDeg.style.display = 'none';
      }
    }
  } else {
    // 順行中: 次回の逆行予定を開始〜終了の期間で表示
    if (retroTermTitle) retroTermTitle.textContent = '次回の逆行予定';
    if (retroTermData) {
      if (nextRetroStart && nextRetroEnd) {
        retroTermData.textContent = `${formatJst(nextRetroStart.utc)} 〜 ${formatJst(nextRetroEnd.utc)}`;
      } else if (nextRetroStart) {
        retroTermData.textContent = `${formatJst(nextRetroStart.utc)} 〜`;
      } else {
        retroTermData.textContent = 'none';
      }
    }

    // 逆行度数: 次回の逆行データが揃っている場合のみ表示
    if (retroDeg) {
      if (nextRetroStart && nextRetroEnd) {
        retroDeg.style.display = '';
        if (retroDegData) {
          const startDeg = formatDegree(nextRetroStart.degreeInSign);
          const endDeg = formatDegree(nextRetroEnd.degreeInSign);
          retroDegData.textContent = `${startDeg} ${nextRetroStart.sign || ''} 〜 ${endDeg} ${nextRetroEnd.sign || ''}`;
        }
      } else {
        retroDeg.style.display = 'none';
      }
    }
  }

  setStatusIcon(card, pickStatus(planet, events, nowMs));
}

function render(current, schedule) {
  const nowMs = getUtcMs(current?.generatedAt) || Date.now();
  const updateEl = document.querySelector('.yyyymmdd');
  if (updateEl) {
    updateEl.textContent = formatJstYmdHm(current?.generatedAt);
  }

  const currentPlanets = Array.isArray(current?.planets) ? current.planets : [];
  const cards = Array.from(document.querySelectorAll('.planets_item'));

  cards.forEach((card) => {
    const nameEl = card.querySelector('.planets');
    if (!nameEl) return;

    const enName = nameEl.textContent.trim();
    const meta = PLANET_META[enName];
    if (!meta) return;

    updateIconClass(nameEl, 'planets', meta.icon);
    nameEl.setAttribute('aria-label', meta.icon);

    const planet = currentPlanets.find((item) => item.name === meta.jp);
    const zodiacEl = card.querySelector('.zodiac');
    if (planet && zodiacEl) {
      const icon = SIGN_ICON[planet.sign];
      if (icon) {
        updateIconClass(zodiacEl, 'zodiac', icon);
        zodiacEl.setAttribute('aria-label', icon);
      }
      zodiacEl.textContent = formatDegree(planet.degreeInSign);
      zodiacEl.title = planet.sign;
    }

    // ディグニティ表示を更新
    if (planet) {
      updateDignityLabel(card, meta.jp, planet.sign);
    }

    // 逆行表示（月・太陽にはprogress_statusがないのでスキップされる）
    const progressEl = card.querySelector('.progress_status');
    if (progressEl) {
      if (planet?.retrograde) {
        progressEl.classList.remove('prograde');
        progressEl.classList.add('retrograde');
        progressEl.textContent = 'R';
      } else {
        progressEl.classList.remove('retrograde');
        progressEl.classList.add('prograde');
        progressEl.textContent = '';
      }
    }

    // 月カード
    if (enName === 'Moon') {
      renderMoonDetails(card, current, schedule, nowMs);
      return;
    }

    // 太陽カード（detail_listなし、ステータスアイコンのみ）
    if (enName === 'Sun') {
      setStatusIcon(card, 'ok');
      return;
    }

    // その他の天体
    const events = getPlanetEvents(schedule, meta.jp);
    renderPlanetDetails(card, planet, events, nowMs);
  });
}

async function loadData() {
  try {
    const [currentRes, scheduleRes] = await Promise.all([
      fetch('data/current.json'),
      fetch('data/schedule.json'),
    ]);

    if (!currentRes.ok || !scheduleRes.ok) {
      throw new Error(`HTTP error: current=${currentRes.status}, schedule=${scheduleRes.status}`);
    }

    const current = await currentRes.json();
    const schedule = await scheduleRes.json();
    render(current, schedule);
  } catch (error) {
    const updateEl = document.querySelector('.yyyymmdd');
    if (updateEl) {
      updateEl.textContent = 'data load failed';
    }
    console.error(error);
  }
}

// ── Service Worker 登録 & push通知購読 ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(() => initPushSubscription())
    .catch((err) => {
      console.warn('SW registration failed:', err);
    });
}

initLuckyEffects();
loadData();
