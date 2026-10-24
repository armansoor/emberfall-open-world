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
  /* --- Adult Story Mode (21+): gate, hiding, romance, tavern quest, persistence --- */
  {
    const cy = new Date().getFullYear();
    const btnWith = ($, text) => [...$('dlg-actions').querySelectorAll('button')].find(b => b.textContent.toLowerCase().includes(text.toLowerCase()));
    /* Gate blocks under-21, missing confirmation, invalid and future years. */
    const g = fresh(); const Sg = play(g.w, g.E);
    check('adult: age gate blocks under-21 (birth year = current year - 20)', g.E.verifyAdult(cy - 20, true) === false && g.E.isAdultMode() === false);
    check('adult: age gate blocks 21+ year without explicit confirmation', g.E.verifyAdult(cy - 30, false) === false && g.E.isAdultMode() === false);
    check('adult: age gate blocks invalid / future birth years', g.E.verifyAdult('not-a-year', true) === false && g.E.verifyAdult(cy + 1, true) === false);
    check('adult: age gate allows exactly 21 (birth year = current year - 21) with confirmation', g.E.verifyAdult(cy - 21, true) === true && g.E.isAdultMode() === true);
    check('adult: disable turns the mode back off', g.E.disableAdultMode() === true && g.E.isAdultMode() === false);
    g.w.close();
    /* Adult dialogue completely hidden when OFF. */
    const o = fresh(); const So = play(o.w, o.E, null, { name: 'T', cls: 'Knight', color: '#e74c3c', diff: 'Normal' });
    const miraO = o.E.NPCS_ref.find(n => n.id === 'mira'); near(o.E, miraO.x, miraO.y); o.E.doInteract();
    const offText = o.$('dlg-text').textContent + ' ' + o.$('dlg-actions').textContent;
    check('adult: romance dialogue hidden when OFF (no flirt/date/romance options)', !/flirt|date|romance/i.test(offText));
    o.$('dlg-actions').querySelector('button').click(); // Close neutral dialogue -> back to playing
    o.E.openQuests(); check('adult: quest journal hides adult entries when OFF', o.E.mode === 'quests' && !o.$('quest-list').innerHTML.includes('Mira Vale') && !o.$('quest-list').innerHTML.includes('Tavern'));
    o.E.closeQuests();
    /* Romance progression + reward, Mira (29) full path. */
    check('adult: enabling 21+ exposes romance options', o.E.verifyAdult(cy - 29, true) === true);
    near(o.E, miraO.x, miraO.y); o.E.doInteract();
    check('adult: Mira meet text states her adult age (29)', o.$('dlg-text').textContent.includes('29'));
    btnWith(o.$, 'Flirt').click();
    check('adult: flirt advances Mira romance to stage 1', o.E.romanceStage('mira') === 1);
    near(o.E, miraO.x, miraO.y); o.E.doInteract(); btnWith(o.$, 'Tavern date').click();
    check('adult: tavern date advances Mira romance to stage 2', o.E.romanceStage('mira') === 2);
    const goldBefore = So.player.gold;
    near(o.E, miraO.x, miraO.y); o.E.doInteract(); btnWith(o.$, 'Lakeside').click();
    check('adult: lakeside date reaches milestone (stage 3) with fade-to-black, not graphic detail', o.E.romanceStage('mira') === 3 && o.$('dlg-text').textContent.toLowerCase().includes('fades to black'));
    check('adult: romance milestone grants reward (+120 gold, +1 elixir)', So.player.gold === goldBefore + 120 && So.player.potions.elixir >= 1);
    o.$('dlg-actions').querySelector('button').click(); // close fade dialogue
    /* Kael (27) can be flirted with too, and a romance can be ended. */
    const kael = o.E.NPCS_ref.find(n => n.id === 'kael'); near(o.E, kael.x, kael.y); o.E.doInteract();
    check('adult: Kael meet text states his adult age (27)', o.$('dlg-text').textContent.includes('27'));
    btnWith(o.$, 'Flirt').click();
    check('adult: Kael romance reaches stage 1 and can be ended', o.E.romanceStage('kael') === 1);
    near(o.E, kael.x, kael.y); o.E.doInteract(); btnWith(o.$, 'End this romance').click();
    check('adult: ending a romance resets its stage and returns to playing', o.E.romanceStage('kael') === 0 && o.E.mode === 'playing');
    o.w.close();
    /* Tavern dilemma quest: accept -> choose -> complete with reward. */
    const t = fresh(); const St = play(t.w, t.E); t.E.verifyAdult(cy - 30, true);
    const miraT = t.E.NPCS_ref.find(n => n.id === 'mira'); near(t.E, miraT.x, miraT.y); t.E.doInteract();
    btnWith(t.$, 'dilemma').click();
    check('adult: tavern dilemma offer dialogue appears (21+ only)', t.$('dlg-text').textContent.includes('gamble'));
    btnWith(t.$, 'Accept').click();
    check('adult: tavern dilemma accepted (state 1)', St.adult.tavern.state === 1);
    const goldT = St.player.gold;
    near(t.E, miraT.x, miraT.y); t.E.doInteract(); btnWith(t.$, 'Walk him home').click();
    check('adult: tavern dilemma completes with safe-choice reward', St.adult.tavern.state === 2 && St.adult.tavern.choice === 'home' && St.player.gold === goldT + 90);
    t.w.close();
    /* Main story still works with adult mode ON. */
    const m = fresh(); const Sm = play(m.w, m.E); m.E.verifyAdult(cy - 30, true);
    const maraM = m.E.NPCS_ref.find(n => n.role === 'elder'); near(m.E, maraM.x, maraM.y); m.E.doInteract(); m.$('dlg-actions').querySelector('button').click();
    check('adult: main quest still accepts with adult mode ON', Sm.quests.main.stage === 1);
    m.w.close();
    /* Save/load persistence + birth-year privacy + corrupt-save default OFF. */
    const s = fresh(); const Ss = play(s.w, s.E); s.E.verifyAdult(1995, true);
    check('adult: save writes the boolean flag (adultVerified) and no birth year', (() => { s.E.saveGame(); const raw = s.w.localStorage.getItem(s.E.SAVE_KEY); return raw.includes('adultVerified') && !raw.includes('1995'); })());
    Ss.adult.adultVerified = false;
    check('adult: load restores the verified flag', s.E.loadGame() === true && s.E.isAdultMode() === true);
    const rawSave = JSON.parse(s.w.localStorage.getItem(s.E.SAVE_KEY)); rawSave.adult = 'corrupt-not-an-object'; s.w.localStorage.setItem(s.E.SAVE_KEY, JSON.stringify(rawSave));
    check('adult: corrupt adult save data defaults to OFF without crashing', s.E.loadGame() === true && s.E.isAdultMode() === false);
    s.w.close();
    /* New games default OFF. */
    const n = fresh(); play(n.w, n.E);
    check('adult: new game defaults to OFF', n.E.isAdultMode() === false && n.E.state.adult.adultVerified === false);
    n.w.close();
  }
  /* --- Responsive UI / touch targets (static CSS + DOM checks) --- */
  {
    const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    check('ui: mobile breakpoint (~480px) present', css.includes('@media (max-width:480px)') || css.includes('@media (max-width: 480px)'));
    check('ui: tablet breakpoint (~768px) present', css.includes('@media (max-width:768px)') || css.includes('@media (max-width: 768px)'));
    check('ui: short-landscape breakpoint present', css.includes('@media (max-height:520px)') || css.includes('@media (max-height: 520px)'));
    check('ui: touch targets are >=44px (mini buttons + big buttons)', /min-height:44px/.test(css) && /min-height:48px/.test(css));
    check('ui: dialogue box is scrollable (max-height + overflow)', css.includes('.dialogue') && /max-height:[0-9]+dvh/.test(css) && css.includes('overflow-y:auto'));
    check('ui: shop and quest lists scroll inside their panels', css.includes('#shop-items') && css.includes('#quest-list') && css.includes('overflow-y:auto'));
    check('ui: age gate, toggle and romance controls exist in the DOM', html.includes('id="screen-adult"') && html.includes('id="adult-birth-year"') && html.includes('id="adult-confirm"') && html.includes('id="btn-adult-title"') && html.includes('id="btn-adult-pause"') && html.includes('I am 21 or older'));
    check('ui: age gate carries a plain-language content warning', html.includes('Content warning') && html.includes('romance between adults'));
    check('ui: no separate inventory / world-map screens exist to audit (HUD potions + minimap only)', !html.includes('screen-inventory') && !html.includes('screen-worldmap') && !html.includes('screen-map'));
    const { w, E, $ } = fresh(); play(w, E);
    check('ui: touch joystick + buttons exist and are wired (existing behaviour)', !!$('joystick') && !!$('touch-attack') && !!$('touch-interact') && !!$('touch-potion'));
    check('ui: adult gate opens from title wiring and closes back', (() => { E.openAdultGate(); const open = !$('screen-adult').classList.contains('hidden'); E.closeAdultGate(); return open && $('screen-adult').classList.contains('hidden'); })());
    w.close();
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    check('free: README states play free with no account needed', /Play free/i.test(readme) && /no account/i.test(readme));
    check('free: README keeps the 3D cross-link', readme.includes('https://armansoor.github.io/emberfall-3d/'));
    check('free: no payment code added (no checkout/payment-provider strings in game code)', !/(stripe|paypal|checkout|credit card)/i.test(fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));
    check('adult: README documents the 21+ mode and its age gate without graphic detail', readme.includes('21+') && readme.includes('age gate') && !/porn|graphic sexual/i.test(readme));
  }
  console.log(`\n==== RESULT: ${passed} passed, ${failed} failed ====`);
  if (failures.length) console.log('Failures:\n - ' + failures.join('\n - '));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
