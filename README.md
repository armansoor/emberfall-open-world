# 🔥 Emberfall — An Open World Adventure

**▶ Play the game: https://armansoor.github.io/emberfall-open-world/**

**Play free — no account needed, no purchase, no paywall.** The game is completely free, with no login and no payment code of any kind.

A complete, playable open-world RPG that runs entirely in the browser. No build step, no backend — just vanilla HTML, CSS and JavaScript on a Canvas engine.

**Created by Abdur Rahman Mansoor · Built by Nyx / Muse**

**Also try the 3D version: https://armansoor.github.io/emberfall-3d/**

## The Story

Long ago, the Ember Crystal kept the four lands in balance. Then Malachar, the Ashen King, shattered it and fled to the Shadowlands. Three shards survived — hidden in the **Whispering Forest**, the **Sunscorch Desert** and the **Frostbite Snowfields**, each watched by a guardian. You are the last Emberbearer. Gather the shards, break the seal, and face Malachar.

## Features

- **Full A–Z flow:** title screen → character creation → intro → open world → main quest chain → final boss → ending → scrolling end credits → free-roam or **New Game+**
- **Character creation:** name, 3 classes (**Knight** — melee tank, **Mage** — ranged firebolts costing MP, **Ranger** — fast arrows), 6 appearance colours, 3 difficulties (Story / Normal / Hardcore)
- **Large scrolling open world** (3840 × 2880) with 5 areas: Ember Village, Whispering Forest, Sunscorch Desert, Frostbite Snowfields and the Shadowlands — with buildings, props, collision and a live minimap
- **7 NPCs** with dialogue, a working **shop** (potions, elixir, permanent attack upgrade), a free healer, and quest givers — including Mira Vale (tavern keeper) and Kael Thorn (bard), who feature in the optional 21+ Adult Story Mode below
- **Responsive UI for phone, tablet and desktop:** title, creation, intro, HUD, dialogue, shop, quest journal, pause, death, ending and credits screens all adapt to ~360px mobile, ~768px tablet and ~1280px desktop, in portrait and landscape; touch targets are at least ~44px, panels and dialogue scroll inside their bounds, and no control depends on hover. There is no separate inventory screen (potions live in the HUD) and no separate world-map screen (the live minimap covers that role).
- **Main quest:** collect 3 elemental shards, each guarded, then unlock and defeat the final boss
- **2 side quests:** *Slime Menace* (defeat 5 slimes) and *The Lost Amulet* (fetch quest), plus a quest journal
- **Real-time combat**, 6 enemy types + guardians + boss, XP & levelling, gold drops, enemy respawning
- **Inventory & potions**, player death & respawn (10% gold loss), HUD, pause menu
- **Save / load** via `localStorage`, sound effects via WebAudio (mutable), full keyboard/mouse **and mobile touch controls** (virtual joystick + action buttons)

## Adult Story Mode (21+)

An **optional** mode, **OFF by default**, that adds mature storytelling alongside the main quest — it never replaces it. The 3-shard → Malachar → ending → credits flow works exactly the same with the mode on or off.

- **Age gate:** open it from the title screen or the pause menu ("🔞 Adult Story Mode (21+)"). To enable it you must enter a birth year that makes you 21 or older **and** explicitly confirm "I am 21 or older". If you are under 21, the mode stays locked and none of its dialogue is accessible.
- **Privacy:** only a yes/no `adultVerified` flag is saved. Your birth year is never stored anywhere. If save data is missing or corrupt, the mode defaults back to OFF.
- **Content warning (shown on the gate, in plain language):** mature themes — romance between adults, alcohol in the tavern, violence, and moral choices.
- **Romance (adult-to-adult, consensual only):** two romanceable adult NPCs with their adult ages stated in-story — **Mira Vale, 29, tavern keeper** and **Kael Thorn, 27, wandering bard**. Progression runs meet → flirt choices → dates at the tavern and the lakeside → relationship milestone, with a mature quest reward (gold + elixir) at the milestone. You can decline or end a romance at any point. Intimate moments are suggestive dialogue with a fade to black only — never graphic detail.
- **Mature side quest:** *A Difficult Night at the Tavern* — a moral dilemma about a patron who has had too much to drink, with three choices (walk him home safely, refuse more drinks and offer food and water, or look away) that carry different rewards and consequences.
- **Safety rules:** there are no child or minor characters in this game, and no romantic content involving anyone under 21 exists. When the mode is OFF or unverified, all romance and tavern-dilemma dialogue is completely hidden — including from the quest journal. The age gate, toggle and romance dialogue all work with touch controls.
- **Free:** Adult Story Mode costs nothing and needs no account, like the rest of the game.

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
node tests/e2e.js   # 65 original checks + 39 new checks (age gate, romance, tavern quest, persistence, responsive UI, free/no-payment) = 104
```

## GitHub Pages

This repository is **public**, and a GitHub Pages workflow (`.github/workflows/deploy-pages.yml`) deploys it on every push to `main`. The game is live at **https://armansoor.github.io/emberfall-open-world/**.

## Project Layout

```
index.html      — all screens (title, creation, HUD, shop, quests, pause, death, ending, credits)
css/style.css   — styling, responsive + mobile layout, credits roll animation
js/audio.js     — WebAudio sound effects (no audio files)
js/world.js     — world data: biomes, props/collision, NPCs, shards, enemy & shop tables
js/game.js      — game engine: movement, combat, quests, save/load, rendering, input
tests/e2e.js    — scripted end-to-end playthrough tests
```

## Also Try

- **Emberfall 3D (Three.js, third-person, bigger world, more NPCs and quests): https://armansoor.github.io/emberfall-3d/**
