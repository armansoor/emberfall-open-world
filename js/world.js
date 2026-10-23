'use strict';
/* Emberfall — world data: biomes, props/collision, NPCs, shards, spawns. */
const WORLD = { W: 3840, H: 2880, TILE: 64 };
const VILLAGE = { x: 1440, y: 1980, w: 960, h: 820 }; // south-centre
const SPAWN = { x: 1900, y: 2420 }; // village square

function getBiome(x, y) {
  if (x >= VILLAGE.x && x < VILLAGE.x + VILLAGE.w && y >= VILLAGE.y && y < VILLAGE.y + VILLAGE.h) return 'village';
  if (y < 1400) return x < 1920 ? 'forest' : 'desert';
  return x < 1920 ? 'snow' : 'shadow';
}
const BIOME_COLORS = {
  village: ['#6aa84f', '#639c49'], forest: ['#2d5a27', '#285120'],
  desert: ['#d9b36c', '#cfa95f'], snow: ['#dfe9f2', '#d2e0ee'], shadow: ['#3a2b4a', '#342744']
};

const SHARD_SPOTS = [
  { id: 'forest', name: 'Verdant Shard', icon: '🟢', x: 520, y: 460, biome: 'forest', guardian: 'Treant Guardian' },
  { id: 'desert', name: 'Solar Shard', icon: '🟡', x: 3320, y: 460, biome: 'desert', guardian: 'Dune Guardian' },
  { id: 'snow', name: 'Frost Shard', icon: '🔵', x: 520, y: 2380, biome: 'snow', guardian: 'Frost Guardian' }
];
const BOSS_SPOT = { x: 3320, y: 2260 };
const AMULET_SPOT = { x: 980, y: 900 };
const BIOME_NAMES = { village: 'Ember Village', forest: 'Whispering Forest', desert: 'Sunscorch Desert', snow: 'Frostbite Snowfields', shadow: 'The Shadowlands' };

/* Deterministic seeded RNG so the world is identical on every load. */
function mulberry32(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const PROPS = []; // {x,y,w,h,kind,biome,solid}
(function buildProps() {
  const rnd = mulberry32(1337);
  const kinds = { forest: 'tree', desert: 'cactus', snow: 'pine', shadow: 'dead', village: 'flower' };
  for (let i = 0; i < 700; i++) {
    const x = 40 + rnd() * (WORLD.W - 80), y = 40 + rnd() * (WORLD.H - 80);
    const b = getBiome(x, y);
    if (Math.hypot(x - SPAWN.x, y - SPAWN.y) < 170) continue;
    if (SHARD_SPOTS.some(s => Math.hypot(x - s.x, y - s.y) < 120)) continue;
    if (Math.hypot(x - BOSS_SPOT.x, y - BOSS_SPOT.y) < 200) continue;
    if (Math.hypot(x - AMULET_SPOT.x, y - AMULET_SPOT.y) < 90) continue;
    const solid = b !== 'village';
    PROPS.push({ x, y, w: 30, h: 30, kind: kinds[b], biome: b, solid });
  }
  // Village buildings (solid, with labels)
  const buildings = [
    { x: 1560, y: 2080, w: 150, h: 110, kind: 'house', label: 'Shop' },
    { x: 2100, y: 2080, w: 150, h: 110, kind: 'house', label: 'Inn' },
    { x: 1830, y: 2100, w: 170, h: 120, kind: 'hall', label: 'Elder Hall' },
    { x: 1620, y: 2560, w: 130, h: 100, kind: 'house', label: 'Farm' },
    { x: 2080, y: 2560, w: 130, h: 100, kind: 'house', label: 'Cottage' }
  ];
  buildings.forEach(b => PROPS.push(Object.assign({ biome: 'village', solid: true }, b)));
  // Border rocks keep the player inside the world
  for (let x = 0; x < WORLD.W; x += 64) { PROPS.push({ x, y: 8, w: 40, h: 24, kind: 'rock', biome: 'forest', solid: true }); PROPS.push({ x, y: WORLD.H - 32, w: 40, h: 24, kind: 'rock', biome: 'forest', solid: true }); }
  for (let y = 0; y < WORLD.H; y += 64) { PROPS.push({ x: 8, y, w: 24, h: 40, kind: 'rock', biome: 'forest', solid: true }); PROPS.push({ x: WORLD.W - 32, y, w: 24, h: 40, kind: 'rock', biome: 'forest', solid: true }); }
})();

const NPCS = [
  { id: 'mara', name: 'Elder Mara', icon: '🧙‍♀️', x: 1915, y: 2280, color: '#8e44ad', role: 'elder' },
  { id: 'bram', name: 'Bram the Shopkeeper', icon: '🧔', x: 1635, y: 2230, color: '#b9770e', role: 'shop' },
  { id: 'lio', name: 'Farmer Lio', icon: '🌾', x: 1700, y: 2680, color: '#229954', role: 'side_slimes' },
  { id: 'renn', name: 'Scout Renn', icon: '🧭', x: 2180, y: 2680, color: '#2471a3', role: 'side_amulet' },
  { id: 'sana', name: 'Healer Sana', icon: '💖', x: 2160, y: 2230, color: '#e84393', role: 'healer' }
];

const ENEMY_TYPES = {
  slime:   { name: 'Slime',        icon: '🟢', hp: 24,  dmg: 6,  speed: 55,  xp: 14, gold: [3, 9],   r: 15, color: '#58d68d', biomes: ['village', 'forest'] },
  wolf:    { name: 'Dire Wolf',    icon: '🐺', hp: 38,  dmg: 9,  speed: 105, xp: 22, gold: [5, 12],  r: 16, color: '#808b96', biomes: ['forest'] },
  scorpion:{ name: 'Sand Scorpion',icon: '🦂', hp: 44,  dmg: 11, speed: 85,  xp: 28, gold: [7, 15],  r: 16, color: '#ca6f1e', biomes: ['desert'] },
  wraith:  { name: 'Snow Wraith',  icon: '👻', hp: 52,  dmg: 13, speed: 80,  xp: 34, gold: [9, 18],  r: 16, color: '#aed6f1', biomes: ['snow'] },
  imp:     { name: 'Shadow Imp',   icon: '😈', hp: 60,  dmg: 15, speed: 95,  xp: 42, gold: [12, 22], r: 16, color: '#7d3c98', biomes: ['shadow'] },
  guardian:{ name: 'Guardian',     icon: '🗿', hp: 150, dmg: 16, speed: 60,  xp: 90, gold: [30, 50], r: 26, color: '#935116', biomes: [] },
  boss:    { name: 'Malachar, the Ashen King', icon: '👹', hp: 420, dmg: 22, speed: 72, xp: 300, gold: [200, 200], r: 34, color: '#641e16', biomes: [] }
};
const SHOP_ITEMS = [
  { id: 'hp_potion', name: 'Health Potion', icon: '🧪', price: 25, desc: 'Restores 50 HP' },
  { id: 'mp_potion', name: 'Mana Potion', icon: '🔷', price: 20, desc: 'Restores 40 MP' },
  { id: 'elixir', name: 'Ember Elixir', icon: '✨', price: 80, desc: 'Fully restores HP & MP' },
  { id: 'sword_up', name: 'Sharpening Stone', icon: '🗡️', price: 120, desc: '+4 attack, permanently' }
];
if (typeof window !== 'undefined') { window.WORLD = WORLD; window.getBiome = getBiome; }
