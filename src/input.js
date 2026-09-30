// Keyboard (arrows / WASD) on computers; tap and swipe on phones.
//   tap anywhere -> hop forward
//   swipe        -> hop in that direction (fires as soon as the swipe is
//                   recognised, without waiting for the finger to lift)

const KEYS = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'up',
};

const SWIPE_PX = 24;
const TAP_MS = 400;

export function setupInput(surface, { onMove, onAnyInput, enabled }) {
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const dir = KEYS[e.code];
    if (!dir) return;
    e.preventDefault();
    if (e.repeat || !enabled()) return;
    onAnyInput?.();
    onMove(dir);
  });

  let start = null;

  surface.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return;
    onAnyInput?.();
    start = { x: e.clientX, y: e.clientY, t: performance.now(), fired: false };
  });

  surface.addEventListener('pointermove', (e) => {
    if (!start || start.fired || !e.isPrimary) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) < SWIPE_PX) return;
    start.fired = true;
    if (!enabled()) return;
    if (Math.abs(dx) > Math.abs(dy)) onMove(dx > 0 ? 'right' : 'left');
    else onMove(dy > 0 ? 'down' : 'up');
  });

  const end = (e) => {
    if (!start || !e.isPrimary) return;
    // iPhone only allows sound to start on finger-up, not finger-down.
    onAnyInput?.();
    const s = start;
    start = null;
    if (s.fired || e.type === 'pointercancel') return;
    if (performance.now() - s.t < TAP_MS && enabled()) onMove('up');
  };
  surface.addEventListener('pointerup', end);
  surface.addEventListener('pointercancel', end);

  // Stop iOS from scrolling, zooming or showing the magnifier while playing.
  surface.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
}
