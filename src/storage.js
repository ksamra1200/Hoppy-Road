// Everything is saved on the device in localStorage (best score, coins,
// unlocked characters, the local leaderboard). No account or server needed.

const KEY = 'hoppy-road:v1';

const defaults = () => ({
  best: 0,
  coins: 0,
  unlocked: ['chicken'],
  character: 'chicken',
  name: '',
  muted: false,
  mode: 'random',
  daily: { date: '', best: 0 },
  scores: [],
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    // Private mode or blocked storage: just play without saving.
  }
  return defaults();
}

export const save = load();

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Ignore: the game still works, it just won't remember.
  }
}

// Keep the ten best runs on this device (great for passing a phone around).
export function recordScore(entry) {
  save.scores.push(entry);
  save.scores.sort((a, b) => b.score - a.score || a.time - b.time);
  save.scores = save.scores.slice(0, 10);
  persist();
  return save.scores.indexOf(entry);
}
