# 🔥 Emberfall — An Open World Adventure

A complete, playable open-world RPG that runs entirely in the browser. No build step, no backend — just vanilla HTML, CSS and JavaScript on a Canvas engine.

**Created by Abdur Rahman Mansoor · Built by Nyx / Muse**

## The Story

Long ago, the Ember Crystal kept the four lands in balance. Then Malachar, the Ashen King, shattered it and fled to the Shadowlands. Three shards survived — hidden in the **Whispering Forest**, the **Sunscorch Desert** and the **Frostbite Snowfields**, each watched by a guardian. You are the last Emberbearer. Gather the shards, break the seal, and face Malachar.

## Features

- **Full A–Z flow:** title screen → character creation → intro → open world → main quest chain → final boss → ending → scrolling end credits → free-roam or **New Game+**
- **Character creation:** name, 3 classes (**Knight** — melee tank, **Mage** — ranged firebolts costing MP, **Ranger** — fast arrows), 6 appearance colours, 3 difficulties (Story / Normal / Hardcore)
- **Large scrolling open world** (3840 × 2880) with 5 areas: Ember Village, Whispering Forest, Sunscorch Desert, Frostbite Snowfields and the Shadowlands — with buildings, props, collision and a live minimap
- **5 NPCs** with dialogue, a working **shop** (potions, elixir, permanent attack upgrade), a free healer, and quest givers
- **Main quest:** collect 3 elemental shards, each guarded, then unlock and defeat the final boss
- **2 side quests:** *Slime Menace* (defeat 5 slimes) and *The Lost Amulet* (fetch quest), plus a quest journal
- **Real-time combat**, 6 enemy types + guardians + boss, XP & levelling, gold drops, enemy respawning
- **Inventory & potions**, player death & respawn (10% gold loss), HUD, pause menu
- **Save / load** via `localStorage`, sound effects via WebAudio (mutable), full keyboard/mouse **and mobile touch controls** (virtual joystick + action buttons)

## Controls

| Action | Keyboard / Mouse | Mobile |
|---|---|---|
| Move | WASD / Arrow keys | Virtual joystick |
| Attack | Space, J, or mouse click | ⚔️ button |
| Interact | E | 💬 button |
| Drink health potion | H | 🧪 button |
| Quest journal | Q | 📜 Quests button |
| Pause | Esc / P | ⏸ Pause button |

## How to Run Locally

```bash
git clone https://github.com/armansoor/emberfall-open-world.git
cd emberfall-open-world
python3 -m http.server 8000
# open http://localhost:8000 in your browser
```

(Opening `index.html` directly also works in most browsers.)

## Tests

A scripted end-to-end playthrough suite (jsdom + canvas mock) covers the whole flow: all 3 classes, both shop outcomes, shard collection, boss, ending, credits, save/load, death/respawn, pause, touch controls and edge cases.

```bash
npm install jsdom   # once, anywhere on NODE_PATH
node tests/e2e.js   # 65 checks
```

## Note on GitHub Pages

This repository is **private**, so GitHub Pages will not be publicly live unless the repo is made public or a plan that supports private-repo Pages is used. The game itself needs no hosting — any static file server works.

## Project Layout

```
index.html      — all screens (title, creation, HUD, shop, quests, pause, death, ending, credits)
css/style.css   — styling, responsive + mobile layout, credits roll animation
js/audio.js     — WebAudio sound effects (no audio files)
js/world.js     — world data: biomes, props/collision, NPCs, shards, enemy & shop tables
js/game.js      — game engine: movement, combat, quests, save/load, rendering, input
tests/e2e.js    — scripted end-to-end playthrough tests
```
