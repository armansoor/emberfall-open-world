'use strict';
/* Emberfall — scripted end-to-end playthrough tests (Node + jsdom + canvas mock).
   Run: NODE_PATH=/path/to/node_modules node tests/e2e.js   (requires the `jsdom` package) */
const fs = require('fs'), path = require('path');
let JSDOM; try { ({ JSDOM } = require('jsdom')); } catch (e) { ({ JSDOM } = require('/tmp/ef-test/node_modules/jsdom')); }
const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0; const failures = [];
function check(name, cond) { if (cond) { passed++; console.log('PASS  ' + name); } else { failed++; failures.push(name); console.log('FAIL  ' + name); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function ctxStub() {
  return { fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '',
    fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
    fillText() {}, strokeText() {}, measureText() { return { width: 0 }; },
    moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {}, clearRect() {} };
}
function fresh() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.HTMLCanvasElement.prototype.getContext = function () { return this.__stub || (this.__stub = ctxStub()); };
  // Concatenate: browsers share one global lexical scope across <script> tags;
  // separate jsdom eval() calls would isolate each file's top-level consts.
  const bundle = ['js/audio.js', 'js/world.js', 'js/game.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
  w.eval(bundle);
  return { dom, w, E: w.__EMBERFALL__, $: id => w.document.getElementById(id) };
}
function play(w, E, $, cfg) { E.startNewGame(cfg || { name: 'Tester', cls: 'Knight', color: '#e74c3c', diff: 'Normal' }); E.enterWorld(); return E.state; }
function near(E, x, y) { E.state.player.x = x; E.state.player.y = y; }

(async function main() {
  /* --- static file references --- */
  {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="(?!data:|http)([^"]+)"/g)].map(m => m[1]);
    check('static: all local file references exist', refs.length >= 4 && refs.every(r => fs.existsSync(path.join(ROOT, r))));
  }
  /* --- title / continue with no save, empty-name default --- */
  {
    const { w, E, $ } = fresh();
    check('title: Continue hidden when no save exists', $('btn-continue').classList.contains('hidden') && !E.hasSave());
    check('edge: loadGame with no save returns false gracefully', E.loadGame() === false);
    $('btn-new').click(); $('cc-name').value = '   '; $('btn-start').click();
    check('edge: empty character name defaults to Emberbearer', E.state.player.name === 'Emberbearer');
    check('flow: intro screen shows after creation', !$('screen-intro').classList.contains('hidden'));
    E.enterWorld(); check('flow: entering world sets playing mode', E.mode === 'playing');
    w.close();
  }
  /* --- all 3 classes --- */
  for (const cls of ['Knight', 'Mage', 'Ranger']) {
    const { w, E } = fresh(); const S = play(w, E, null, { name: 'T', cls, color: '#3498db', diff: 'Normal' });
    const base = E.classes[cls];
    check(`class ${cls}: stats applied (HP ${base.hp})`, S.player.maxHp === base.hp && S.player.cls === cls);
    if (base.projectile) {
      const before = S.player.mp; const ok = E.playerAttack();
      check(`class ${cls}: ranged attack fires projectile & costs MP correctly`, ok && S.projectiles.length === 1 && S.player.mp === before - (base.mpCost || 0));
    } else {
      const foe = S.enemies.find(e => !e.dead); foe.x = S.player.x + 50; foe.y = S.player.y; S.player.face = 0; const hp0 = foe.hp;
      check('class Knight: melee attack damages enemy in front', E.playerAttack() && foe.hp < hp0);
    }
    check(`class ${cls}: render + minimap + update do not throw`, (() => { try { E.render(); E.drawMinimap(); E.update(0.016); return true; } catch (e) { console.log(e); return false; } })());
    w.close();
  }
  /* --- difficulties --- */
  {
    const a = fresh(); const Sa = play(a.w, a.E, null, { name: 'T', cls: 'Knight', color: '#fff', diff: 'Story' });
    const b = fresh(); const Sb = play(b.w, b.E, null, { name: 'T', cls: 'Knight', color: '#fff', diff: 'Hardcore' });
    const ga = Sa.enemies.find(e => e.guardShard).maxHp, gb = Sb.enemies.find(e => e.guardShard).maxHp;
    check('difficulty: Hardcore enemies tougher than Story', gb > ga);
    a.w.close(); b.w.close();
  }
  /* --- movement & collision --- */
  {
    const { w, E } = fresh(); const S = play(w, E); const y0 = S.player.y;
    E.setKeys({ w: true }); for (let i = 0; i < 30; i++) E.tryMove(0.016);
    check('movement: W key moves player up', S.player.y < y0);
    E.setKeys({}); S.player.x = 1830; S.player.y = 2195; E.setKeys({ w: true });
    for (let i = 0; i < 60; i++) E.tryMove(0.016);
    check('collision: solid building (Elder Hall) blocks movement', S.player.y >= 2175);
    E.setKeys({}); S.player.y = 24; E.setKeys({ w: true }); for (let i = 0; i < 30; i++) E.tryMove(0.016);
    check('collision: world border blocks movement', S.player.y >= 16);
    check('world: biomes distinct at 4+ locations', new Set([E.getBiome(600, 500), E.getBiome(3300, 500), E.getBiome(600, 2400), E.getBiome(3300, 2400), E.getBiome(1900, 2400)]).size === 5);
    w.close();
  }
  /* --- NPC dialogue, main quest accept, shop success + failure --- */
  {
    const { w, E, $ } = fresh(); const S = play(w, E); const mara = E.NPCS_ref.find(n => n.role === 'elder');
    near(E, mara.x, mara.y); check('npc: interact near Elder Mara opens dialogue', E.doInteract() && E.mode === 'dialogue' && !$('dialogue').classList.contains('hidden'));
    $('dlg-actions').querySelector('button').click();
    check('quest: accepting main quest sets stage 1', S.quests.main.stage === 1 && E.mode === 'playing');
    const bram = E.NPCS_ref.find(n => n.role === 'shop'); near(E, bram.x, bram.y); E.doInteract();
    $('dlg-actions').querySelector('button').click();
    check('shop: opens from Bram dialogue', E.mode === 'shop');
    const gold0 = S.player.gold, pot0 = S.player.potions.hp;
    check('shop: buy health potion succeeds with enough gold', E.buyItem('hp_potion') === true && S.player.gold === gold0 - 25 && S.player.potions.hp === pot0 + 1);
    check('shop: buy fails gracefully when gold is insufficient', E.buyItem('elixir') === false && S.player.gold === gold0 - 25);
    E.closeShop(); check('shop: closing returns to playing', E.mode === 'playing');
    const sana = E.NPCS_ref.find(n => n.role === 'healer'); S.player.hp = 30; near(E, sana.x, sana.y); E.doInteract();
    $('dlg-actions').querySelector('button').click();
    check('npc: Healer Sana restores HP fully', S.player.hp === S.player.maxHp);
    w.close();
  }
  /* --- side quests: slimes + amulet --- */
  {
    const { w, E, $ } = fresh(); const S = play(w, E);
    const lio = E.NPCS_ref.find(n => n.role === 'side_slimes'); near(E, lio.x, lio.y); E.doInteract(); $('dlg-actions').querySelector('button').click();
    check('side quest: Slime Menace accepted', S.quests.slimes.state === 1);
    S.enemies.filter(e => e.type === 'slime' && !e.dead).slice(0, 5).forEach(e => E.killEnemy(e));
    check('side quest: 5 slime kills counted', S.quests.slimes.kills === 5);
    const g0 = S.player.gold; near(E, lio.x, lio.y); E.doInteract(); $('dlg-actions').querySelector('button').click();
    check('side quest: slime reward paid (60g)', S.quests.slimes.state === 2 && S.player.gold === g0 + 60);
    const renn = E.NPCS_ref.find(n => n.role === 'side_amulet'); near(E, renn.x, renn.y); E.doInteract(); $('dlg-actions').querySelector('button').click();
    check('side quest: Lost Amulet accepted & amulet placed', S.quests.amulet.state === 1 && S.amuletOut === true);
    near(E, 980, 900); check('side quest: amulet pickup works', E.doInteract() === true && S.quests.amulet.has === true);
    check('edge: amulet cannot be picked up twice', E.pickupAmulet() === false);
    const g1 = S.player.gold; near(E, renn.x, renn.y); E.doInteract(); $('dlg-actions').querySelector('button').click();
    check('side quest: amulet reward paid (80g + elixir)', S.quests.amulet.state === 2 && S.player.gold === g1 + 80 && S.player.potions.elixir >= 1);
    w.close();
  }
  /* --- combat kill, XP, level up, potions --- */
  {
    const { w, E } = fresh(); const S = play(w, E);
    const foe = S.enemies.find(e => e.type === 'wolf' && !e.dead); const xp0 = S.player.xp, g0 = S.player.gold;
    E.hitEnemy(foe, 9999);
    check('combat: killing an enemy grants XP and gold', foe.dead && (S.player.xp > xp0 || S.player.level > 1) && S.player.gold > g0);
    E.gainXP(500); check('progression: enough XP levels the player up and restores HP', S.player.level >= 2 && S.player.hp === S.player.maxHp);
    S.player.hp = 20; const p0 = S.player.potions.hp;
    check('potion: drinking a health potion restores 50 HP', E.usePotion('hp') === true && S.player.hp === 70 && S.player.potions.hp === p0 - 1);
    S.player.potions.hp = 0; S.player.hp = 20;
    check('edge: using a potion with 0 potions fails gracefully', E.usePotion('hp') === false && S.player.hp === 20);
    check('edge: shard collect before main quest starts is blocked', E.collectShard('forest') === false);
    w.close();
  }
  /* --- full main quest: 3 shards -> boss -> ending -> credits -> NG+ --- */
  {
    const { w, E, $ } = fresh(); const S = play(w, E);
    const mara = E.NPCS_ref.find(n => n.role === 'elder'); near(E, mara.x, mara.y); E.doInteract(); $('dlg-actions').querySelector('button').click();
    for (const id of ['forest', 'desert', 'snow']) {
      check(`main quest: shard ${id} blocked while guardian alive`, E.collectShard(id) === false && !S.quests.main.shards[id]);
      const guard = S.enemies.find(e => e.guardShard === id); E.hitEnemy(guard, 99999);
      const spot = { forest: [520, 460], desert: [3320, 460], snow: [520, 2380] }[id]; near(E, spot[0], spot[1]);
      check(`main quest: shard ${id} collected after guardian falls`, E.doInteract() === true && S.quests.main.shards[id] === true);
      check(`edge: shard ${id} cannot be double-collected`, E.collectShard(id) === false);
    }
    check('main quest: after 3 shards the boss unlocks (stage 2 + boss spawned)', S.quests.main.stage === 2 && S.enemies.some(e => e.type === 'boss' && !e.dead));
    const boss = S.enemies.find(e => e.type === 'boss'); E.hitEnemy(boss, 99999);
    check('boss: killing Malachar completes the main quest (stage 3)', S.quests.main.stage === 3);
    await sleep(1100);
    check('ending: ending screen displays after boss kill', E.mode === 'ending' && !$('screen-ending').classList.contains('hidden'));
    $('btn-credits').click();
    check('credits: credits scene displays and scroll is rolling', E.mode === 'credits' && !$('screen-credits').classList.contains('hidden') && $('credits-scroll').classList.contains('scrolling'));
    $('btn-ngplus').click();
    check('new game+: NG+ resets quests, keeps level, increments counter', S.player.ngPlus === 1 && S.quests.main.stage === 0 && S.player.level >= 1 && E.mode === 'playing');
    $('btn-credits').click; // not valid outside ending; ensure no crash
    w.close();
  }
  /* --- free-roam after credits --- */
  {
    const { w, E, $ } = fresh(); const S = play(w, E); S.quests.main.stage = 3; E.setMode('ending'); w.document.getElementById('screen-ending').classList.remove('hidden');
    $('btn-credits').click(); $('btn-freeroam').click();
    check('credits: Keep Free-Roaming returns to the world', E.mode === 'playing');
    w.close();
  }
  /* --- save / load roundtrip --- */
  {
    const { w, E } = fresh(); const S = play(w, E);
    S.player.gold = 777; S.player.level = 4; S.quests.main.stage = 1; S.quests.main.shards.forest = true;
    check('save: saveGame writes a save', E.saveGame() === true && E.hasSave());
    S.player.gold = 1; S.player.level = 1;
    check('save: loadGame restores gold/level/quest state', E.loadGame() === true && E.state.player.gold === 777 && E.state.player.level === 4 && E.state.quests.main.shards.forest === true);
    w.close();
  }
  /* --- death / respawn, pause / resume --- */
  {
    const { w, E, $ } = fresh(); const S = play(w, E); S.player.gold = 100;
    E.damagePlayer(99999);
    check('death: HP hitting 0 shows the death screen', E.mode === 'dead' && !$('screen-death').classList.contains('hidden') && S.player.hp === 0);
    E.respawn();
    check('death: respawn restores HP at village with 10% gold loss', E.mode === 'playing' && S.player.hp === S.player.maxHp && S.player.gold === 90 && Math.hypot(S.player.x - 1900, S.player.y - 2420) < 2);
    E.pauseGame(); check('pause: pause menu opens', E.mode === 'paused' && !$('screen-pause').classList.contains('hidden'));
    E.resumeGame(); check('pause: resume returns to playing', E.mode === 'playing');
    E.openQuests(); check('quest log: opens and lists quests', E.mode === 'quests' && $('quest-list').innerHTML.includes('Shattered Ember'));
    E.closeQuests(); check('quest log: closes back to playing', E.mode === 'playing');
    w.close();
  }
  /* --- mobile touch controls --- */
  {
    const { w, E, $ } = fresh(); const S = play(w, E, null, { name: 'T', cls: 'Mage', color: '#2ecc71', diff: 'Normal' });
    check('mobile: joystick + attack/interact/potion buttons exist', !!$('joystick') && !!$('touch-attack') && !!$('touch-interact') && !!$('touch-potion'));
    $('touch-attack').click();
    check('mobile: attack button is wired (fires a projectile)', S.projectiles.length === 1);
    S.player.hp = 30; $('touch-potion').click();
    check('mobile: potion button is wired (restores HP)', S.player.hp === 80);
    w.close();
  }
  console.log(`\n==== RESULT: ${passed} passed, ${failed} failed ====`);
  if (failures.length) console.log('Failures:\n - ' + failures.join('\n - '));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
