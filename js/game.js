'use strict';
/* Emberfall — main game engine. Vanilla JS + Canvas. */
(function () {
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas ? canvas.getContext('2d') : null;
const mm = $('minimap'), mmCtx = mm ? mm.getContext('2d') : null;
const SAVE_KEY = 'emberfall_save_v1';
const CLASSES = {
  Knight: { hp: 130, mp: 40, atk: 16, speed: 175, range: 78, cooldown: 380, projectile: false, icon: '🛡️' },
  Mage:   { hp: 85,  mp: 110, atk: 21, speed: 160, range: 340, cooldown: 420, projectile: true, mpCost: 8, icon: '🔮' },
  Ranger: { hp: 105, mp: 60, atk: 14, speed: 205, range: 300, cooldown: 240, projectile: true, mpCost: 0, icon: '🏹' }
};
const DIFF = { Story: { hp: 0.7, dmg: 0.6 }, Normal: { hp: 1, dmg: 1 }, Hardcore: { hp: 1.45, dmg: 1.6 } };

let S = null;            // game state
let mode = 'title';      // title|create|intro|playing|paused|dialogue|shop|quests|dead|ending|credits
let keys = {}, mouse = { x: 0, y: 0, down: false };
let joyVec = { x: 0, y: 0 };
let lastTime = 0, lastAttack = -100000, mmTimer = 0, toastTimer = null;
let selClass = 'Knight', selColor = '#e74c3c', selDiff = 'Normal';

function defaultQuests() {
  return {
    main: { stage: 0, shards: { forest: false, desert: false, snow: false } }, // 0 new,1 collecting,2 boss,3 done
    slimes: { state: 0, kills: 0, need: 5 },   // 0 new,1 active,2 done
    amulet: { state: 0, has: false }           // 0 new,1 active,2 done
  };
}
/* ---------- Adult Story Mode (21+, OFF by default) ----------
   Safety rules (non-negotiable):
   - There are NO minor characters in this game and none are ever created.
   - Romance is adult-to-adult, consensual only, and can be declined or ended
     at any point. Intimate moments are suggestive dialogue + fade-to-black
     ONLY — never graphic sexual detail.
   - The age gate requires a birth year that makes the player 21+ AND an
     explicit "I am 21 or older" confirmation. ONLY the boolean
     adultVerified flag is ever stored — the birth year is never saved,
     never written to localStorage, and never kept in the save object. */
function defaultAdult() {
  return { adultVerified: false, romances: { mira: 0, kael: 0 }, rewarded: { mira: false, kael: false }, tavern: { state: 0, choice: null } };
}
/* Pending verification set on the title screen before a game exists; picked
   up by startNewGame. Once a game is running, S.adult is the source of truth. */
let adultVerifiedGlobal = false;
let adultReturnTo = 'title';
function adultAgeOk(birthYear) {
  const y = Number(birthYear);
  if (!Number.isInteger(y)) return false;
  const cy = new Date().getFullYear();
  return y >= 1900 && y <= cy && (cy - y) >= 21;
}
function isAdultMode() { return !!(S && S.adult && S.adult.adultVerified === true); }
/* Returns true only if birth year proves 21+ AND confirmed is true. */
function verifyAdult(birthYear, confirmed) {
  const ok = adultAgeOk(birthYear) && confirmed === true;
  adultVerifiedGlobal = ok;
  if (S) { if (!S.adult || typeof S.adult !== 'object') S.adult = defaultAdult(); S.adult.adultVerified = ok; }
  updateAdultGateStatus(ok ? 'Adult Story Mode is ON.' : 'Adult Story Mode is OFF / locked.');
  return ok;
}
function disableAdultMode() {
  adultVerifiedGlobal = false;
  if (S && S.adult) S.adult.adultVerified = false;
  updateAdultGateStatus('Adult Story Mode is OFF.');
  return true;
}
function updateAdultGateStatus(msg) {
  const el = $('adult-status'); if (el && msg) el.textContent = msg;
}
function openAdultGate() {
  adultReturnTo = mode;
  mode = 'adult'; showScreen('screen-adult');
  const st = $('adult-status'); if (st) st.textContent = isAdultMode() ? 'Adult Story Mode is currently ON.' : 'Adult Story Mode is currently OFF. Verify below to enable it (21+ only).';
}
function closeAdultGate() {
  if (adultReturnTo === 'paused') { mode = 'paused'; showScreen('screen-pause'); }
  else if (adultReturnTo === 'playing') { mode = 'playing'; showScreen(null); }
  else { mode = 'title'; showScreen('screen-title'); }
}
function romanceStage(key) { return (S && S.adult && S.adult.romances && Number.isInteger(S.adult.romances[key])) ? S.adult.romances[key] : 0; }
function endRomance(key) {
  if (!S || !S.adult) return false;
  S.adult.romances[key] = 0;
  toast('You ended that romance, kindly and clearly. You can always talk again.');
  closeDialogue(); updateHUD(); return true;
}
function startTavernQuest() {
  if (!isAdultMode() || !S) return false;
  if (S.adult.tavern.state !== 0) return false;
  S.adult.tavern.state = 1; S.adult.tavern.choice = null;
  toast('⚖️ Tavern dilemma accepted — talk to Mira again to decide.');
  updateHUD(); return true;
}
function completeTavernQuest(choice) {
  if (!isAdultMode() || !S) return false;
  if (S.adult.tavern.state !== 1) return false;
  const p = S.player;
  S.adult.tavern.state = 2; S.adult.tavern.choice = choice || 'home';
  if (choice === 'ignore') { p.gold += 20; gainXP(20); toast('⚖️ You looked away. The night ended badly — a lesson in responsibility. +20 gold.'); }
  else if (choice === 'refuse') { p.gold += 70; gainXP(30); toast('⚖️ You refused more drinks and offered water and food. A hard, kind call. +70 gold.'); }
  else { p.gold += 90; gainXP(40); toast('⚖️ You walked him home safely. The tavern thanks you. +90 gold.'); }
  updateHUD(); return true;
}
function validateAdult(raw) {
  const a = defaultAdult();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return a; // missing/corrupt -> OFF
  a.adultVerified = raw.adultVerified === true;
  if (raw.romances && typeof raw.romances === 'object') {
    for (const k of ['mira', 'kael']) { const v = raw.romances[k]; if (Number.isInteger(v) && v >= 0 && v <= 3) a.romances[k] = v; }
  }
  if (raw.rewarded && typeof raw.rewarded === 'object') {
    for (const k of ['mira', 'kael']) if (raw.rewarded[k] === true) a.rewarded[k] = true;
  }
  if (raw.tavern && typeof raw.tavern === 'object' && Number.isInteger(raw.tavern.state) && raw.tavern.state >= 0 && raw.tavern.state <= 2) {
    a.tavern.state = raw.tavern.state; a.tavern.choice = (typeof raw.tavern.choice === 'string') ? raw.tavern.choice : null;
  }
  return a;
}
function newPlayer(cfg) {
  const c = CLASSES[cfg.cls];
  return {
    name: cfg.name, cls: cfg.cls, color: cfg.color, diff: cfg.diff, icon: c.icon,
    x: SPAWN.x, y: SPAWN.y, r: 17, level: 1, xp: 0, xpNext: 80, gold: 40,
    maxHp: c.hp, hp: c.hp, maxMp: c.mp, mp: c.mp, atk: c.atk, atkBonus: 0,
    speed: c.speed, face: -Math.PI / 2, ngPlus: 0,
    potions: { hp: 2, mp: 1, elixir: 0 }
  };
}
function enemyScale() { const d = S ? DIFF[S.player.diff] || DIFF.Normal : DIFF.Normal; const ng = S ? S.player.ngPlus : 0; return { hp: d.hp * (1 + 0.5 * ng), dmg: d.dmg * (1 + 0.35 * ng) }; }

function makeEnemy(typeKey, x, y, extra) {
  const t = ENEMY_TYPES[typeKey], sc = enemyScale();
  return Object.assign({
    type: typeKey, name: t.name, icon: t.icon, color: t.color, x, y, r: t.r,
    maxHp: Math.round(t.hp * sc.hp), hp: Math.round(t.hp * sc.hp),
    dmg: Math.round(t.dmg * sc.dmg), speed: t.speed, xp: t.xp,
    goldMin: t.gold[0], goldMax: t.gold[1], atkCd: 0, homeX: x, homeY: y, dead: false, respawnIn: 0
  }, extra || {});
}
function spawnWorldEnemies() {
  S.enemies = [];
  const rnd = mulberry32(4242 + (S.player.ngPlus * 97));
  const plan = [ ['slime', 14, 'forest'], ['slime', 6, 'village'], ['wolf', 10, 'forest'], ['scorpion', 12, 'desert'], ['wraith', 12, 'snow'], ['imp', 10, 'shadow'] ];
  plan.forEach(([type, n, biome]) => {
    for (let i = 0; i < n; i++) {
      let x, y, tries = 0;
      do { x = 120 + rnd() * (WORLD.W - 240); y = 120 + rnd() * (WORLD.H - 240); tries++; } while ((getBiome(x, y) !== biome || Math.hypot(x - SPAWN.x, y - SPAWN.y) < 260) && tries < 60);
      if (getBiome(x, y) === biome) S.enemies.push(makeEnemy(type, x, y, { respawns: true }));
    }
  });
  SHARD_SPOTS.forEach(s => S.enemies.push(makeEnemy('guardian', s.x + 70, s.y + 40, { name: s.guardian, guardShard: s.id, respawns: false })));
}
function spawnBoss() {
  if (S.enemies.some(e => e.type === 'boss' && !e.dead)) return;
  S.enemies.push(makeEnemy('boss', BOSS_SPOT.x, BOSS_SPOT.y, { respawns: false }));
  EmberAudio.boss(); toast('👹 Malachar has awakened in the Shadowlands!');
}

/* ---------- UI helpers ---------- */
const SCREENS = ['screen-title','screen-how','screen-create','screen-intro','screen-shop','screen-quests','screen-pause','screen-adult','screen-death','screen-ending','screen-credits'];
function showScreen(id) { SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id)); if (!id) SCREENS.forEach(s => $(s).classList.add('hidden')); }
function toast(msg, ms) {
  const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), ms || 2600);
}
function updateHUD() {
  if (!S) return; const p = S.player;
  $('hud-name').textContent = `${p.name} · ${p.cls} · Lv ${p.level}` + (p.ngPlus ? ` · NG+${p.ngPlus}` : '');
  $('hp-fill').style.width = Math.max(0, p.hp / p.maxHp * 100) + '%'; $('hp-text').textContent = `HP ${Math.ceil(p.hp)}/${p.maxHp}`;
  $('mp-fill').style.width = Math.max(0, p.mp / p.maxMp * 100) + '%'; $('mp-text').textContent = `MP ${Math.floor(p.mp)}/${p.maxMp}`;
  $('xp-fill').style.width = Math.max(0, p.xp / p.xpNext * 100) + '%'; $('xp-text').textContent = `XP ${p.xp}/${p.xpNext}`;
  $('hud-gold').textContent = p.gold;
  const sc = shardCount(); $('hud-shards').textContent = `💎 ${sc}/3 shards`;
  $('hud-potions').textContent = `${p.potions.hp} HP · ${p.potions.mp} MP` + (p.potions.elixir ? ` · ${p.potions.elixir} ✨` : '');
  const q = S.quests; let track = '';
  if (q.main.stage === 0) track = '📜 Talk to Elder Mara in Ember Village';
  else if (q.main.stage === 1) track = `📜 Shards: ${sc}/3 — Forest, Desert, Snowfields`;
  else if (q.main.stage === 2) track = '📜 Face Malachar in the Shadowlands (SE)';
  else track = '📜 The Ember is restored. Free-roam!';
  if (q.slimes.state === 1) track += `<br>🌾 Slimes defeated: ${q.slimes.kills}/${q.slimes.need}`;
  if (q.amulet.state === 1) track += `<br>🧭 ${q.amulet.has ? 'Return the amulet to Scout Renn' : 'Find the lost amulet in the Forest (NE of village path)'}`;
  if (isAdultMode() && S.adult.tavern.state === 1) track += '<br>⚖️ Tavern dilemma: talk to Mira to decide';
  $('quest-tracker').innerHTML = track;
}
function shardCount() { const s = S.quests.main.shards; return (s.forest ? 1 : 0) + (s.desert ? 1 : 0) + (s.snow ? 1 : 0); }

/* ---------- Game flow ---------- */
function startNewGame(cfg) {
  const adult = defaultAdult(); adult.adultVerified = adultVerifiedGlobal === true;
  S = { player: newPlayer(cfg), quests: defaultQuests(), adult, enemies: [], projectiles: [], amuletOut: false, kills: 0, playSeconds: 0 };
  spawnWorldEnemies();
  mode = 'intro';
  $('intro-hero-line').textContent = `You are ${cfg.name}, a ${cfg.cls} — the last Emberbearer. Elder Mara is waiting for you in Ember Village.`;
  showScreen('screen-intro'); $('hud').classList.add('hidden');
  updateHUD(); return S;
}
function enterWorld() {
  mode = 'playing'; showScreen(null); $('hud').classList.remove('hidden');
  if ('ontouchstart' in window) $('touch-controls').classList.remove('hidden');
  toast(`Welcome to Ember Village, ${S.player.name}! Talk to Elder Mara 🧙‍♀️`);
  updateHUD();
}
function startNGPlus() {
  const p = S.player; p.ngPlus++; p.hp = p.maxHp; p.mp = p.maxMp; p.x = SPAWN.x; p.y = SPAWN.y;
  const keptAdult = validateAdult(S.adult); keptAdult.tavern = { state: 0, choice: null }; // NG+: relationships carry over, tavern dilemma resets
  S.quests = defaultQuests(); S.adult = keptAdult; adultVerifiedGlobal = keptAdult.adultVerified; S.projectiles = []; S.amuletOut = false;
  spawnWorldEnemies(); enterWorld();
  toast(`⭐ New Game+ ${p.ngPlus} — enemies are stronger. The shards have scattered again!`);
  EmberAudio.quest();
}

/* ---------- Save / load ---------- */
function saveGame() {
  if (!S) return false;
  try {
    const data = { player: S.player, quests: S.quests, kills: S.kills, savedAt: Date.now(),
      /* Adult flag only: a boolean + romance/quest progress. The birth year
         is NEVER included here (verifyAdult never stores it anywhere). */
      adult: validateAdult(S.adult),
      deadGuards: S.enemies.filter(e => e.guardShard && e.dead).map(e => e.guardShard),
      bossDead: S.quests.main.stage >= 3 };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data)); toast('💾 Game saved'); return true;
  } catch (e) { toast('Save failed: storage unavailable'); return false; }
}
function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY); if (!raw) return false;
    const d = JSON.parse(raw); if (!d || !d.player || !d.quests) return false;
    const adult = validateAdult(d.adult); // missing/corrupt -> adultVerified OFF
    adultVerifiedGlobal = adult.adultVerified;
    S = { player: d.player, quests: d.quests, adult, enemies: [], projectiles: [], amuletOut: d.quests.amulet.state === 1 && !d.quests.amulet.has, kills: d.kills || 0, playSeconds: 0 };
    spawnWorldEnemies();
    (d.deadGuards || []).forEach(id => { const g = S.enemies.find(e => e.guardShard === id); if (g) g.dead = true; });
    if (S.quests.main.stage === 2) spawnBoss();
    enterWorld(); toast(`Welcome back, ${S.player.name}!`); return true;
  } catch (e) { return false; }
}

/* ---------- Combat & progression ---------- */
function gainXP(n) {
  const p = S.player; p.xp += n;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext; p.level++; p.xpNext = Math.round(p.xpNext * 1.45);
    p.maxHp += 14; p.maxMp += 6; p.atk += 3; p.hp = p.maxHp; p.mp = p.maxMp;
    EmberAudio.levelup(); toast(`⭐ LEVEL UP! You are now level ${p.level}. HP/MP restored!`);
  }
}
function killEnemy(e) {
  if (e.dead) return; e.dead = true; e.respawnIn = 22; S.kills++;
  const p = S.player; const gold = e.goldMin + Math.floor(Math.random() * (e.goldMax - e.goldMin + 1));
  p.gold += gold; EmberAudio.coin();
  toast(`Defeated ${e.name}! +${e.xp} XP, +${gold} gold`); gainXP(e.xp);
  if (e.type === 'slime' && S.quests.slimes.state === 1) { S.quests.slimes.kills++; if (S.quests.slimes.kills >= S.quests.slimes.need) toast('🌾 Slime quest complete — return to Farmer Lio!'); }
  if (e.guardShard) toast(`${e.name} has fallen! The shard is unguarded — go claim it.`);
  if (e.type === 'boss') onBossDefeated();
  updateHUD();
}
function onBossDefeated() {
  S.quests.main.stage = 3;
  setTimeout(() => { if (mode === 'playing' || mode === 'dialogue') { mode = 'ending'; showScreen('screen-ending'); } }, 900);
}
function damagePlayer(amount) {
  if (!S || mode !== 'playing') return;
  const p = S.player; p.hp -= amount; EmberAudio.hurt();
  if (p.hp <= 0) { p.hp = 0; die(); }
  updateHUD();
}
function die() { mode = 'dead'; EmberAudio.die(); showScreen('screen-death'); }
function respawn() {
  const p = S.player; const lost = Math.floor(p.gold * 0.10); p.gold -= lost;
  p.hp = p.maxHp; p.mp = p.maxMp; p.x = SPAWN.x; p.y = SPAWN.y; S.projectiles = [];
  showScreen(null); mode = 'playing'; toast(`You wake in Ember Village. Lost ${lost} gold.`); updateHUD();
}
function playerAttack() {
  if (!S || mode !== 'playing') return false;
  const now = performance.now(), p = S.player, c = CLASSES[p.cls];
  if (now - lastAttack < c.cooldown) return false;
  if (c.mpCost && p.mp < c.mpCost) { toast('Not enough MP!'); return false; }
  lastAttack = now;
  if (c.mpCost) p.mp -= c.mpCost;
  const dmg = p.atk + p.atkBonus;
  if (c.projectile) {
    EmberAudio.shoot();
    S.projectiles.push({ x: p.x, y: p.y, vx: Math.cos(p.face) * 520, vy: Math.sin(p.face) * 520, dmg, life: c.range / 520, from: 'player' });
  } else {
    EmberAudio.attack(); let hitAny = false;
    S.enemies.forEach(e => {
      if (e.dead) return; const d = Math.hypot(e.x - p.x, e.y - p.y);
      let da = Math.atan2(e.y - p.y, e.x - p.x) - p.face; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      if (d <= c.range + e.r && Math.abs(da) < 1.25) { hitEnemy(e, dmg); hitAny = true; }
    });
    if (hitAny) EmberAudio.hit();
  }
  updateHUD(); return true;
}
function hitEnemy(e, dmg) {
  if (e.dead) return; e.hp -= dmg; EmberAudio.hit();
  if (e.hp <= 0) killEnemy(e); updateHUD();
}
function usePotion(kind) {
  if (!S) return false; const p = S.player;
  kind = kind || (p.hp / p.maxHp <= p.mp / p.maxMp ? 'hp' : 'mp');
  if (kind === 'elixir') { if (p.potions.elixir <= 0) { toast('No elixirs left'); return false; } p.potions.elixir--; p.hp = p.maxHp; p.mp = p.maxMp; }
  else if (kind === 'hp') { if (p.potions.hp <= 0) { toast('No health potions left — buy more at Bram\'s shop'); return false; } if (p.hp >= p.maxHp) { toast('HP already full'); return false; } p.potions.hp--; p.hp = Math.min(p.maxHp, p.hp + 50); }
  else { if (p.potions.mp <= 0) { toast('No mana potions left'); return false; } if (p.mp >= p.maxMp) { toast('MP already full'); return false; } p.potions.mp--; p.mp = Math.min(p.maxMp, p.mp + 40); }
  EmberAudio.potion(); toast('🧪 Potion used'); updateHUD(); return true;
}

/* ---------- Shop ---------- */
function buyItem(id) {
  const item = SHOP_ITEMS.find(i => i.id === id); if (!item || !S) return false;
  const p = S.player;
  if (p.gold < item.price) { toast(`Not enough gold! Need ${item.price}, you have ${p.gold}.`); EmberAudio.hit(); return false; }
  p.gold -= item.price;
  if (id === 'hp_potion') p.potions.hp++;
  else if (id === 'mp_potion') p.potions.mp++;
  else if (id === 'elixir') p.potions.elixir++;
  else if (id === 'sword_up') p.atkBonus += 4;
  EmberAudio.coin(); toast(`Bought ${item.name}!`); renderShop(); updateHUD(); return true;
}
function renderShop() {
  $('shop-gold').textContent = S.player.gold;
  $('shop-items').innerHTML = SHOP_ITEMS.map(i =>
    `<div class="shop-row"><span>${i.icon} <b>${i.name}</b> — ${i.desc}</span><button class="mini-btn" data-buy="${i.id}">Buy ${i.price}🪙</button></div>`).join('');
  $('shop-items').querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => buyItem(b.dataset.buy)));
}
function openShop() { mode = 'shop'; renderShop(); showScreen('screen-shop'); }
function closeShop() { showScreen(null); mode = 'playing'; }

/* ---------- Quests / shards ---------- */
function collectShard(id) {
  if (!S || S.quests.main.stage !== 1) return false;
  if (S.quests.main.shards[id]) return false; // double-collect guard
  const guard = S.enemies.find(e => e.guardShard === id);
  if (guard && !guard.dead) { toast(`The ${guard.name} still guards this shard! Defeat it first.`); return false; }
  S.quests.main.shards[id] = true; EmberAudio.pickup();
  const spot = SHARD_SPOTS.find(s => s.id === id);
  toast(`${spot.icon} You claimed the ${spot.name}! (${shardCount()}/3)`);
  if (shardCount() >= 3) { S.quests.main.stage = 2; spawnBoss(); toast('All shards claimed! The way to Malachar is open — Shadowlands, far south-east.'); }
  EmberAudio.quest(); updateHUD(); return true;
}
function pickupAmulet() {
  if (!S || S.quests.amulet.state !== 1 || S.quests.amulet.has) return false;
  S.quests.amulet.has = true; S.amuletOut = false; EmberAudio.pickup();
  toast('🧭 You found the Lost Amulet! Return it to Scout Renn.'); updateHUD(); return true;
}
function renderQuests() {
  const q = S.quests, sc = shardCount();
  const row = (t, st, d) => `<div class="quest-row"><b>${t}</b><span>${d}</span><span class="q-status">${st}</span></div>`;
  let h = '';
  h += row('🔥 The Shattered Ember (Main)', q.main.stage === 0 ? 'Not started — speak to Elder Mara' : q.main.stage === 1 ? `In progress — ${sc}/3 shards` : q.main.stage === 2 ? 'Boss unlocked — defeat Malachar!' : '✅ Complete', 'Collect the Verdant (Forest NW), Solar (Desert NE) and Frost (Snowfields SW) shards, then face Malachar in the Shadowlands (SE).');
  h += row('🌾 Slime Menace (Farmer Lio)', q.slimes.state === 0 ? 'Not started' : q.slimes.state === 1 ? `In progress — ${q.slimes.kills}/${q.slimes.need} slimes` : '✅ Complete', `Defeat ${q.slimes.need} slimes. Reward: 60 gold + potion.`);
  h += row('🧭 The Lost Amulet (Scout Renn)', q.amulet.state === 0 ? 'Not started' : q.amulet.state === 1 ? (q.amulet.has ? 'Amulet found — return to Renn' : 'In progress — search the Forest') : '✅ Complete', 'Find Renn\'s amulet in the Whispering Forest. Reward: 80 gold + elixir.');
  /* Adult entries are rendered ONLY when Adult Story Mode is verified ON.
     When OFF, no romance or tavern-dilemma text appears anywhere in the journal. */
  if (isAdultMode()) {
    const stageName = s => s === 0 ? 'Not started' : s === 1 ? 'Flirting — ask them on a date' : s === 2 ? 'Dating — one more date to go' : '💖 Partners';
    h += row('💖 Mira Vale, 29 — Tavern Keeper (Adult, 21+)', stageName(romanceStage('mira')), 'Adult-to-adult romance: meet, flirt, dates at the tavern and the lake. You can decline or end it at any time.');
    h += row('💖 Kael Thorn, 27 — Wandering Bard (Adult, 21+)', stageName(romanceStage('kael')), 'Adult-to-adult romance: meet, flirt, dates at the lake and the tavern. You can decline or end it at any time.');
    const tv = S.adult.tavern;
    h += row('⚖️ A Difficult Night at the Tavern (Adult, 21+)', tv.state === 0 ? 'Not started — talk to Mira' : tv.state === 1 ? 'In progress — decide what to do' : '✅ Complete', 'A mature moral dilemma: a patron who has had too much to drink. Your choice has consequences.');
  }
  $('quest-list').innerHTML = h;
}
function openQuests() { if (mode !== 'playing') return; mode = 'quests'; renderQuests(); showScreen('screen-quests'); }
function closeQuests() { showScreen(null); mode = 'playing'; }

/* ---------- Dialogue & interaction ---------- */
function showDialogue(name, text, actions) {
  mode = 'dialogue'; $('dlg-name').textContent = name; $('dlg-text').textContent = text;
  const box = $('dlg-actions'); box.innerHTML = '';
  (actions && actions.length ? actions : [{ label: 'Close', fn: closeDialogue }]).forEach(a => {
    const b = document.createElement('button'); b.className = 'mini-btn'; b.textContent = a.label;
    b.addEventListener('click', a.fn); box.appendChild(b);
  });
  $('dialogue').classList.remove('hidden');
}
function closeDialogue() { $('dialogue').classList.add('hidden'); if (mode === 'dialogue') mode = 'playing'; }
/* Romanceable adults: explicit adult ages stated in-story, no ambiguity.
   All text below is tasteful and non-graphic; intimate beats are
   "fade to black" only. Nothing here is reachable unless isAdultMode(). */
const ROMANCE = {
  mira: { age: 29, short: 'Mira',
    neutral: 'Welcome to the tavern. Warm food, a seat by the fire, and no rush — that is what we offer here. Rest a while, traveller.',
    meet: 'I am Mira Vale, 29 years old, keeper of this tavern. I have poured drinks for heroes and farmers alike, and I can usually tell a good soul from a bad one in a single conversation. You seem like the former.',
    flirted: 'You have a way with words, Emberbearer. If you are asking me properly — yes, I would like to spend an evening with you. The tavern, after closing, is quiet and warm.',
    dated: 'That evening at the tavern was lovely. One more, somewhere quieter? There is a lakeside clearing north of the village where the water catches the evening light.',
    partner: 'You and I — we understand each other. Whatever the road brings, you will always have a warm seat waiting for you here, and my company, whenever you want it.',
    date1Label: '🍷 Tavern date', date2Label: '🌙 Lakeside evening',
    fade: 'The evening draws to a close, soft and unhurried. The scene fades to black. Later, you part with a warm goodnight — closer than before, and happy to have taken your time.' },
  kael: { age: 27, short: 'Kael',
    neutral: 'Ah, a traveller! Sit, sit — every road deserves a song. I will sing you one of the village, free of charge, and you can tell me if I got the chorus right.',
    meet: 'Kael Thorn, 27, wandering bard, at your service. I have sung in a dozen villages and loved none of them quite like this one. You carry yourself like someone with a story worth a song.',
    flirted: 'Well now — a hero who listens. I like that. If you mean it, meet me by the lake at dusk. I will bring a song; you bring yourself. That is all a first date needs.',
    dated: 'That lakeside evening is already one of my favourite songs, and it has no ending yet. Shall we follow it with an evening at the tavern — food, music, and no audience but us?',
    partner: 'You are my favourite verse, Emberbearer. Wherever the road takes you, my songs will follow — and so will I, whenever you ask.',
    date1Label: '🌙 Lakeside date', date2Label: '🍷 Tavern evening',
    fade: 'The music softens, the evening draws to a close, and the scene fades to black. Later, you part with a warm goodnight — closer than before, and glad you took it slowly.' }
};
function talkToRomance(npc) {
  const key = npc.id, R = ROMANCE[key], p = S.player;
  if (!isAdultMode()) {
    /* OFF / unverified: only a neutral, non-romantic greeting. No flirt,
       date, romance or dilemma option is offered or mentioned. */
    showDialogue(npc.name, R.neutral, [{ label: 'Close', fn: closeDialogue }]);
    updateHUD(); return true;
  }
  const stage = romanceStage(key), tv = S.adult.tavern;
  const dilemmaBtn = (key === 'mira' && tv.state === 0) ? [{ label: '⚖️ Help with a tavern dilemma', fn: () => {
    showDialogue('Mira Vale — A Difficult Night', 'A regular here has had far too much to drink, owes coin he cannot pay, and wants to gamble it back. He is a good man on a bad night, and I cannot decide for him. Will you help me decide what to do?', [
      { label: '✅ Accept — help decide', fn: () => { startTavernQuest(); closeDialogue(); } },
      { label: 'Not now', fn: closeDialogue }]);
  } }] : [];
  const endBtn = stage > 0 ? [{ label: '💔 End this romance', fn: () => endRomance(key) }] : [];
  if (key === 'mira' && tv.state === 1) {
    /* Tavern dilemma decision — offered on talking to Mira while it is active. */
    showDialogue('Mira Vale — A Difficult Night', 'He is still here, and the night is getting late. What should we do? Every choice has a consequence — choose like an adult, not like a hero in a hurry.', [
      { label: '🚶 Walk him home safely', fn: () => { completeTavernQuest('home'); closeDialogue(); } },
      { label: '💧 Refuse more drinks, offer water and food', fn: () => { completeTavernQuest('refuse'); closeDialogue(); } },
      { label: '🎲 Look away and let him gamble', fn: () => { completeTavernQuest('ignore'); closeDialogue(); } },
      { label: 'Decide later', fn: closeDialogue }]);
    updateHUD(); return true;
  }
  if (stage === 0) {
    showDialogue(npc.name, R.meet, [
      { label: `💬 Flirt with ${R.short}`, fn: () => { S.adult.romances[key] = 1; EmberAudio.quest(); toast(`💖 ${R.short} smiles — you are getting to know each other.`); closeDialogue(); updateHUD(); } },
      ...dilemmaBtn,
      { label: 'Just chatting', fn: closeDialogue }]);
  } else if (stage === 1) {
    showDialogue(npc.name, R.flirted, [
      { label: R.date1Label, fn: () => { S.adult.romances[key] = 2; EmberAudio.quest(); toast(`💖 A lovely date with ${R.short}.`); closeDialogue(); updateHUD(); } },
      ...dilemmaBtn, ...endBtn,
      { label: 'Not yet', fn: closeDialogue }]);
  } else if (stage === 2) {
    showDialogue(npc.name, R.dated, [
      { label: R.date2Label, fn: () => {
        S.adult.romances[key] = 3;
        if (!S.adult.rewarded[key]) { S.adult.rewarded[key] = true; p.gold += 120; p.potions.elixir++; EmberAudio.coin(); toast(`💖 You and ${R.short} are partners now. +120 gold, +1 elixir.`); }
        else toast(`💖 You and ${R.short} are partners again.`);
        showDialogue(npc.name, R.fade, [{ label: 'Continue', fn: closeDialogue }]); updateHUD(); } },
      ...dilemmaBtn, ...endBtn,
      { label: 'Not yet', fn: closeDialogue }]);
  } else {
    showDialogue(npc.name, R.partner, [
      { label: '💖 Spend time together', fn: () => { toast(`💖 A quiet, happy evening with ${R.short}.`); closeDialogue(); } },
      ...dilemmaBtn, ...endBtn,
      { label: 'Close', fn: closeDialogue }]);
  }
  updateHUD(); return true;
}
function talkTo(npc) {
  if (!npc || !S) return false;
  if (npc.role === 'romance_mira' || npc.role === 'romance_kael') return talkToRomance(npc);
  const q = S.quests, p = S.player;
  if (npc.role === 'elder') {
    if (q.main.stage === 0) showDialogue(npc.name, 'The Ember Crystal is shattered, child. Three shards lie guarded across the Forest, the Desert and the Snowfields. Claim them all, and the Ashen King\'s seal will break. Will you carry this burden?', [
      { label: '✅ Accept the quest', fn: () => { q.main.stage = 1; EmberAudio.quest(); toast('📜 Main quest started: The Shattered Ember'); closeDialogue(); updateHUD(); } },
      { label: 'Not yet', fn: closeDialogue }]);
    else if (q.main.stage === 1) showDialogue(npc.name, `You hold ${shardCount()} of 3 shards. Forest to the north-west, Desert to the north-east, Snowfields to the south-west. Each shard has a guardian — come prepared, and keep potions handy.`, [{ label: 'Close', fn: closeDialogue }]);
    else if (q.main.stage === 2) showDialogue(npc.name, 'All three shards sing together — the seal is broken! Malachar waits in the Shadowlands, far to the south-east. End this.', [{ label: 'Close', fn: closeDialogue }]);
    else showDialogue(npc.name, 'You did it. The lanterns burn bright because of you, Emberbearer.', [{ label: 'Close', fn: closeDialogue }]);
  } else if (npc.role === 'shop') {
    showDialogue(npc.name, 'Welcome to Bram\'s! Potions, elixirs, and the finest sharpening stones this side of the desert.', [
      { label: '🛒 Browse the shop', fn: () => { closeDialogue(); openShop(); } }, { label: 'Just looking', fn: closeDialogue }]);
  } else if (npc.role === 'side_slimes') {
    if (q.slimes.state === 0) showDialogue(npc.name, 'Slimes ate half my crop! Squash 5 of the blighters — they bounce around the village edges and the forest — and I\'ll pay you 60 gold and a potion.', [
      { label: '✅ Accept', fn: () => { q.slimes.state = 1; EmberAudio.quest(); closeDialogue(); updateHUD(); } }, { label: 'Decline', fn: closeDialogue }]);
    else if (q.slimes.state === 1 && q.slimes.kills >= q.slimes.need) showDialogue(npc.name, 'Ha! Serves them right. Here — 60 gold and a fresh potion, as promised.', [
      { label: '🎁 Claim reward', fn: () => { q.slimes.state = 2; p.gold += 60; p.potions.hp++; EmberAudio.coin(); closeDialogue(); updateHUD(); } }]);
    else if (q.slimes.state === 1) showDialogue(npc.name, `You've squashed ${q.slimes.kills} of 5 slimes. Keep at it!`, [{ label: 'Close', fn: closeDialogue }]);
    else showDialogue(npc.name, 'My crops have never looked better. Thank you!', [{ label: 'Close', fn: closeDialogue }]);
  } else if (npc.role === 'side_amulet') {
    if (q.amulet.state === 0) showDialogue(npc.name, 'I dropped my lucky amulet scouting the Whispering Forest — north-west of here, off the path. Find it and I\'ll give you 80 gold and an Ember Elixir.', [
      { label: '✅ Accept', fn: () => { q.amulet.state = 1; S.amuletOut = true; EmberAudio.quest(); closeDialogue(); updateHUD(); } }, { label: 'Decline', fn: closeDialogue }]);
    else if (q.amulet.state === 1 && q.amulet.has) showDialogue(npc.name, 'That\'s it! My amulet! You\'re a true friend of the road. Take this — you\'ve earned it.', [
      { label: '🎁 Claim reward', fn: () => { q.amulet.state = 2; q.amulet.has = false; p.gold += 80; p.potions.elixir++; EmberAudio.coin(); closeDialogue(); updateHUD(); } }]);
    else if (q.amulet.state === 1) showDialogue(npc.name, 'No luck yet? Search the Forest, north-west. It glints gold — you can\'t miss it once you\'re close.', [{ label: 'Close', fn: closeDialogue }]);
    else showDialogue(npc.name, 'The amulet shines again, thanks to you.', [{ label: 'Close', fn: closeDialogue }]);
  } else if (npc.role === 'healer') {
    showDialogue(npc.name, 'Sit, rest. The Ember\'s warmth mend your wounds — free, always.', [
      { label: '💖 Heal fully (free)', fn: () => { p.hp = p.maxHp; p.mp = p.maxMp; EmberAudio.potion(); toast('Fully healed!'); closeDialogue(); updateHUD(); } }, { label: 'Close', fn: closeDialogue }]);
  }
  updateHUD(); return true;
}
function nearestInteractable() {
  if (!S) return null; const p = S.player;
  for (const n of NPCS) if (Math.hypot(n.x - p.x, n.y - p.y) < 78) return { kind: 'npc', npc: n };
  for (const s of SHARD_SPOTS) if (!S.quests.main.shards[s.id] && Math.hypot(s.x - p.x, s.y - p.y) < 72) return { kind: 'shard', spot: s };
  if (S.amuletOut && Math.hypot(AMULET_SPOT.x - p.x, AMULET_SPOT.y - p.y) < 66) return { kind: 'amulet' };
  return null;
}
function doInteract() {
  const t = nearestInteractable(); if (!t) return false;
  if (t.kind === 'npc') return talkTo(t.npc);
  if (t.kind === 'shard') return collectShard(t.spot.id);
  if (t.kind === 'amulet') return pickupAmulet();
  return false;
}

/* ---------- Movement, collision, update ---------- */
function collides(x, y, r) {
  if (x < r || y < r || x > WORLD.W - r || y > WORLD.H - r) return true;
  for (const pr of PROPS) { if (!pr.solid) continue; if (x + r > pr.x - pr.w / 2 && x - r < pr.x + pr.w / 2 && y + r > pr.y - pr.h / 2 && y - r < pr.y + pr.h / 2) return true; }
  return false;
}
function tryMove(dt) {
  const p = S.player; let dx = joyVec.x, dy = joyVec.y;
  if (keys['arrowup'] || keys['w']) dy -= 1; if (keys['arrowdown'] || keys['s']) dy += 1;
  if (keys['arrowleft'] || keys['a']) dx -= 1; if (keys['arrowright'] || keys['d']) dx += 1;
  const len = Math.hypot(dx, dy); if (!len) return;
  dx /= Math.max(1, len); dy /= Math.max(1, len);
  p.face = Math.atan2(dy, dx);
  const nx = p.x + dx * p.speed * dt, ny = p.y + dy * p.speed * dt;
  if (!collides(nx, p.y, p.r)) p.x = nx;
  if (!collides(p.x, ny, p.r)) p.y = ny;
}
function update(dt) {
  if (!S || mode !== 'playing') return;
  S.playSeconds += dt; tryMove(dt);
  const p = S.player;
  p.mp = Math.min(p.maxMp, p.mp + 3.2 * dt); // slow mana regen
  // enemies
  S.enemies.forEach(e => {
    if (e.dead) { if (e.respawns) { e.respawnIn -= dt; if (e.respawnIn <= 0) { e.dead = false; e.hp = e.maxHp; e.x = e.homeX; e.y = e.homeY; } } return; }
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    e.atkCd -= dt;
    if (d < 340 && d > e.r + p.r - 2) { const a = Math.atan2(p.y - e.y, p.x - e.x); const nx = e.x + Math.cos(a) * e.speed * dt, ny = e.y + Math.sin(a) * e.speed * dt; if (!collides(nx, ny, e.r)) { e.x = nx; e.y = ny; } }
    else if (d <= e.r + p.r + 4 && e.atkCd <= 0) { e.atkCd = 0.9; damagePlayer(e.dmg); }
  });
  // projectiles
  S.projectiles = S.projectiles.filter(pr => {
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
    if (pr.life <= 0 || collides(pr.x, pr.y, 4)) return false;
    for (const e of S.enemies) { if (!e.dead && Math.hypot(e.x - pr.x, e.y - pr.y) < e.r + 6) { hitEnemy(e, pr.dmg); return false; } }
    return true;
  });
  const t = nearestInteractable();
  $('interact-prompt').classList.toggle('hidden', !t);
  if (t) $('interact-prompt').innerHTML = t.kind === 'npc' ? `Press <b>E</b> — talk to ${t.npc.name}` : t.kind === 'shard' ? `Press <b>E</b> — claim the ${t.spot.name}` : 'Press <b>E</b> — pick up the Lost Amulet';
  updateHUD();
}

/* ---------- Rendering ---------- */
function hash2(x, y) { let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); }
function render() {
  if (!ctx || !S) return;
  const W = canvas.width, H = canvas.height, p = S.player;
  const camX = Math.max(0, Math.min(WORLD.W - W, p.x - W / 2)), camY = Math.max(0, Math.min(WORLD.H - H, p.y - H / 2));
  const t0 = Math.floor(camX / WORLD.TILE), t1 = Math.ceil((camX + W) / WORLD.TILE), u0 = Math.floor(camY / WORLD.TILE), u1 = Math.ceil((camY + H) / WORLD.TILE);
  for (let ty = u0; ty <= u1; ty++) for (let tx = t0; tx <= t1; tx++) {
    const wx = tx * WORLD.TILE + 32, wy = ty * WORLD.TILE + 32, b = getBiome(wx, wy);
    ctx.fillStyle = BIOME_COLORS[b][(tx + ty) % 2]; ctx.fillRect(tx * WORLD.TILE - camX, ty * WORLD.TILE - camY, WORLD.TILE, WORLD.TILE);
    if (hash2(tx, ty) > 0.82) { ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(tx * WORLD.TILE - camX + 12, ty * WORLD.TILE - camY + 20, 9, 5); }
  }
  // village plaza
  ctx.fillStyle = '#c2a878'; ctx.fillRect(VILLAGE.x + 380 - camX, VILLAGE.y + 300 - camY, 220, 220);
  // boss seal barrier (locked)
  if (S.quests.main.stage < 2 && S.quests.main.stage !== 3) { ctx.strokeStyle = 'rgba(200,60,255,0.85)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(BOSS_SPOT.x - camX, BOSS_SPOT.y - camY, 120, 0, 7); ctx.stroke(); ctx.fillStyle = '#e8c8ff'; ctx.font = '13px Georgia'; ctx.textAlign = 'center'; ctx.fillText('🔒 Sealed — 3 shards required', BOSS_SPOT.x - camX, BOSS_SPOT.y - camY - 130); }
  // amulet
  if (S.amuletOut) { ctx.font = '26px serif'; ctx.textAlign = 'center'; ctx.fillText('✨', AMULET_SPOT.x - camX, AMULET_SPOT.y - camY + 8); ctx.font = '11px Georgia'; ctx.fillStyle = '#ffe9b0'; ctx.fillText('Lost Amulet', AMULET_SPOT.x - camX, AMULET_SPOT.y - camY + 26); }
  // shards
  SHARD_SPOTS.forEach(s => { if (S.quests.main.shards[s.id]) return; const gx = s.x - camX, gy = s.y - camY; const pulse = 16 + Math.sin(Date.now() / 300) * 4; ctx.fillStyle = 'rgba(255,255,180,0.30)'; ctx.beginPath(); ctx.arc(gx, gy, pulse + 14, 0, 7); ctx.fill(); ctx.font = '30px serif'; ctx.textAlign = 'center'; ctx.fillText(s.icon, gx, gy + 10); ctx.font = '12px Georgia'; ctx.fillStyle = '#fff'; ctx.fillText(s.name, gx, gy + 32); });
  // props in view
  PROPS.forEach(pr => {
    const x = pr.x - camX, y = pr.y - camY; if (x < -80 || y < -80 || x > W + 80 || y > H + 80) return;
    ctx.textAlign = 'center';
    if (pr.kind === 'house' || pr.kind === 'hall') { ctx.fillStyle = '#8d6e63'; ctx.fillRect(x - pr.w / 2, y - pr.h / 2, pr.w, pr.h); ctx.fillStyle = '#b03a2e'; ctx.beginPath(); ctx.moveTo(x - pr.w / 2 - 8, y - pr.h / 2); ctx.lineTo(x, y - pr.h / 2 - 34); ctx.lineTo(x + pr.w / 2 + 8, y - pr.h / 2); ctx.fill(); ctx.fillStyle = '#3e2723'; ctx.fillRect(x - 13, y + pr.h / 2 - 38, 26, 38); ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Georgia'; ctx.fillText(pr.label || '', x, y - pr.h / 2 - 42); }
    else if (pr.kind === 'tree') { ctx.fillStyle = '#6d4c41'; ctx.fillRect(x - 4, y, 8, 16); ctx.fillStyle = '#1e8449'; ctx.beginPath(); ctx.arc(x, y - 8, 20, 0, 7); ctx.arc(x - 13, y + 2, 13, 0, 7); ctx.arc(x + 13, y + 2, 13, 0, 7); ctx.fill(); }
    else if (pr.kind === 'pine') { ctx.fillStyle = '#eaf2f8'; ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x - 16, y + 12); ctx.lineTo(x + 16, y + 12); ctx.fill(); ctx.fillStyle = '#6d4c41'; ctx.fillRect(x - 3, y + 12, 6, 9); }
    else if (pr.kind === 'cactus') { ctx.fillStyle = '#229954'; ctx.fillRect(x - 5, y - 22, 10, 34); ctx.fillRect(x - 14, y - 12, 8, 16); ctx.fillRect(x + 6, y - 16, 8, 18); }
    else if (pr.kind === 'dead') { ctx.strokeStyle = '#4a235a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y + 14); ctx.lineTo(x, y - 20); ctx.moveTo(x, y - 8); ctx.lineTo(x - 12, y - 20); ctx.moveTo(x, y - 12); ctx.lineTo(x + 11, y - 24); ctx.stroke(); }
    else if (pr.kind === 'rock') { ctx.fillStyle = '#7f8c8d'; ctx.beginPath(); ctx.arc(x, y, 13, 0, 7); ctx.fill(); }
    else { ctx.fillStyle = ['#e91e63', '#f1c40f', '#fff'][Math.floor(hash2(pr.x, pr.y) * 3)]; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); }
  });
  // NPCs
  NPCS.forEach(n => { const x = n.x - camX, y = n.y - camY; if (x < -50 || y < -50 || x > W + 50 || y > H + 50) return; ctx.fillStyle = n.color; ctx.beginPath(); ctx.arc(x, y, 17, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.font = '18px serif'; ctx.textAlign = 'center'; ctx.fillText(n.icon, x, y + 6); ctx.font = 'bold 12px Georgia'; ctx.fillStyle = '#fff'; ctx.fillText(n.name, x, y - 26); ctx.fillStyle = '#ffe9b0'; ctx.font = '15px serif'; ctx.fillText('!', x, y - 38); });
  // enemies
  S.enemies.forEach(e => { if (e.dead) return; const x = e.x - camX, y = e.y - camY; if (x < -60 || y < -60 || x > W + 60 || y > H + 60) return; ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(x, y, e.r, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke(); ctx.font = `${Math.round(e.r * 1.15)}px serif`; ctx.textAlign = 'center'; ctx.fillText(e.icon, x, y + e.r * 0.45); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 22, y - e.r - 13, 44, 6); ctx.fillStyle = '#e74c3c'; ctx.fillRect(x - 22, y - e.r - 13, 44 * Math.max(0, e.hp / e.maxHp), 6); if (e.type === 'boss' || e.guardShard) { ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Georgia'; ctx.fillText(e.name, x, y - e.r - 20); } });
  // projectiles
  ctx.fillStyle = '#ffd54f'; S.projectiles.forEach(pr => { ctx.beginPath(); ctx.arc(pr.x - camX, pr.y - camY, 5, 0, 7); ctx.fill(); });
  // player
  const px = p.x - camX, py = p.y - camY;
  ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(px, py, p.r, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.font = '19px serif'; ctx.textAlign = 'center'; ctx.fillText(p.icon, px, py + 7);
  ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(p.face) * (p.r + 10), py + Math.sin(p.face) * (p.r + 10)); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Georgia'; ctx.fillText(p.name, px, py - p.r - 9);
  // biome banner data stored for external display
  canvas.dataset.biome = getBiome(p.x, p.y);
}
function drawMinimap() {
  if (!mmCtx || !S) return; const sx = mm.width / WORLD.W, sy = mm.height / WORLD.H;
  mmCtx.fillStyle = '#2d5a27'; mmCtx.fillRect(0, 0, mm.width, mm.height * 1400 / WORLD.H);
  mmCtx.fillStyle = '#d9b36c'; mmCtx.fillRect(mm.width / 2, 0, mm.width / 2, mm.height * 1400 / WORLD.H);
  mmCtx.fillStyle = '#dfe9f2'; mmCtx.fillRect(0, mm.height * 1400 / WORLD.H, mm.width / 2, mm.height);
  mmCtx.fillStyle = '#3a2b4a'; mmCtx.fillRect(mm.width / 2, mm.height * 1400 / WORLD.H, mm.width / 2, mm.height);
  mmCtx.fillStyle = '#6aa84f'; mmCtx.fillRect(VILLAGE.x * sx, VILLAGE.y * sy, VILLAGE.w * sx, VILLAGE.h * sy);
  SHARD_SPOTS.forEach(s => { if (!S.quests.main.shards[s.id]) { mmCtx.fillStyle = '#ffeb3b'; mmCtx.fillRect(s.x * sx - 2, s.y * sy - 2, 4, 4); } });
  if (S.quests.main.stage === 2) { mmCtx.fillStyle = '#ff1744'; mmCtx.fillRect(BOSS_SPOT.x * sx - 3, BOSS_SPOT.y * sy - 3, 6, 6); }
  mmCtx.fillStyle = '#fff'; mmCtx.beginPath(); mmCtx.arc(S.player.x * sx, S.player.y * sy, 3.2, 0, 7); mmCtx.fill();
}
function loop(ts) {
  const dt = Math.min(0.05, (ts - lastTime) / 1000 || 0); lastTime = ts;
  if (mode === 'playing') { update(dt); render(); mmTimer += dt; if (mmTimer > 0.2) { mmTimer = 0; drawMinimap(); } }
  requestAnimationFrame(loop);
}

/* ---------- Pause ---------- */
function pauseGame() { if (mode !== 'playing') return; mode = 'paused'; showScreen('screen-pause'); }
function resumeGame() { if (mode !== 'paused') return; showScreen(null); mode = 'playing'; }
function quitToTitle() {
  showScreen('screen-title'); mode = 'title'; $('hud').classList.add('hidden'); $('touch-controls').classList.add('hidden');
  $('btn-continue').classList.toggle('hidden', !hasSave()); closeDialogue();
}

/* ---------- Input ---------- */
document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase(); keys[k] = true;
  if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
  if (mode === 'playing') {
    if (k === ' ' || k === 'j') playerAttack();
    if (k === 'e') doInteract();
    if (k === 'h') usePotion('hp');
    if (k === 'q') openQuests();
    if (k === 'escape' || k === 'p') pauseGame();
  } else if (mode === 'paused' && (k === 'escape' || k === 'p')) resumeGame();
  else if (mode === 'quests' && (k === 'q' || k === 'escape')) closeQuests();
  else if (mode === 'dialogue' && k === 'escape') closeDialogue();
  else if (mode === 'adult' && k === 'escape') closeAdultGate();
});
document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
function canvasPos(ev) { const r = canvas.getBoundingClientRect(); const cx = (ev.touches ? ev.touches[0].clientX : ev.clientX), cy = (ev.touches ? ev.touches[0].clientY : ev.clientY); return { x: (cx - r.left) * canvas.width / r.width, y: (cy - r.top) * canvas.height / r.height }; }
canvas.addEventListener('mousemove', e => { mouse = canvasPos(e); if (S && mode === 'playing') { const p = S.player; const camX = Math.max(0, Math.min(WORLD.W - canvas.width, p.x - canvas.width / 2)), camY = Math.max(0, Math.min(WORLD.H - canvas.height, p.y - canvas.height / 2)); p.face = Math.atan2(mouse.y + camY - p.y, mouse.x + camX - p.x); } });
canvas.addEventListener('mousedown', e => { if (mode === 'playing') { canvas.dispatchEvent(new MouseEvent('mousemove', e)); playerAttack(); } });
canvas.addEventListener('touchstart', e => { if (mode === 'playing' && e.target === canvas) e.preventDefault(); }, { passive: false });

/* Touch joystick */
(function wireJoystick() {
  const joy = $('joystick'), knob = $('joy-knob'); if (!joy) return; let active = null;
  function setFromEvent(e) {
    const r = joy.getBoundingClientRect(), t = e.touches ? [...e.touches].find(x => x.identifier === active) : e; if (!t) return;
    let dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    joyVec = { x: dx, y: dy }; knob.style.left = (32 + dx * 30) + 'px'; knob.style.top = (32 + dy * 30) + 'px';
  }
  joy.addEventListener('touchstart', e => { active = e.changedTouches[0].identifier; setFromEvent(e); e.preventDefault(); }, { passive: false });
  joy.addEventListener('touchmove', e => { setFromEvent(e); e.preventDefault(); }, { passive: false });
  const end = () => { active = null; joyVec = { x: 0, y: 0 }; knob.style.left = '32px'; knob.style.top = '32px'; };
  joy.addEventListener('touchend', end); joy.addEventListener('touchcancel', end);
  joy.addEventListener('mousedown', e => { active = 'mouse'; setFromEvent(e); });
  document.addEventListener('mousemove', e => { if (active === 'mouse') setFromEvent(e); });
  document.addEventListener('mouseup', () => { if (active === 'mouse') end(); });
})();
function bindTap(id, fn) { const el = $(id); if (!el) return; el.addEventListener('click', fn); el.addEventListener('touchend', e => { e.preventDefault(); fn(); }, { passive: false }); }
bindTap('touch-attack', () => playerAttack());
bindTap('touch-interact', () => doInteract());
bindTap('touch-potion', () => usePotion('hp'));

/* ---------- UI wiring ---------- */
function pickIn(containerId, attr, cb) { $(containerId).querySelectorAll('[data-' + attr + ']').forEach(b => b.addEventListener('click', () => { $(containerId).querySelectorAll('[data-' + attr + ']').forEach(x => x.classList.remove('selected')); b.classList.add('selected'); cb(b.dataset[attr]); })); }
pickIn('cc-classes', 'class', v => selClass = v);
pickIn('cc-colors', 'color', v => selColor = v);
pickIn('cc-difficulty', 'diff', v => selDiff = v);
$('btn-new').addEventListener('click', () => { showScreen('screen-create'); mode = 'create'; });
$('btn-how').addEventListener('click', () => showScreen('screen-how'));
document.querySelectorAll('[data-back-title]').forEach(b => b.addEventListener('click', quitToTitle));
$('btn-continue').addEventListener('click', () => { if (!loadGame()) toast('No save found'); });
$('btn-start').addEventListener('click', () => {
  const name = $('cc-name').value.trim() || 'Emberbearer';
  $('cc-name').value = name;
  startNewGame({ name, cls: selClass, color: selColor, diff: selDiff });
});
$('btn-intro-go').addEventListener('click', enterWorld);
$('btn-respawn').addEventListener('click', respawn);
$('btn-pause').addEventListener('click', pauseGame);
$('btn-resume').addEventListener('click', resumeGame);
$('btn-save').addEventListener('click', () => { saveGame(); });
$('btn-quit-title').addEventListener('click', quitToTitle);
$('btn-adult-title').addEventListener('click', openAdultGate);
$('btn-adult-pause').addEventListener('click', openAdultGate);
$('btn-adult-enable').addEventListener('click', () => {
  const year = $('adult-birth-year').value, confirmed = $('adult-confirm').checked;
  if (verifyAdult(year, confirmed)) { toast('🔞 Adult Story Mode enabled (21+).'); }
  else { $('adult-status').textContent = 'Locked: enter a birth year that makes you 21 or older AND tick "I am 21 or older". Nothing was enabled and nothing was saved.'; }
});
$('btn-adult-disable').addEventListener('click', () => { disableAdultMode(); toast('Adult Story Mode turned off.'); });
$('btn-adult-close').addEventListener('click', closeAdultGate);
$('btn-quests').addEventListener('click', openQuests);
$('btn-quests-close').addEventListener('click', closeQuests);
$('btn-shop-close').addEventListener('click', closeShop);
$('btn-potion').addEventListener('click', () => usePotion('hp'));
function toggleSound() { const on = EmberAudio.toggle(); toast(on ? '🔊 Sound on' : '🔇 Sound off'); $('btn-sound').textContent = on ? '🔊 Sound' : '🔇 Sound'; }
$('btn-sound').addEventListener('click', toggleSound);
$('btn-sound2').addEventListener('click', toggleSound);
$('btn-credits').addEventListener('click', () => {
  mode = 'credits'; showScreen('screen-credits');
  $('credits-hero').textContent = `${S.player.name}, the ${S.player.cls} of Ember Village`;
  const sc = $('credits-scroll'); sc.classList.remove('scrolling'); void sc.offsetWidth; sc.classList.add('scrolling');
});
$('btn-freeroam').addEventListener('click', () => { showScreen(null); mode = 'playing'; toast('🗺️ Free-roam — the world is yours.'); });
$('btn-ngplus').addEventListener('click', startNGPlus);

/* ---------- Boot ---------- */
$('btn-continue').classList.toggle('hidden', !hasSave());
if (typeof requestAnimationFrame === 'function') requestAnimationFrame(loop);

/* Test / automation hooks (also handy for debugging in the console). */
window.__EMBERFALL__ = {
  get state() { return S; }, get mode() { return mode; },
  setMode: m => { mode = m; },
  classes: CLASSES, difficulties: DIFF,
  newPlayer, defaultQuests, startNewGame, enterWorld, startNGPlus,
  saveGame, loadGame, hasSave, SAVE_KEY,
  talkTo, buyItem, usePotion, playerAttack, hitEnemy, killEnemy, damagePlayer, die, respawn,
  collectShard, pickupAmulet, shardCount, doInteract, nearestInteractable,
  pauseGame, resumeGame, quitToTitle, openShop, closeShop, openQuests, closeQuests,
  collides, getBiome, tryMove, setKeys: k => { keys = Object.assign({}, k); }, setJoy: v => { joyVec = v; },
  spawnBoss, gainXP, update, render, drawMinimap, NPCS_ref: NPCS, SHOP_ITEMS_ref: SHOP_ITEMS,
  verifyAdult, adultAgeOk, isAdultMode, disableAdultMode, openAdultGate, closeAdultGate,
  romanceStage, endRomance, startTavernQuest, completeTavernQuest, defaultAdult, validateAdult
};
})();
