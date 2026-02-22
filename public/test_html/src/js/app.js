const TZ_OFFSET = 9; // JST
const TZ_OFFSET_MS = TZ_OFFSET * 60 * 60 * 1000;

function getJstDate(utcStr) {
  if (!utcStr) return null;
  const utcMs = Date.parse(utcStr);
  if (Number.isNaN(utcMs)) return null;
  return new Date(utcMs + TZ_OFFSET_MS);
}

function toJst(utcStr) {
  const d = getJstDate(utcStr);
  if (!d) return '-';
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${m}/${day} ${h}:${min}`;
}

function toJstDate(utcStr) {
  const d = getJstDate(utcStr);
  if (!d) return '-';
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCFullYear()}/${m}/${day} ${h}:${min} JST`;
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

    renderCurrent(current);
    renderSchedule(schedule);
  } catch (err) {
    document.getElementById('generatedAt').textContent = 'データの読み込みに失敗しました';
    document.getElementById('generatedAt').classList.add('error');
    console.error(err);
  }
}

function renderCurrent(data) {
  // 生成時刻
  document.getElementById('generatedAt').textContent =
    `Last updated: ${toJstDate(data.generatedAt)}`;

  // 天体リスト
  const list = document.getElementById('planetList');
  list.innerHTML = data.planets.map(p => {
    const retro = p.retrograde ? '<span class="planet-retro">Rx</span>' : '';
    return `<li class="planet-item">
          <span class="planet-name">${p.name}</span>
          <span class="planet-sign">${p.sign}</span>
          <span class="planet-degree">${p.degreeInSign.toFixed(2)}°</span>
          ${retro}
        </li>`;
  }).join('');

  // ボイドステータス
  const voidEl = document.getElementById('voidStatus');
  if (data.void.isVoid) {
    voidEl.className = 'void-status void-active';
    voidEl.innerHTML = `VOID — ${data.void.moonSign}<br>
          <span style="font-size:0.8rem">終了: ${toJst(data.void.endsAt)}</span>`;
  } else {
    voidEl.className = 'void-status void-inactive';
    voidEl.textContent = `NO VOID — 月: ${data.void.moonSign}`;
  }

  // 直近ボイド
  const voidsEl = document.getElementById('upcomingVoids');
  if (data.upcomingVoids.length === 0) {
    voidsEl.textContent = '直近48時間のボイドなし';
  } else {
    voidsEl.innerHTML = data.upcomingVoids.map(v =>
      `<div class="void-upcoming">
            ${v.startedBeforeRangeStart ? '<span style="color:#fbbf24">継続中</span> ' : ''}
            ${toJst(v.startUtc)} - ${toJst(v.endUtc)}
            <span style="color:#64748b">(${v.durationHours}h)</span>
            ${v.moonSign}
          </div>`
    ).join('');
  }
}

function renderSchedule(data) {
  // 月相
  const phasesEl = document.getElementById('lunarPhases');
  phasesEl.innerHTML = data.lunarPhases.map(p => {
    const eclipseBadge = p.eclipse
      ? ` <span class="eclipse-badge">${p.eclipse.label}</span>`
      : '';
    return `<div class="event-item">
          <span class="event-date">${toJst(p.utc)}</span>
          <span class="event-label">${p.label}</span>
          ${p.moonSign}${eclipseBadge}
        </div>`;
  }).join('');

  // 天体イベント
  const eventsEl = document.getElementById('planetEvents');
  eventsEl.innerHTML = data.planetEvents.map(e => {
    let label = '';
    if (e.type === 'station_retrograde') {
      label = `<span class="station-retro">${e.planet} 逆行開始</span> ${e.sign} ${e.degreeInSign}°`;
    } else if (e.type === 'station_direct') {
      label = `<span class="station-direct">${e.planet} 順行復帰</span> ${e.sign} ${e.degreeInSign}°`;
    } else if (e.type === 'ingress') {
      const retro = e.retrograde ? ' (Rx)' : '';
      label = `<span class="ingress-label">${e.planet}</span> ${e.fromSign} → ${e.toSign}${retro}`;
    }
    return `<div class="event-item">
          <span class="event-date">${toJst(e.utc)}</span>
          ${label}
        </div>`;
  }).join('');
}

loadData();