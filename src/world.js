import * as THREE from 'three';
import {
  voxels,
  voxelMesh,
  grassGeometry,
  roadGeometry,
  roadLineGeometry,
  waterGeometry,
  railGeometry,
  treeParts,
  rockParts,
  coinGeometry,
  carGeometry,
  truckGeometry,
  trainGeometry,
  signalGeometry,
  logGeometry,
  lilyGeometry,
  CAR_COLORS,
  CAR_LENGTH,
  TRUCK_COLORS,
  TRUCK_LENGTH,
  TRAIN_LENGTH,
  GRASS_Y,
  ROAD_Y,
} from './models.js';
import { mulberry32, hashSeed } from './rng.js';
import { MIN_X, MAX_X, LANE_HALF, WATER_Y, LOG_TOP_Y, ROWS_AHEAD, ROWS_BEHIND } from './config.js';

// Cars, trucks and logs loop around the lane: when one leaves at +WRAP it
// re-enters at -WRAP (and vice versa), far outside the visible area.
const WRAP = LANE_HALF + 4;
const SPAN = WRAP * 2;
const wrap = (x) => ((((x + WRAP) % SPAN) + SPAN) % SPAN) - WRAP;

// 0 at the start, creeping towards 1 the further you get.
export function difficulty(row) {
  return 1 - Math.exp(-Math.max(0, row) / 120);
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// A thing that moves along a lane at a constant speed. Its position is a pure
// function of time, so the same seed always plays out exactly the same way.
class Mover {
  constructor(mesh, x0, length, speed) {
    this.mesh = mesh;
    this.x0 = x0;
    this.length = length;
    this.speed = speed;
    this.x = x0;
  }
  xAt(t) {
    return wrap(this.x0 + this.speed * t);
  }
}

class Lane {
  constructor(world, row, type) {
    this.world = world;
    this.row = row;
    this.type = type;
    this.surfaceY = GRASS_Y;
    this.group = new THREE.Group();
    this.group.position.z = -row;
    this.coins = new Map();
    this.ownGeometries = [];
    world.scene.add(this.group);
  }
  addGround(geometry) {
    const mesh = voxelMesh(geometry, { cast: false, receive: true });
    this.group.add(mesh);
    return mesh;
  }
  addCoin(x) {
    const mesh = voxelMesh(coinGeometry());
    mesh.position.set(x, this.surfaceY + 0.42, 0);
    this.group.add(mesh);
    this.coins.set(x, mesh);
  }
  collectCoin(x) {
    const mesh = this.coins.get(x);
    if (!mesh) return false;
    this.group.remove(mesh);
    this.coins.delete(x);
    return true;
  }
  isBlocked() {
    return false;
  }
  hazardAt() {
    return null;
  }
  update(t) {
    const spin = t * 3;
    for (const coin of this.coins.values()) {
      coin.rotation.y = spin;
      coin.position.y = this.surfaceY + 0.42 + Math.sin(spin * 1.3) * 0.05;
    }
  }
  dispose() {
    this.world.scene.remove(this.group);
    for (const g of this.ownGeometries) g.dispose();
  }
}

class GrassLane extends Lane {
  constructor(world, row, rng, spec) {
    super(world, row, 'grass');
    this.addGround(grassGeometry(((row % 2) + 2) % 2));
    this.blocked = new Set();

    const parts = [];
    const keepFree = new Set(spec.free || []);
    for (let x = MIN_X; x <= MAX_X; x++) {
      if (spec.wall || (!keepFree.has(x) && rng() < spec.density)) {
        this.blocked.add(x);
        if (rng() < 0.2) parts.push(...rockParts(x));
        else parts.push(...treeParts(Math.floor(rng() * 3), x));
      }
    }
    // Scenery outside the playable area.
    for (let x = -LANE_HALF; x <= LANE_HALF; x++) {
      if (x >= MIN_X && x <= MAX_X) continue;
      const nearEdge = x === MIN_X - 1 || x === MAX_X + 1;
      if (nearEdge || rng() < 0.45) parts.push(...treeParts(Math.floor(rng() * 3), x));
    }
    if (parts.length) {
      const geo = voxels(parts);
      this.ownGeometries.push(geo);
      const mesh = voxelMesh(geo, { cast: true, receive: true });
      this.group.add(mesh);
    }

    if (!spec.wall && spec.coins !== false && rng() < 0.3) {
      const free = [];
      for (let x = MIN_X; x <= MAX_X; x++) if (!this.blocked.has(x)) free.push(x);
      if (free.length) this.addCoin(pick(rng, free));
    }
  }
  isBlocked(x) {
    return this.blocked.has(x);
  }
}

class RoadLane extends Lane {
  constructor(world, row, rng, spec) {
    super(world, row, 'road');
    this.surfaceY = ROAD_Y;
    this.addGround(roadGeometry());
    if (spec.lineAhead) this.addGround(roadLineGeometry());

    const diff = spec.diff;
    const dir = rng() < 0.5 ? 1 : -1;
    const trucks = rng() < 0.3;
    const speed = (1.2 + rng() * 1.3) * (1 + diff * 1.1) * (trucks ? 0.8 : 1);
    const minGap = 3.2 - diff * 0.9;
    const varGap = 5 - diff * 2;
    const truckStyle = Math.floor(rng() * TRUCK_COLORS.length);

    this.movers = [];
    let cursor = -WRAP;
    for (;;) {
      const length = trucks ? TRUCK_LENGTH : CAR_LENGTH;
      const gap = minGap + rng() * varGap;
      if (cursor + gap + length > WRAP - minGap) break;
      cursor += gap;
      const geo = trucks ? truckGeometry(truckStyle) : carGeometry(pick(rng, CAR_COLORS));
      const mesh = voxelMesh(geo, { cast: true });
      mesh.position.y = ROAD_Y;
      if (dir < 0) mesh.rotation.y = Math.PI;
      this.group.add(mesh);
      this.movers.push(new Mover(mesh, cursor + length / 2, length, speed * dir));
      cursor += length;
    }

    if (rng() < 0.12) this.addCoin(MIN_X + Math.floor(rng() * (MAX_X - MIN_X + 1)));
  }
  update(t) {
    super.update(t);
    for (const m of this.movers) {
      m.x = m.xAt(t);
      m.mesh.position.x = m.x;
    }
  }
  hazardAt(x0, x1) {
    for (const m of this.movers) {
      const half = m.length / 2 - 0.08;
      if (x1 > m.x - half && x0 < m.x + half) return m;
    }
    return null;
  }
}

class RiverLane extends Lane {
  constructor(world, row, rng, spec) {
    super(world, row, 'river');
    this.addGround(waterGeometry());
    this.movers = [];
    const diff = spec.diff;

    if (spec.lily) {
      // Static lily pads. There is always one on the guaranteed path.
      this.surfaceY = WATER_Y + 0.06;
      for (let x = MIN_X; x <= MAX_X; x++) {
        if (x === spec.pathX || rng() < 0.3) {
          const mesh = voxelMesh(lilyGeometry(), { cast: false, receive: true });
          mesh.position.set(x, WATER_Y + 0.03, 0);
          mesh.rotation.y = Math.floor(rng() * 4) * (Math.PI / 2);
          this.group.add(mesh);
          this.movers.push(new Mover(mesh, x, 1, 0));
        }
      }
      return;
    }

    this.surfaceY = LOG_TOP_Y;
    const speed = (0.9 + rng() * 0.9) * (1 + diff * 0.5) * spec.dir;
    let cursor = -WRAP;
    for (;;) {
      const length = 2 + Math.floor(rng() * (diff < 0.5 ? 3 : 2));
      const gap = 1.1 + rng() * 2.2 + diff * 1.0;
      if (cursor + gap + length > WRAP - 1.1) break;
      cursor += gap;
      const mesh = voxelMesh(logGeometry(length), { cast: true, receive: true });
      mesh.position.y = LOG_TOP_Y - 0.15;
      this.group.add(mesh);
      this.movers.push(new Mover(mesh, cursor + length / 2, length, speed));
      cursor += length;
    }
  }
  update(t) {
    super.update(t);
    for (const m of this.movers) {
      if (m.speed === 0) continue;
      m.x = m.xAt(t);
      m.mesh.position.x = m.x;
      // Gentle bob so the river feels alive.
      m.mesh.position.y = LOG_TOP_Y - 0.15 + Math.sin(t * 2.2 + m.x0) * 0.015;
    }
  }
  // Find a log/lily pad under `x` at time `t`. Returns the mover and the
  // slot offset (logs have one standing spot per tile).
  platformAt(x, t) {
    let best = null;
    let bestGap = 0.25; // a little forgiveness for landing just off the end
    for (const m of this.movers) {
      const mx = m.xAt(t);
      const gap = Math.abs(x - mx) - m.length / 2;
      if (gap > bestGap) continue;
      bestGap = gap;
      const slots = Math.round(m.length);
      const first = -(slots - 1) / 2;
      const i = Math.max(0, Math.min(slots - 1, Math.round(x - mx - first)));
      best = { mover: m, offset: first + i };
    }
    return best;
  }
}

class RailLane extends Lane {
  constructor(world, row, rng, spec) {
    super(world, row, 'rail');
    this.surfaceY = ROAD_Y;
    this.addGround(railGeometry());
    this.rng = rng;
    this.dir = rng() < 0.5 ? 1 : -1;
    this.speed = 22 + spec.diff * 8;
    this.length = TRAIN_LENGTH;
    this.enter = LANE_HALF + 3;
    this.passTime = (this.enter * 2 + this.length) / this.speed;

    const signal = voxelMesh(signalGeometry());
    signal.position.set(MIN_X - 1, ROAD_Y, 0.38);
    this.group.add(signal);
    this.lampMaterial = new THREE.MeshBasicMaterial({ color: 0x40262a });
    const lampGeo = new THREE.BoxGeometry(0.12, 0.12, 0.04);
    this.ownGeometries.push(lampGeo);
    this.lamps = [-0.1, 0.1].map((dx) => {
      const lamp = new THREE.Mesh(lampGeo, this.lampMaterial);
      lamp.position.set(MIN_X - 1 + dx, ROAD_Y + 1.2, 0.48);
      this.group.add(lamp);
      return lamp;
    });

    this.train = voxelMesh(trainGeometry(), { cast: true });
    this.train.position.y = ROAD_Y;
    this.train.rotation.y = this.dir > 0 ? 0 : Math.PI;
    this.train.visible = false;
    this.group.add(this.train);

    // Train timetable. It always starts from t = 0 so it does not matter when
    // this lane is created: the same seed always gives the same trains.
    this.nextTrain = 2 + rng() * 6;
    this.warned = false;
    this.honked = false;
    this.front = null;
  }
  update(t) {
    super.update(t);
    while (t > this.nextTrain + this.passTime) {
      this.nextTrain += this.passTime + 3 + this.rng() * 6;
      this.warned = false;
      this.honked = false;
    }
    const warnAt = this.nextTrain - 1.4;
    const warning = t > warnAt;
    if (warning && !this.warned) {
      this.warned = true;
      this.world.emit('bell', this);
    }
    const blink = warning && Math.floor(t * 6) % 2 === 0;
    this.lampMaterial.color.setHex(blink ? 0xff3b30 : 0x40262a);

    if (t >= this.nextTrain) {
      if (!this.honked) {
        this.honked = true;
        this.world.emit('train', this);
      }
      this.front = -this.dir * this.enter + this.dir * this.speed * (t - this.nextTrain);
      this.train.visible = true;
      this.train.position.x = this.front - (this.dir * this.length) / 2;
    } else {
      this.front = null;
      this.train.visible = false;
    }
  }
  hazardAt(x0, x1) {
    if (this.front === null) return null;
    const a = this.dir > 0 ? this.front - this.length : this.front;
    const b = this.dir > 0 ? this.front : this.front + this.length;
    if (x1 > a && x0 < b) return { speed: this.speed * this.dir, train: true };
    return null;
  }
  dispose() {
    super.dispose();
    this.lampMaterial.dispose();
  }
}

const LANE_TYPES = { grass: GrassLane, road: RoadLane, river: RiverLane, rail: RailLane };

export class World {
  constructor(scene, seed) {
    this.scene = scene;
    this.seed = seed;
    this.rng = mulberry32(hashSeed(seed, 1));
    this.specs = new Map();
    this.lanes = new Map();
    this.events = [];

    // Planner state.
    this.planRow = -ROWS_BEHIND - 30;
    this.lastType = 'grass';
    this.pathX = 0;
    this.riverDir = 1;
  }

  emit(type, lane) {
    this.events.push({ type, lane });
  }

  // ---- planning: decide what type each row is, a chunk at a time --------

  spec(row) {
    while (this.planRow <= row + 1) this.planChunk();
    return this.specs.get(row);
  }

  push(spec) {
    spec.diff = difficulty(this.planRow);
    this.specs.set(this.planRow, spec);
    this.planRow++;
  }

  pushGrass(extra = {}) {
    // Keep a guaranteed free path through consecutive grass rows so the map
    // can never be completely walled off.
    const from = this.pathX;
    const step = Math.floor(this.rng() * 3) - 1;
    this.pathX = Math.max(MIN_X, Math.min(MAX_X, this.pathX + step));
    this.push({
      type: 'grass',
      free: [from, this.pathX],
      density: 0.12 + difficulty(this.planRow) * 0.12,
      ...extra,
    });
  }

  planChunk() {
    const r = this.rng;
    const row = this.planRow;

    if (row < -3) return this.push({ type: 'grass', wall: true });
    if (row <= 3) {
      this.pathX = 0;
      return this.push({ type: 'grass', free: [-1, 0, 1], density: row < 0 ? 0.35 : 0.1, coins: false });
    }

    const diff = difficulty(row);
    let type = 'grass';
    if (this.lastType !== 'grass' ? r() > 0.45 : true) {
      const roll = r();
      type = roll < 0.45 ? 'road' : roll < 0.75 ? 'river' : 'rail';
      if (type === this.lastType) type = 'grass';
    }
    this.lastType = type;

    if (type === 'grass') {
      const n = 1 + (r() < 0.3 ? 1 : 0);
      for (let i = 0; i < n; i++) this.pushGrass();
    } else if (type === 'road') {
      const n = 1 + Math.floor(r() * (2 + diff * 3));
      for (let i = 0; i < n; i++) this.push({ type: 'road', lineAhead: i < n - 1 });
    } else if (type === 'river') {
      const n = 1 + Math.floor(r() * (1.6 + diff * 2));
      this.riverDir = r() < 0.5 ? 1 : -1;
      for (let i = 0; i < n; i++) {
        const lily = r() < 0.18;
        this.push({ type: 'river', lily, pathX: this.pathX, dir: this.riverDir });
        this.riverDir = -this.riverDir;
      }
    } else {
      const n = 1 + (r() < 0.3 ? 1 : 0);
      for (let i = 0; i < n; i++) this.push({ type: 'rail' });
    }
  }

  // ---- lanes ----------------------------------------------------------

  getLane(row) {
    return this.lanes.get(row);
  }

  buildLane(row) {
    const spec = this.spec(row);
    const rng = mulberry32(hashSeed(this.seed, row + 7919));
    const lane = new LANE_TYPES[spec.type](this, row, rng, spec);
    this.lanes.set(row, lane);
    return lane;
  }

  // Make sure lanes exist around `centerRow`; drop the ones far behind.
  ensure(centerRow, t) {
    const min = Math.floor(centerRow) - ROWS_BEHIND;
    const max = Math.ceil(centerRow) + ROWS_AHEAD;
    for (let row = min; row <= max; row++) {
      if (!this.lanes.has(row)) this.buildLane(row).update(t);
    }
    for (const [row, lane] of this.lanes) {
      if (row < min - 2) {
        lane.dispose();
        this.lanes.delete(row);
      }
    }
  }

  update(t) {
    for (const lane of this.lanes.values()) lane.update(t);
  }

  dispose() {
    for (const lane of this.lanes.values()) lane.dispose();
    this.lanes.clear();
  }
}
