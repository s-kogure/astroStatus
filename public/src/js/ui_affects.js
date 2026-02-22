function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function playTwinkle(star) {
  star.animate(
    [
      { opacity: 1, filter: 'drop-shadow(0 0 0 rgba(255, 255, 255, 0))' },
      { opacity: 0.4, filter: 'drop-shadow(0 0 6px rgba(255, 255, 255, 0.8))' },
      { opacity: 1, filter: 'drop-shadow(0 0 0 rgba(255, 255, 255, 0))' },
    ],
    {
      duration: 1200,
      easing: 'ease-in-out',
      iterations: 1,
    }
  );
}

function playSpin(star) {
  const base = getComputedStyle(star).transform;
  const start = base === 'none' ? 'translateZ(0)' : base;

  star.animate(
    [
      { transform: start },
      { transform: `${start} rotate(210deg)` },
      { transform: start },
    ],
    {
      duration: 1400,
      easing: 'ease-in-out',
      iterations: 1,
    }
  );
}

function runLuckyLoop(stars) {
  const delay = randomInt(12000, 26000);
  window.setTimeout(() => {
    const star = stars[randomInt(0, stars.length - 1)];
    if (Math.random() < 0.7) {
      playTwinkle(star);
    } else {
      playSpin(star);
    }
    runLuckyLoop(stars);
  }, delay);
}

export function initLuckyEffects() {
  const stars = Array.from(document.querySelectorAll('.background_effects .bg_star'));
  if (stars.length === 0) return;
  runLuckyLoop(stars);
}
