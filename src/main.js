import './style.css';
import { Game } from './game.js';
import { setupInput } from './input.js';
import { unlockAudio, setMuted, sfx } from './audio.js';
import { CHARACTERS } from './characters.js';
import { save, persist, recordScore } from './storage.js';
import { randomSeed, dailySeed, todayKey } from './rng.js';
import { GAME_TITLE } from './config.js';

const $ = (id) => document.getElementById(id);
const ui = {
  score: $('score'),
  best: $('best'),
  coins: $('coins'),
  pauseBtn: $('pause-btn'),
  banner: $('challenge-banner'),
  startBanner: $('start-banner'),
  start: $('start'),
  logo: $('logo'),
  hint: $('hint'),
  charName: $('char-name'),
  unlockBtn: $('unlock-btn'),
  prevChar: $('prev-char'),
  nextChar: $('next-char'),
  modeBtn: $('mode-btn'),
  scoresBtn: $('scores-btn'),
  soundBtn: $('sound-btn'),
  nameInput: $('name-input'),
  gameover: $('gameover'),
  goCause: $('go-cause'),
  goScore: $('go-score'),
  goBest: $('go-best'),
  goChallenge: $('go-challenge'),
  goCoins: $('go-coins'),
  goBoard: $('go-board'),
  againBtn: $('again-btn'),
  shareBtn: $('share-btn'),
  menuBtn: $('menu-btn'),
  paused: $('paused'),
  resumeBtn: $('resume-btn'),
  quitBtn: $('quit-btn'),
  scores: $('scores'),
  scoresBoard: $('scores-board'),
  scoresClose: $('scores-close'),
  toast: $('toast'),
};

const CAUSES = {
  car: 'Squashed!',
  train: 'Train wreck!',
  water: 'Splash!',
  eagle: 'Eagle snack!',
};

const touch = matchMedia('(pointer: coarse)').matches;
ui.logo.innerHTML = GAME_TITLE.split(' ')
  .map((w) => `<span>${escapeHtml(w)}</span>`)
  .join('');
ui.hint.textContent = touch ? 'Tap to hop · Swipe to turn' : 'Press ↑ or W to hop';
document.title = GAME_TITLE;

// ---------------------------------------------------------------- challenge

// A challenge link looks like ?seed=123&score=42&by=Sam: same map, beat the score.
const params = new URLSearchParams(location.search);
let challenge = null;
if (/^\d+$/.test(params.get('seed') || '')) {
  challenge = {
    seed: Number(params.get('seed')) >>> 0,
    score: Math.max(0, parseInt(params.get('score'), 10) || 0),
    by: (params.get('by') || 'A friend').slice(0, 14),
  };
}

// ---------------------------------------------------------------- state

const savedIndex = () => Math.max(0, CHARACTERS.findIndex((c) => c.id === save.character));
let previewIndex = savedIndex();
let lastRun = null;
let overAt = 0;

const game = new Game($('game'), {
  onStart() {
    ui.start.hidden = true;
    ui.pauseBtn.hidden = false;
    ui.banner.hidden = !ui.banner.textContent;
  },
  onScore(score) {
    ui.score.textContent = score;
  },
  onCoin(runCoins) {
    ui.coins.textContent = save.coins + runCoins;
  },
  onGameOver(result) {
    showGameOver(result);
  },
});

function currentMode() {
  return challenge ? 'challenge' : save.mode;
}

function seedForRun() {
  if (challenge) return challenge.seed;
  if (save.mode === 'daily') return dailySeed();
  return randomSeed();
}

function modeBest() {
  if (currentMode() === 'daily') return save.daily.date === todayKey() ? save.daily.best : 0;
  return save.best;
}

function refreshHud() {
  ui.best.textContent = challenge ? `BEAT ${challenge.score}` : `TOP ${modeBest()}`;
  ui.coins.textContent = save.coins;
  ui.score.textContent = 0;
}

// Shown under the logo on the title screen, and at the top while playing.
function refreshBanner() {
  let msg = '';
  if (challenge) msg = `⚔️ Beat ${challenge.by}'s ${challenge.score} on this map!`;
  else if (save.mode === 'daily') msg = '📅 Daily map: same map for everyone today';
  ui.banner.textContent = msg;
  ui.startBanner.textContent = msg;
  ui.startBanner.hidden = !msg;
  ui.banner.hidden = true;
}

function refreshMenu() {
  const c = CHARACTERS[previewIndex];
  const unlocked = save.unlocked.includes(c.id);
  ui.charName.textContent = unlocked ? c.name : `🔒 ${c.name}`;
  ui.unlockBtn.hidden = unlocked;
  if (!unlocked) {
    const canAfford = save.coins >= c.cost;
    ui.unlockBtn.disabled = !canAfford;
    ui.unlockBtn.textContent = canAfford ? `Unlock · ${c.cost} coins` : `Needs ${c.cost} coins`;
  }
  ui.modeBtn.textContent =
    currentMode() === 'challenge' ? '⚔️ Challenge ✕' : save.mode === 'daily' ? '📅 Daily map' : '🎲 Random map';
  ui.soundBtn.textContent = save.muted ? '🔇' : '🔊';
  game.setCharacter(c.id, !unlocked);
}

// Put the character in the empty space between the logo and the menu.
function placeReadyPlayer() {
  if (ui.start.hidden) return;
  const top = ui.logo.parentElement.getBoundingClientRect().bottom;
  const bottom = ui.start.querySelector('.start-bottom').getBoundingClientRect().top;
  game.setReadyFocus(((top + bottom) / 2 + 20) / window.innerHeight);
}
window.addEventListener('resize', placeReadyPlayer);

function newRun() {
  ui.gameover.hidden = true;
  ui.paused.hidden = true;
  ui.start.hidden = false;
  ui.pauseBtn.hidden = true;
  // Never start a run as a character you have not unlocked.
  if (!save.unlocked.includes(CHARACTERS[previewIndex].id)) {
    previewIndex = savedIndex();
  }
  refreshBanner();
  placeReadyPlayer();
  game.newRun(seedForRun());
  refreshMenu();
  refreshHud();
}

// ---------------------------------------------------------------- game over

function playerName() {
  return save.name.trim() || 'Player';
}

function showGameOver({ score, coins, cause, seed }) {
  const mode = currentMode();
  const prevBest = modeBest();
  const isBest = score > prevBest;
  save.coins += coins;
  if (mode === 'daily') {
    const key = todayKey();
    if (save.daily.date !== key) save.daily = { date: key, best: 0 };
    save.daily.best = Math.max(save.daily.best, score);
  } else if (mode === 'random') {
    save.best = Math.max(save.best, score);
  }
  const entry = { name: playerName(), score, char: game.characterId, mode, time: Date.now() };
  const rank = score > 0 ? recordScore(entry) : -1;
  persist();

  lastRun = { score, seed };
  ui.goCause.textContent = CAUSES[cause] || 'Game over';
  ui.goScore.textContent = score;
  ui.goBest.textContent = isBest && score > 0 ? 'NEW BEST!' : `Best ${Math.max(prevBest, score)}`;
  ui.goBest.classList.toggle('new', isBest && score > 0);
  ui.goCoins.textContent = coins ? `+${coins} coin${coins === 1 ? '' : 's'}` : '';
  ui.goCoins.hidden = !coins;

  if (challenge) {
    ui.goChallenge.hidden = false;
    const diff = challenge.score - score;
    ui.goChallenge.textContent =
      diff < 0
        ? `🎉 You beat ${challenge.by} by ${-diff}!`
        : diff === 0
          ? `🤝 Tied with ${challenge.by}!`
          : `${diff} more to beat ${challenge.by}`;
  } else {
    ui.goChallenge.hidden = true;
  }

  renderBoard(ui.goBoard, 5, rank);
  refreshHud();
  ui.score.textContent = score;
  ui.coins.textContent = save.coins;
  ui.pauseBtn.hidden = true;
  ui.gameover.hidden = false;
  overAt = performance.now();
}

function renderBoard(list, limit, highlight = -1) {
  list.innerHTML = '';
  const rows = save.scores.slice(0, limit);
  if (!rows.length) {
    list.innerHTML = '<li class="empty">No scores yet. Go hop!</li>';
    return;
  }
  const icons = { daily: '📅', challenge: '⚔️', random: '' };
  rows.forEach((s, i) => {
    const li = document.createElement('li');
    if (i === highlight) li.className = 'me';
    li.innerHTML =
      `<span class="rank">${i + 1}</span>` +
      `<span class="who">${escapeHtml(s.name)} ${icons[s.mode] || ''}</span>` +
      `<span class="pts">${s.score}</span>`;
    list.appendChild(li);
  });
}

async function share() {
  if (!lastRun) return;
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('seed', String(lastRun.seed));
  url.searchParams.set('score', String(lastRun.score));
  url.searchParams.set('by', playerName());
  const text = `I got ${lastRun.score} in ${GAME_TITLE}! Can you beat me on the same map?`;
  try {
    if (navigator.share) {
      await navigator.share({ title: GAME_TITLE, text, url: url.toString() });
      return;
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast('Challenge link copied! Send it to your friends.');
  } catch (err) {
    if (err?.name !== 'AbortError') toast(url.toString(), 6000);
  }
}

// ---------------------------------------------------------------- helpers

let toastTimer = 0;
function toast(msg, ms = 2200) {
  ui.toast.textContent = msg;
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (ui.toast.hidden = true), ms);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function tap(el, fn) {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    unlockAudio();
    sfx.click();
    fn(e);
  });
}

function pause(paused) {
  if (game.state !== 'playing') return;
  game.setPaused(paused);
  ui.paused.hidden = !paused;
}

// ---------------------------------------------------------------- wiring

tap(ui.prevChar, () => {
  previewIndex = (previewIndex - 1 + CHARACTERS.length) % CHARACTERS.length;
  selectPreview();
});
tap(ui.nextChar, () => {
  previewIndex = (previewIndex + 1) % CHARACTERS.length;
  selectPreview();
});

function selectPreview() {
  const c = CHARACTERS[previewIndex];
  if (save.unlocked.includes(c.id)) {
    save.character = c.id;
    persist();
  }
  refreshMenu();
}

tap(ui.unlockBtn, () => {
  const c = CHARACTERS[previewIndex];
  if (save.coins < c.cost || save.unlocked.includes(c.id)) return;
  save.coins -= c.cost;
  save.unlocked.push(c.id);
  save.character = c.id;
  persist();
  sfx.unlock();
  toast(`${c.name} unlocked!`);
  refreshMenu();
  refreshHud();
});

tap(ui.modeBtn, () => {
  if (challenge) {
    challenge = null;
    history.replaceState(null, '', location.pathname);
  } else {
    save.mode = save.mode === 'daily' ? 'random' : 'daily';
    persist();
  }
  newRun();
});

tap(ui.soundBtn, () => {
  save.muted = !save.muted;
  setMuted(save.muted);
  persist();
  refreshMenu();
});

tap(ui.scoresBtn, () => {
  renderBoard(ui.scoresBoard, 10);
  ui.scores.hidden = false;
});
tap(ui.scoresClose, () => (ui.scores.hidden = true));

ui.nameInput.value = save.name;
ui.nameInput.addEventListener('input', () => {
  save.name = ui.nameInput.value.slice(0, 14);
  persist();
});
ui.nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') ui.nameInput.blur();
});

tap(ui.againBtn, newRun);
tap(ui.menuBtn, newRun);
tap(ui.shareBtn, share);
tap(ui.pauseBtn, () => pause(true));
tap(ui.resumeBtn, () => pause(false));
tap(ui.quitBtn, () => {
  game.setPaused(false);
  newRun();
});

setupInput($('game'), {
  enabled: () => game.state === 'ready' || game.state === 'playing',
  onAnyInput: () => {
    unlockAudio();
    if (document.activeElement === ui.nameInput) ui.nameInput.blur();
  },
  onMove: (dir) => {
    if (game.state === 'ready' && !save.unlocked.includes(CHARACTERS[previewIndex].id)) {
      // Previewing a locked character: fall back to your chosen one.
      previewIndex = savedIndex();
      refreshMenu();
    }
    if (!ui.scores.hidden) return;
    game.move(dir);
  },
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (game.state === 'over' && (e.code === 'Enter' || e.code === 'Space') && performance.now() - overAt > 500) {
    e.preventDefault();
    newRun();
  } else if (e.code === 'Escape' || e.code === 'KeyP') {
    pause(!game.paused);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause(true);
});

setMuted(save.muted);
newRun();

// Offline support + "Add to Home Screen" on iPhone.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// Handy for debugging in the browser console while developing.
if (import.meta.env.DEV) window.__game = game;
