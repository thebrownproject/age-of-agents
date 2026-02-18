# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Age of Agents** — a turn-based strategy game where two LLM agents play against each other. Each turn, agents receive a JSON observation and submit their orders via tool_use (Anthropic) or JSON output (OpenAI/GLM). The engine resolves all actions deterministically.

The game runs client-side in the browser. GLM model calls are proxied through a Vercel Edge Function so the z.ai key stays server-side. Deployable to Vercel.

## Commands

```bash
# Dev server
npm run dev            # localhost:3000

# Production build (type-check + compile)
npm run build

# Deploy
vercel --prod
```

**Required env var:** `ZAI_API_KEY` — used by the GLM proxy Edge Function. Without it, GLM models return a 500. Claude and OpenAI models work without any env var.

## Architecture

```
src/
├── app/
│   ├── layout.tsx                        ← viewport meta, AoE2 fonts via CSS
│   ├── page.tsx                          ← root: renders <Lobby> or <GameBoard>
│   ├── globals.css                       ← AoE2 CSS variables, Google Fonts import
│   └── api/glm/chat/completions/
│       └── route.ts                      ← Edge Function: proxies GLM calls, injects ZAI_API_KEY
├── components/
│   ├── Lobby.tsx        ← config form (models, API keys, personas, turn limit)
│   ├── GameBoard.tsx    ← game loop controller + useIsMobile + mobile tab layout
│   ├── TileMap.tsx      ← canvas terrain + sprite entities + movement animations
│   ├── PlayerPanel.tsx  ← resources, units, buildings, queue per player
│   └── EventLog.tsx     ← battle chronicle grouped by turn with accordion history
└── lib/
    ├── config.ts        ← all game constants (ported from config.py)
    ├── sprites.ts       ← sprite URLs, zone bounds, slot positions, move detection
    ├── engine/
    │   ├── state.ts     ← GameState, PlayerState interfaces + newGame()
    │   ├── economy.ts   ← economyTick(gs): income + production queue
    │   ├── combat.ts    ← resolveCombat(gs, zone): tower + field + TC
    │   ├── validator.ts ← validateAction(raw, player): CleanAction
    │   └── resolver.ts  ← async runTurn(gs, agentA, agentB): GameState
    ├── agents/
    │   ├── base.ts      ← Agent interface
    │   ├── anthropic.ts ← AnthropicAgent (tool_use, dangerouslyAllowBrowser)
    │   └── openai.ts    ← OpenAIAgent (json_object, dangerouslyAllowBrowser)
    └── prompts/
        └── builder.ts   ← SYSTEM_PROMPT + buildObservation() fog-of-war
```

Original Python source archived at `archive/`.

## Turn loop (`lib/engine/resolver.ts → runTurn`)

Order within each turn:
1. `economyTick` — income based on villager tasks from *previous* turn
2. Build observations × 2 (fog of war applied)
3. `Promise.all` — both agents called in parallel
4. `validateAction` × 2 — invalid actions silently dropped
5. Process in order: `advance_age` → `task_villagers` → `research` → `builds` → `trains`
6. `deductCosts` — **builds only** (train costs deducted in `processTrains`)
7. `processMoves`
8. `resolveCombat` for all 8 zones
9. Victory check

**Critical**: `deductCosts` in `validator.ts` handles only build costs. `processTrains` in `resolver.ts` deducts per-unit train costs itself. Do not add train deduction to `deductCosts`.

**Key difference from Python**: `runTurn` uses `structuredClone(gs)` and returns a new state — no in-place mutation. React `setGameState` triggers re-render.

## Map zones (8 zones, 3 lanes)

```
         [Top_A] ────── [Top_B]
        /   |                |   \
[Base_A]  [Mid_A] ────── [Mid_B]  [Base_B]
        \   |                |   /
         [Bot_A] ────── [Bot_B]
```

`ZONES = ["Base_A", "Top_A", "Mid_A", "Bot_A", "Top_B", "Mid_B", "Bot_B", "Base_B"]`

**Display names** (used in TileMap labels and EventLog):

| Zone ID | Display name |
|---------|-------------|
| Base_A  | Village A |
| Top_A   | Left Flank A |
| Mid_A   | Battlefield A |
| Bot_A   | Right Flank A |
| Top_B   | Left Flank B |
| Mid_B   | Battlefield B |
| Bot_B   | Right Flank B |
| Base_B  | Village B |

## Game state (`lib/engine/state.ts`)

`GameState` holds two `PlayerState` objects keyed `"A"` and `"B"`. Important `PlayerState` fields:
- `units: Record<Zone, Record<string, number>>` — zone → unitType → count
- `buildings: Record<Zone, string[]>` — Wall/Tower can appear multiple times
- `buildingHp: Record<Zone, Record<string, number>>` — only Wall and Tower track HP
- `villagerTasks` — persists between turns; economy reads it at start of *next* turn
- `age` (1–4), `upgrades` (string[]), `attackBonus`, `armorBonus`

## Config (`lib/config.ts`)

Single source of truth. Key exports:
- `ZONES` — 8-element tuple
- `ADJACENCY` — `Record<Zone, Set<Zone>>`
- `UNITS`, `BUILDINGS`, `UPGRADES` — typed object dicts
- `AGE_ADVANCE_COSTS`, `UNIT_AGE_REQUIREMENT`, `BUILDING_AGE_REQUIREMENT`

## Economy (`lib/engine/economy.ts`)

Villagers split into *tasked* (VILLAGER_TASK_RATES: 15f/12w/8g) and *idle* (VILLAGER_IDLE_RATES: 3f/2w). GOLD_TRICKLE (5g) always applies. If villager_tasks total exceeds actual villager count (e.g. villagers died), values are proportionally scaled down.

## Combat (`lib/engine/combat.ts`)

Order within `resolveCombat(zone)`:
1. `applyTowerDamage` — towers fire at enemy units before field combat
2. Field combat (simultaneous damage, sorted by HP descending)
3. `handleBaseAttack` — units in undefended enemy base attack TC; Wall absorbs first

**Fix applied**: Catapult's `"Building"` counter now applies vs any defenders (was never triggering in Python due to counter matching against unit type dict keys).

## Agents (`lib/agents/`)

- `AnthropicAgent` — uses `tool_use` with `ACTION_TOOL` schema; `dangerouslyAllowBrowser: true`; API key sent directly browser → api.anthropic.com
- `OpenAIAgent` — uses `response_format: {type:"json_object"}`; `dangerouslyAllowBrowser: true`; API key sent directly browser → api.openai.com
- **GLM models** — `OpenAIAgent` with `baseURL = window.location.origin + "/api/glm"`; requests proxy through the Edge Function; `ZAI_API_KEY` never reaches the client
- Both maintain a rolling 20-message history for context

## Mobile layout (`GameBoard.tsx`)

- `useIsMobile()` hook detects `< 768px` via resize listener
- Desktop: unchanged 3-column flex layout (240px sidebars + flex map)
- Mobile: full-screen tab layout with bottom nav — **Agents** (both panels) | **Battlefield** | **Chronicle**
- Tab bar uses `.mobile-tabs` / `.mobile-tab` CSS classes in `globals.css`

## Deployment

Hosted on Vercel. Has one server-side route (the GLM proxy). `ZAI_API_KEY` must be set in Vercel environment variables.

```bash
vercel --prod
```
