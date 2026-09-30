# Hoppy Road

A Crossy Road–style endless hopper that runs in the browser. It works on iPhone
(and Android) with touch controls and on computers with the keyboard.

Hop forward across grass, roads, rivers and train tracks. How far can you get?

## How to play

| | iPhone / touch | Computer |
|---|---|---|
| Hop forward | Tap anywhere | `↑` / `W` / `Space` |
| Hop left / right / back | Swipe in that direction | `←` `→` `↓` / `A` `D` `S` |
| Pause | ❚❚ button | `Esc` / `P` |
| Play again | Button | `Enter` / `Space` |

- **Roads**: don't get hit by cars and trucks.
- **Rivers**: ride the logs and hop across lily pads. Don't fall in, and don't
  let a log carry you off the edge.
- **Train tracks**: when the signal flashes and the bell rings, a train is coming.
- **Don't dawdle**: the camera keeps creeping forward. Fall too far behind and
  an eagle grabs you.
- **Coins**: pick them up to unlock more characters (Frog, Pig, Penguin, Fox,
  Robot and Unicorn).

## Playing with friends

- **Challenge friends**: after a run, tap *Challenge friends*. It shares a link
  (via the iPhone share sheet, or copies it on a computer) that opens the
  **exact same map** with your score to beat.
- **Daily map**: tap *🎲 Random map* on the start screen to switch to
  *📅 Daily map*. Everyone gets the same map that day, so you can compare scores.
- **Pass the phone**: enter a name on the start screen. The 🏆 button shows the
  top 10 scores on that device.

Everything is saved on the device (best score, coins, unlocked characters); there
are no accounts and no server.

## Run it on your computer

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```

Open the `Local` address it prints (for example http://localhost:5173).

To try it on your iPhone during development, make sure the phone is on the same
Wi-Fi network and open the `Network` address it prints (for example
http://192.168.1.20:5173) in Safari.

## Put it online (free, with GitHub Pages)

This repository includes a workflow (`.github/workflows/deploy.yml`) that builds
the game and publishes it whenever you push to the `main` branch.

1. On GitHub, open the repository's **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push (or merge) to `main`. The *Actions* tab shows the deploy; when it finishes
   the game is live at `https://<your-username>.github.io/<repo-name>/`.
4. Send that link to your friends.

The build is plain static files in `dist/`, so it also works on Netlify, Vercel,
Cloudflare Pages, or any web host: run `npm run build` and upload `dist/`.

### Add it to your iPhone home screen

Open the game in Safari, tap **Share → Add to Home Screen**. It then opens full
screen like an app and works offline after the first visit.

## Make it your own

| What | Where |
|---|---|
| Game name | `GAME_TITLE` in `src/config.js` (and the `<title>` in `index.html`, `public/manifest.webmanifest`) |
| Characters (colours, shapes, prices) | `src/characters.js` — each is a list of coloured boxes |
| Difficulty, hop speed, eagle timing | `src/config.js`, and `difficulty()` / `planChunk()` in `src/world.js` |
| Cars, trucks, trees, trains, logs | `src/models.js` |
| Sound effects | `src/audio.js` (generated in code, no audio files) |

## Project layout

```
index.html            page + menus
public/               icons, web app manifest, offline service worker
src/main.js           menus, scores, sharing, wiring everything together
src/game.js           game loop, camera, player movement, collisions, deaths
src/world.js          endless lane generation (grass, road, river, rail)
src/models.js         voxel models (built from coloured boxes)
src/characters.js     playable characters
src/input.js          keyboard, tap and swipe controls
src/audio.js          synthesised sound effects
src/storage.js        saving to the device
src/rng.js            seeded random numbers (same seed = same map)
```

Built with [three.js](https://threejs.org) and [Vite](https://vite.dev).
This is a fan-made game for fun and is not affiliated with Crossy Road or
Hipster Whale.
