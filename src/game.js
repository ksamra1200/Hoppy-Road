import * as THREE from 'three';
import { World } from './world.js';
import { voxels, voxelMesh, createEagle } from './models.js';
import { getCharacter } from './characters.js';
import { sfx } from './audio.js';
import { HOP_TIME, MIN_X, MAX_X, EAGLE_DISTANCE, CAMERA_CREEP } from './config.js';

const DIRS = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] };
const FACING = { up: 0, down: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };

// Camera sits up and behind the player, turned slightly so lanes run at an angle.
const CAM_OFFSET = new THREE.Vector3(2.2, 14, 8.5);
const SUN_OFFSET = new THREE.Vector3(-8, 14, 2);
const PLAYER_HALF_WIDTH = 0.28;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Little cubes for feathers and splashes.
class Particles {
  constructor(scene) {
    this.items = [];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 40; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial());
      mesh.visible = false;
      scene.add(mesh);
      this.items.push({ mesh, life: 0, v: new THREE.Vector3() });
    }
  }
  burst(pos, count, colors, { speed = 3, up = 4, size = 0.12, life = 0.8 } = {}) {
    let n = 0;
    for (const p of this.items) {
      if (p.life > 0) continue;
      if (n++ >= count) break;
      p.life = life * (0.7 + Math.random() * 0.6);
      p.mesh.visible = true;
      p.mesh.position.copy(pos);
      p.mesh.scale.setScalar(size * (0.6 + Math.random() * 0.8));
      p.mesh.material.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      p.v.set(Math.cos(a) * s, up * (0.5 + Math.random() * 0.8), Math.sin(a) * s);
    }
  }
  update(dt) {
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.v.y -= 14 * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      p.mesh.rotation.x += dt * 8;
      p.mesh.rotation.z += dt * 6;
      if (p.life <= 0) p.mesh.visible = false;
    }
  }
  clear() {
    for (const p of this.items) {
      p.life = 0;
      p.mesh.visible = false;
    }
  }
}

export class Game {
  constructor(canvas, callbacks = {}) {
    this.cb = callbacks;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7fb23a);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.copy(CAM_OFFSET);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa9c8, 1.75));
    this.sun = new THREE.DirectionalLight(0xfff6e8, 1.7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    // Player: root holds position, body holds facing + squash/stretch.
    this.playerRoot = new THREE.Group();
    this.playerBody = new THREE.Group();
    this.playerRoot.add(this.playerBody);
    this.scene.add(this.playerRoot);
    this.lockedMaterial = new THREE.MeshLambertMaterial({ color: 0x2a2d36 });

    this.eagle = createEagle();
    this.eagle.visible = false;
    this.scene.add(this.eagle);

    this.particles = new Particles(this.scene);

    this.state = 'ready';
    this.paused = false;
    this.time = 0;
    this.lookAhead = 3;
    this.look = 0;
    this.readyFocus = 0.5;
    this.characterId = null;
    this.world = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());

    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------- setup

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    // Show about 10 columns in portrait, and a fixed height in landscape.
    let halfH = 5.8;
    let halfW = halfH * aspect;
    if (halfW < 4.9) {
      halfW = 4.9;
      halfH = halfW / aspect;
    }
    if (halfW > 14) {
      halfW = 14;
      halfH = halfW / aspect;
    }
    Object.assign(this.camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
    this.camera.updateProjectionMatrix();

    // How many rows fit on screen, and put the player in the lower part.
    const elevation = Math.atan2(CAM_OFFSET.y, Math.hypot(CAM_OFFSET.x, CAM_OFFSET.z));
    const visibleRows = (halfH * 2) / Math.sin(elevation);
    this.lookAhead = visibleRows * 0.14;
    this.halfH = halfH;
    this.rowsPerUnit = 1 / Math.sin(elevation);

    const s = Math.max(halfW, visibleRows / 2) + 4;
    const sc = this.sun.shadow.camera;
    Object.assign(sc, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 60 });
    sc.updateProjectionMatrix();
  }

  setCharacter(id, locked = false) {
    const character = getCharacter(id);
    if (this.playerMesh) {
      this.playerBody.remove(this.playerMesh);
      this.playerMesh.geometry.dispose();
    }
    this.characterId = character.id;
    this.playerMesh = voxelMesh(voxels(character.parts), { cast: true });
    if (locked) this.playerMesh.material = this.lockedMaterial;
    this.playerBody.add(this.playerMesh);
    this.featherColors = [...new Set(character.parts.map((p) => p[6]))].slice(0, 3);
  }

  newRun(seed) {
    this.world?.dispose();
    this.seed = seed;
    this.world = new World(this.scene, seed);
    this.time = 0;
    this.state = 'ready';
    this.paused = false;
    this.score = 0;
    this.maxRow = 0;
    this.runCoins = 0;
    this.camRow = 0;
    this.camX = 0;
    this.deathTime = 0;
    this.player = {
      row: 0,
      rowF: 0,
      x: 0,
      y: 0,
      hop: null,
      platform: null,
      queued: null,
      angle: 0,
      targetAngle: 0,
      landSquash: 0,
    };
    this.playerRoot.position.set(0, 0, 0);
    this.playerRoot.rotation.set(0, 0, 0);
    this.playerBody.scale.set(1, 1, 1);
    this.playerBody.rotation.set(0, 0, 0);
    this.playerRoot.visible = true;
    this.eagle.visible = false;
    this.particles.clear();
    this.world.ensure(0, 0);
    this.updateCamera(0, true);
    this.cb.onScore?.(0);
  }

  // On the title screen, place the player at this fraction of the screen
  // height (0 = top, 1 = bottom), e.g. in the gap between logo and menu.
  setReadyFocus(fraction) {
    this.readyFocus = clamp(fraction, 0.2, 0.8);
  }

  readyLook() {
    return (this.readyFocus - 0.5) * 2 * this.halfH * this.rowsPerUnit;
  }

  setPaused(paused) {
    if (this.state !== 'playing') return;
    this.paused = paused;
  }

  // ---------------------------------------------------------------- input

  move(dir) {
    if (this.paused) return;
    if (this.state === 'ready') {
      this.state = 'playing';
      this.cb.onStart?.();
    }
    if (this.state !== 'playing') return;
    const p = this.player;
    if (p.hop) {
      p.queued = dir;
      return;
    }
    const [dx, dr] = DIRS[dir];
    p.targetAngle = FACING[dir];
    const toRow = p.row + dr;
    const lane = this.world.getLane(toRow);
    if (!lane) return;

    const landT = this.time + HOP_TIME;
    let toX;
    let platform = null;
    if (lane.type === 'river') {
      // Aim where we'd be at landing time, including the log we're riding.
      const desired = p.platform ? p.platform.mover.xAt(landT) + p.platform.offset + dx : p.x + dx;
      if (desired < MIN_X - 0.5 || desired > MAX_X + 0.5) return this.bump();
      platform = lane.platformAt(desired, landT);
      toX = platform ? platform.mover.xAt(landT) + platform.offset : desired;
    } else {
      toX = Math.round(p.x + dx);
      if (toX < MIN_X || toX > MAX_X || lane.isBlocked(toX)) return this.bump();
    }

    p.hop = { fromX: p.x, toX, fromRow: p.row, toRow, fromY: p.y, toY: lane.surfaceY, t: 0, platform };
    p.platform = null;
    sfx.hop();
    if (toRow > this.maxRow) {
      this.maxRow = toRow;
      this.score = toRow;
      this.cb.onScore?.(this.score);
    }
  }

  bump() {
    this.player.landSquash = 0.6;
    sfx.bump();
  }

  // ---------------------------------------------------------------- loop

  frame() {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 1 / 20);
    this.last = now;
    if (!this.world) return;
    if (!this.paused) this.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    this.time += dt;
    this.world.update(this.time);

    if (this.state === 'playing') {
      this.updatePlayer(dt);
      if (this.state === 'playing') this.checkHazards();
    } else if (this.state === 'dying') {
      this.updateDeath(dt);
    }
    this.updatePlayerVisual(dt);
    this.particles.update(dt);
    this.handleWorldEvents();
    this.updateCamera(dt);
    this.world.ensure(this.camRow, this.time);
  }

  updatePlayer(dt) {
    const p = this.player;
    if (p.hop) {
      const h = p.hop;
      h.t += dt / HOP_TIME;
      const k = Math.min(1, h.t);
      p.x = lerp(h.fromX, h.toX, k);
      p.rowF = lerp(h.fromRow, h.toRow, k);
      p.y = lerp(h.fromY, h.toY, k) + Math.sin(Math.PI * k) * 0.42;
      if (k >= 1) this.land();
    } else if (p.platform) {
      p.x = p.platform.mover.xAt(this.time) + p.platform.offset;
      // Carried off the edge of the world.
      if (p.x < MIN_X - 0.9 || p.x > MAX_X + 0.9) this.die('water');
    }
  }

  land() {
    const p = this.player;
    const h = p.hop;
    p.hop = null;
    p.row = h.toRow;
    p.rowF = p.row;
    p.x = h.toX;
    p.y = h.toY;
    p.landSquash = 1;
    const lane = this.world.getLane(p.row);
    if (lane.type === 'river') {
      if (!h.platform) return this.die('water');
      p.platform = h.platform;
    } else if (lane.collectCoin(Math.round(p.x))) {
      this.runCoins++;
      sfx.coin();
      this.particles.burst(new THREE.Vector3(p.x, p.y + 0.5, -p.row), 6, [0xffd23a, 0xfff2a8], {
        speed: 2,
        up: 3,
        size: 0.1,
        life: 0.4,
      });
      this.cb.onCoin?.(this.runCoins);
    }
    if (p.queued) {
      const q = p.queued;
      p.queued = null;
      this.move(q);
    }
  }

  checkHazards() {
    const p = this.player;
    const row = p.hop ? (p.hop.t < 0.5 ? p.hop.fromRow : p.hop.toRow) : p.row;
    const lane = this.world.getLane(row);
    const hit = lane?.hazardAt(p.x - PLAYER_HALF_WIDTH, p.x + PLAYER_HALF_WIDTH);
    if (hit) {
      if (p.hop) p.y = lane.surfaceY;
      this.die(hit.train ? 'train' : 'car', hit);
      return;
    }
    if (!p.hop && p.row < this.camRow - EAGLE_DISTANCE) this.die('eagle');
  }

  // ---------------------------------------------------------------- death

  die(cause, hit) {
    if (this.state !== 'playing') return;
    const p = this.player;
    this.state = 'dying';
    this.deathCause = cause;
    this.deathTime = 0;
    p.hop = null;
    p.queued = null;
    p.platform = null;
    const pos = new THREE.Vector3(p.x, p.y + 0.3, -p.rowF);
    navigator.vibrate?.(cause === 'water' ? 60 : 120);

    if (cause === 'car') {
      sfx.squash();
      p.rowF = p.row = Math.round(p.rowF);
      this.playerBody.scale.set(1.35, 0.12, 1.35);
      this.particles.burst(pos, 10, this.featherColors, { speed: 3, up: 3 });
    } else if (cause === 'train') {
      sfx.crash();
      this.fling = { vx: Math.sign(hit.speed) * 16, vy: 9, vz: -2 };
      this.particles.burst(pos, 12, this.featherColors, { speed: 4, up: 5 });
    } else if (cause === 'water') {
      sfx.splash();
      this.particles.burst(pos, 16, [0xffffff, 0xbfefff, 0x5fcdf5], { speed: 2.5, up: 6, size: 0.14 });
    } else if (cause === 'eagle') {
      sfx.eagle();
      this.eagle.visible = true;
    }
  }

  updateDeath(dt) {
    this.deathTime += dt;
    const t = this.deathTime;
    const p = this.player;
    let duration = 1.1;

    if (this.deathCause === 'train') {
      p.x += this.fling.vx * dt;
      p.y += this.fling.vy * dt;
      p.rowF -= this.fling.vz * dt;
      this.fling.vy -= 20 * dt;
      this.playerBody.rotation.z += dt * 14;
      this.playerBody.rotation.x += dt * 9;
      duration = 1.3;
    } else if (this.deathCause === 'water') {
      p.y = Math.max(-1.5, p.y - dt * 2.2);
    } else if (this.deathCause === 'eagle') {
      duration = 1.9;
      const px = p.x;
      const pz = -p.row;
      const e = this.eagle;
      const flap = Math.sin(t * 22) * 0.6;
      e.userData.wings.forEach((w) => (w.rotation.z = flap));
      if (t < 0.6) {
        const k = t / 0.6;
        const ease = 1 - (1 - k) * (1 - k);
        e.position.set(px, lerp(7, 1.4, ease), lerp(pz - 16, pz, ease));
        e.rotation.x = 0.35;
      } else {
        const k = (t - 0.6) / 1.3;
        e.position.set(px, 1.4 + k * 5, pz + k * 22);
        e.rotation.x = -0.25;
        p.y = e.position.y - 1.1;
        p.rowF = -e.position.z;
      }
    }

    if (t > duration && this.state === 'dying') {
      this.state = 'over';
      this.cb.onGameOver?.({ score: this.score, coins: this.runCoins, cause: this.deathCause, seed: this.seed });
    }
  }

  // ---------------------------------------------------------------- visuals

  updatePlayerVisual(dt) {
    const p = this.player;
    this.playerRoot.position.set(p.x, p.y, -p.rowF);
    if (this.state === 'dying' && this.deathCause === 'car') return;

    p.angle = angleLerp(p.angle, p.targetAngle, Math.min(1, dt * 25));
    this.playerBody.rotation.y = p.angle;

    let sy = 1;
    let sxz = 1;
    if (p.hop) {
      const s = Math.sin(Math.PI * Math.min(1, p.hop.t));
      sy = 1 + s * 0.18;
      sxz = 1 - s * 0.08;
    } else if (p.landSquash > 0) {
      p.landSquash = Math.max(0, p.landSquash - dt * 10);
      sy = 1 - p.landSquash * 0.2;
      sxz = 1 + p.landSquash * 0.1;
    }
    if (this.state !== 'dying') this.playerBody.scale.set(sxz, sy, sxz);
  }

  handleWorldEvents() {
    for (const ev of this.world.events) {
      const near = Math.abs(ev.lane.row - this.player.row) <= 7 && this.state !== 'over';
      if (!near) continue;
      if (ev.type === 'bell') sfx.bell();
      if (ev.type === 'train') sfx.horn();
    }
    this.world.events.length = 0;
  }

  updateCamera(dt, instant = false) {
    const p = this.player;
    if (this.state === 'playing') {
      const creep = CAMERA_CREEP + Math.min(this.score, 300) * 0.001;
      this.camRow += creep * dt;
    }
    if (this.state !== 'dying' || this.deathCause !== 'eagle') {
      const target = Math.max(p.rowF, this.camRow);
      this.camRow = instant ? target : lerp(this.camRow, target, Math.min(1, dt * 4));
    }
    const targetX = clamp(p.x, MIN_X, MAX_X) * 0.5;
    this.camX = instant ? targetX : lerp(this.camX, targetX, Math.min(1, dt * 3));

    // On the title screen the player sits in the middle; once playing the
    // camera looks further ahead so you can see what's coming.
    const look = this.state === 'ready' ? this.readyLook() : this.lookAhead;
    this.look = instant ? look : lerp(this.look, look, Math.min(1, dt * 3));
    const fx = this.camX;
    const fz = -(this.camRow + this.look);
    this.camera.position.set(fx + CAM_OFFSET.x, CAM_OFFSET.y, fz + CAM_OFFSET.z);
    this.sun.position.set(fx + SUN_OFFSET.x, SUN_OFFSET.y, fz + SUN_OFFSET.z);
    this.sun.target.position.set(fx, 0, fz);
  }
}
