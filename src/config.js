// Change the name of the game here.
export const GAME_TITLE = 'Hoppy Road';

// The player can stand on columns MIN_X..MAX_X. Everything outside is scenery.
export const MIN_X = -4;
export const MAX_X = 4;

// Lanes are drawn (and vehicles drive) from -LANE_HALF..LANE_HALF.
export const LANE_HALF = 20;

// Seconds a single hop takes.
export const HOP_TIME = 0.12;

// How many rows the player may fall behind the camera before the eagle comes.
export const EAGLE_DISTANCE = 3.5;

// How fast the camera creeps forward on its own (rows per second).
export const CAMERA_CREEP = 0.32;

// How many lanes to keep alive around the camera.
export const ROWS_AHEAD = 32;
export const ROWS_BEHIND = 16;

// Surface heights.
export const WATER_Y = -0.2;
export const LOG_TOP_Y = 0.02;
