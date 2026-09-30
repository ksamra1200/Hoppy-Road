import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LANE_HALF, MIN_X, MAX_X, WATER_Y } from './config.js';

// Every model in the game is made of coloured boxes ("voxels") that are merged
// into a single geometry with per-vertex colours. One geometry + one shared
// material = one draw call per object, which keeps phones running smoothly.

export const voxelMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

const tmpColor = new THREE.Color();

// parts: array of [width, height, depth, x, y, z, colour]
export function voxels(parts) {
  const geos = parts.map(([w, h, d, x, y, z, hex]) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.deleteAttribute('uv');
    g.translate(x, y, z);
    tmpColor.set(hex);
    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  });
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  return merged;
}

export function voxelMesh(geometry, { cast = true, receive = false } = {}) {
  const mesh = new THREE.Mesh(geometry, voxelMaterial);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

const cache = new Map();
function cached(key, build) {
  let g = cache.get(key);
  if (!g) {
    g = build();
    cache.set(key, g);
  }
  return g;
}

// ---------------------------------------------------------------- ground ---

const LEFT_EDGE = -LANE_HALF - 0.5;
const RIGHT_EDGE = LANE_HALF + 0.5;
const PLAY_LEFT = MIN_X - 0.5;
const PLAY_RIGHT = MAX_X + 0.5;

// A lane-wide slab: bright in the playable area, darker outside it.
function slab(inner, outer, top, height = 0.4) {
  const y = top - height / 2;
  const sideW = PLAY_LEFT - LEFT_EDGE;
  return [
    [PLAY_RIGHT - PLAY_LEFT, height, 1, (PLAY_LEFT + PLAY_RIGHT) / 2, y, 0, inner],
    [sideW, height, 1, (LEFT_EDGE + PLAY_LEFT) / 2, y, 0, outer],
    [sideW, height, 1, (PLAY_RIGHT + RIGHT_EDGE) / 2, y, 0, outer],
  ];
}

export const GRASS_Y = 0;
export const ROAD_Y = -0.05;

export function grassGeometry(alt) {
  return cached(`grass${alt}`, () =>
    voxels(alt ? slab(0xb4ec5a, 0x8cc43e, GRASS_Y) : slab(0xa8e14f, 0x83ba37, GRASS_Y)),
  );
}

export function roadGeometry() {
  return cached('road', () => voxels(slab(0x5b6070, 0x474b58, ROAD_Y)));
}

// Dashed line along the far (-z) edge of a road lane, used between two roads.
export function roadLineGeometry() {
  return cached('roadline', () => {
    const parts = [];
    for (let x = -LANE_HALF; x <= LANE_HALF; x += 2) {
      parts.push([0.9, 0.02, 0.07, x, ROAD_Y + 0.01, -0.5, 0xe8e8e8]);
    }
    return voxels(parts);
  });
}

export function waterGeometry() {
  return cached('water', () => voxels(slab(0x5fcdf5, 0x48b2de, WATER_Y, 0.3)));
}

export function railGeometry() {
  return cached('rail', () => {
    const parts = slab(0x8e8378, 0x756b62, ROAD_Y);
    for (let x = -LANE_HALF; x <= LANE_HALF; x += 0.66) {
      parts.push([0.2, 0.05, 0.84, x, ROAD_Y + 0.025, 0, 0x6e4a2e]);
    }
    const w = LANE_HALF * 2 + 1;
    parts.push([w, 0.08, 0.07, 0, ROAD_Y + 0.07, -0.24, 0xc7ccd6]);
    parts.push([w, 0.08, 0.07, 0, ROAD_Y + 0.07, 0.24, 0xc7ccd6]);
    return voxels(parts);
  });
}

// ------------------------------------------------------------- scenery ---

// Trees and rocks are returned as voxel parts (not geometries) so that a
// whole lane of scenery can be merged into one mesh.
export function treeParts(size, x) {
  const fh = [0.45, 0.85, 1.25][size];
  return [
    [0.34, 0.32, 0.34, x, 0.16, 0, 0x7b4a2a],
    [0.78, fh, 0.78, x, 0.32 + fh / 2, 0, 0x3f9a3a],
    [0.8, 0.12, 0.8, x, 0.38, 0, 0x2f7d31],
  ];
}

export function rockParts(x) {
  return [
    [0.7, 0.38, 0.62, x, 0.19, 0, 0x9aa1ab],
    [0.5, 0.14, 0.44, x + 0.04, 0.44, 0.02, 0xb7bdc6],
  ];
}

export function coinGeometry() {
  return cached('coin', () =>
    voxels([
      [0.44, 0.44, 0.1, 0, 0, 0, 0xffd23a],
      [0.24, 0.28, 0.12, 0, 0, 0, 0xf0a800],
      [0.3, 0.08, 0.11, 0, 0.26, 0, 0xffd23a],
    ]),
  );
}

// ------------------------------------------------------------- vehicles ---
// Vehicles are modelled facing +x. `length` is their size along x.

const GLASS = 0x2f3d52;
const TYRE = 0x262626;

export const CAR_COLORS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0x2ecc71, 0xff7f50, 0xecf0f1];
export const CAR_LENGTH = 1.5;

export function carGeometry(hex) {
  return cached(`car${hex}`, () =>
    voxels([
      [1.5, 0.42, 0.8, 0, 0.36, 0, hex],
      [0.78, 0.32, 0.72, -0.12, 0.72, 0, GLASS],
      [0.72, 0.06, 0.74, -0.12, 0.9, 0, hex],
      [0.06, 0.1, 0.16, 0.76, 0.42, 0.24, 0xfff3a8],
      [0.06, 0.1, 0.16, 0.76, 0.42, -0.24, 0xfff3a8],
      [0.06, 0.1, 0.14, -0.76, 0.42, 0.26, 0xd62c2c],
      [0.06, 0.1, 0.14, -0.76, 0.42, -0.26, 0xd62c2c],
      [0.32, 0.3, 0.1, 0.46, 0.15, 0.4, TYRE],
      [0.32, 0.3, 0.1, 0.46, 0.15, -0.4, TYRE],
      [0.32, 0.3, 0.1, -0.46, 0.15, 0.4, TYRE],
      [0.32, 0.3, 0.1, -0.46, 0.15, -0.4, TYRE],
    ]),
  );
}

export const TRUCK_COLORS = [
  [0xecf0f1, 0xe74c3c],
  [0xf39c12, 0x34495e],
  [0x1abc9c, 0xecf0f1],
  [0xbdc3c7, 0x2980b9],
];
export const TRUCK_LENGTH = 2.64;

export function truckGeometry(index) {
  const [trailer, cab] = TRUCK_COLORS[index];
  return cached(`truck${index}`, () =>
    voxels([
      [1.9, 0.9, 0.84, -0.38, 0.66, 0, trailer],
      [2.56, 0.12, 0.6, 0, 0.2, 0, 0x333333],
      [0.72, 0.62, 0.8, 0.95, 0.52, 0, cab],
      [0.05, 0.26, 0.64, 1.31, 0.64, 0, GLASS],
      [0.05, 0.08, 0.14, 1.31, 0.3, 0.26, 0xfff3a8],
      [0.05, 0.08, 0.14, 1.31, 0.3, -0.26, 0xfff3a8],
      [0.32, 0.3, 0.1, 0.95, 0.15, 0.41, TYRE],
      [0.32, 0.3, 0.1, 0.95, 0.15, -0.41, TYRE],
      [0.32, 0.3, 0.1, -0.2, 0.15, 0.41, TYRE],
      [0.32, 0.3, 0.1, -0.2, 0.15, -0.41, TYRE],
      [0.32, 0.3, 0.1, -1.0, 0.15, 0.41, TYRE],
      [0.32, 0.3, 0.1, -1.0, 0.15, -0.41, TYRE],
    ]),
  );
}

export const TRAIN_CARS = 4;
export const TRAIN_CAR_LENGTH = 2.8;
export const TRAIN_GAP = 0.16;
export const TRAIN_LENGTH = TRAIN_CARS * TRAIN_CAR_LENGTH + (TRAIN_CARS - 1) * TRAIN_GAP;

export function trainGeometry() {
  return cached('train', () => {
    const parts = [];
    const L = TRAIN_CAR_LENGTH;
    for (let i = 0; i < TRAIN_CARS; i++) {
      // i = 0 is the engine at the front (+x end).
      const cx = TRAIN_LENGTH / 2 - L / 2 - i * (L + TRAIN_GAP);
      const engine = i === 0;
      const body = engine ? 0xd9443a : 0x3c73d6;
      parts.push([L, 0.92, 0.9, cx, 0.64, 0, body]);
      parts.push([L - 0.2, 0.2, 0.86, cx, 0.1, 0, 0x2a2a2a]);
      parts.push([L - 0.1, 0.08, 0.92, cx, 1.12, 0, engine ? 0xb8352d : 0x2f5cb0]);
      if (engine) {
        parts.push([0.06, 0.3, 0.7, cx + L / 2, 0.84, 0, GLASS]);
        parts.push([0.08, 0.14, 0.2, cx + L / 2, 0.42, 0.26, 0xfff3a8]);
        parts.push([0.08, 0.14, 0.2, cx + L / 2, 0.42, -0.26, 0xfff3a8]);
        parts.push([L - 0.8, 0.22, 0.92, cx - 0.3, 0.82, 0, 0xf5f5f5]);
      } else {
        parts.push([L - 0.3, 0.24, 0.92, cx, 0.82, 0, 0xd8ecff]);
      }
      if (i < TRAIN_CARS - 1) {
        parts.push([TRAIN_GAP + 0.1, 0.2, 0.3, cx - L / 2 - TRAIN_GAP / 2, 0.4, 0, 0x333333]);
      }
    }
    return voxels(parts);
  });
}

export function signalGeometry() {
  return cached('signal', () =>
    voxels([
      [0.12, 1.2, 0.12, 0, 0.6, 0, 0x5a5f69],
      [0.44, 0.26, 0.18, 0, 1.2, 0, 0x2d3038],
      [0.3, 0.08, 0.3, 0, 0.02, 0, 0x5a5f69],
    ]),
  );
}

export function logGeometry(length) {
  return cached(`log${length}`, () => {
    const parts = [[length - 0.08, 0.3, 0.74, 0, 0, 0, 0x8a5a33]];
    for (let x = -length / 2 + 0.6; x < length / 2 - 0.3; x += 0.7) {
      parts.push([0.08, 0.31, 0.75, x, 0, 0, 0x74492a]);
    }
    parts.push([0.05, 0.24, 0.62, length / 2 - 0.06, 0, 0, 0xdcb382]);
    parts.push([0.05, 0.24, 0.62, -length / 2 + 0.06, 0, 0, 0xdcb382]);
    return voxels(parts);
  });
}

export function lilyGeometry() {
  return cached('lily', () =>
    voxels([
      [0.82, 0.06, 0.82, 0, 0, 0, 0x3c9a3c],
      [0.2, 0.07, 0.3, 0.3, 0, 0.26, 0x5fcdf5],
      [0.14, 0.1, 0.14, -0.18, 0.06, -0.16, 0xff9fd0],
    ]),
  );
}

// ---------------------------------------------------------------- eagle ---
// Faces +z (towards the camera), because it swoops down the screen.

export function createEagle() {
  const group = new THREE.Group();
  const body = voxelMesh(
    voxels([
      [0.62, 0.46, 1.1, 0, 0, 0, 0x6b4226],
      [0.5, 0.46, 0.46, 0, 0.2, 0.66, 0xffffff],
      [0.2, 0.16, 0.24, 0, 0.14, 0.98, 0xf5c518],
      [0.52, 0.08, 0.1, 0, 0.3, 0.9, 0x111111],
      [0.54, 0.1, 0.44, 0, 0.04, -0.74, 0xffffff],
      [0.1, 0.24, 0.1, 0.16, -0.32, 0.24, 0xf5c518],
      [0.1, 0.24, 0.1, -0.16, -0.32, 0.24, 0xf5c518],
    ]),
  );
  group.add(body);
  const wingGeo = voxels([
    [1.3, 0.1, 0.7, 0.65, 0, 0, 0x5a3720],
    [0.5, 0.1, 0.5, 1.45, 0, -0.05, 0x4a2d18],
  ]);
  const left = voxelMesh(wingGeo);
  left.position.set(0.3, 0.1, 0);
  const right = voxelMesh(wingGeo);
  right.position.set(-0.3, 0.1, 0);
  right.rotation.y = Math.PI;
  group.add(left, right);
  group.userData.wings = [left, right];
  group.scale.setScalar(1.3);
  return group;
}

export const PLAYFIELD = { left: PLAY_LEFT, right: PLAY_RIGHT };
