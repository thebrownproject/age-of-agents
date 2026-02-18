/**
 * sprites.ts — sprite paths, seeded slot system, and movement detection
 * Pure TypeScript, no React. All functions are deterministic given the same inputs.
 */

import { Zone, ZONES, ADJACENCY } from "@/lib/config";
import { GameState } from "@/lib/engine/state";

// ── Grid dimensions ───────────────────────────────────────────────────────────
// 32×32 tile grid. Vertical lane layout (lanes run top-to-bottom):
//
//  Row  0-9  : Base_A  (full width — Player A's base, at top)   ← 10 rows
//  Row 10-15 : Top_A (cols 0-10) | Mid_A (cols 11-20) | Bot_A (cols 21-31) ← 6 rows
//  Row 16-21 : Top_B (cols 0-10) | Mid_B (cols 11-20) | Bot_B (cols 21-31) ← 6 rows
//  Row 22-31 : Base_B  (full width — Player B's base, at bottom) ← 10 rows
//
export const GRID_SIZE = 32;

// ── Zone tile bounds ──────────────────────────────────────────────────────────
interface ZoneBounds { r0: number; r1: number; c0: number; c1: number; }

export const ZONE_BOUNDS: Record<Zone, ZoneBounds> = {
  Base_A: { r0: 0,  r1: 9,  c0: 0,  c1: 31 },  // top strip — Player A's base (10 rows)
  Top_A:  { r0: 10, r1: 15, c0: 0,  c1: 10 },  // left lane, A side
  Mid_A:  { r0: 10, r1: 15, c0: 11, c1: 20 },  // center lane, A side
  Bot_A:  { r0: 10, r1: 15, c0: 21, c1: 31 },  // right lane, A side
  Top_B:  { r0: 16, r1: 21, c0: 0,  c1: 10 },  // left lane, B side
  Mid_B:  { r0: 16, r1: 21, c0: 11, c1: 20 },  // center lane, B side
  Bot_B:  { r0: 16, r1: 21, c0: 21, c1: 31 },  // right lane, B side
  Base_B: { r0: 22, r1: 31, c0: 0,  c1: 31 },  // bottom strip — Player B's base (10 rows)
};

// ── PRNG ──────────────────────────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Interior positions — 1-tile border keeps sprites away from zone edges
function interiorPositions(b: ZoneBounds): Array<[number, number]> {
  const positions: Array<[number, number]> = [];
  for (let r = b.r0 + 1; r <= b.r1 - 1; r++) {
    for (let c = b.c0 + 1; c <= b.c1 - 1; c++) {
      positions.push([r, c]);
    }
  }
  return positions;
}

// Pre-computed shuffled slot lists per zone (stable across renders)
export const ZONE_SLOTS: Record<Zone, Array<[number, number]>> = {} as Record<Zone, Array<[number, number]>>;
for (const z of ZONES) {
  const seed = z.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  ZONE_SLOTS[z] = seededShuffle(interiorPositions(ZONE_BOUNDS[z]), seed);
}

// ── Slot getters ──────────────────────────────────────────────────────────────

// Town Center — fixed at zone centre for the two base zones
export const TC_TILES: Record<Zone, [number, number]> = {
  Base_A: [4,  15],  // centre of rows 0-9, full width
  Base_B: [26, 15],  // centre of rows 22-31, full width
  Top_A:  [12, 5],
  Mid_A:  [12, 15],
  Bot_A:  [12, 26],
  Top_B:  [18, 5],
  Mid_B:  [18, 15],
  Bot_B:  [18, 26],
};

function playerOffset(player: "A" | "B"): number {
  return player === "A" ? 0 : 50;
}

function deriveSlotIndex(zone: Zone, player: "A" | "B", typeName: string, instanceIndex: number): number {
  const typeHash = typeName.split("").reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 0) % 20;
  return (playerOffset(player) + typeHash + instanceIndex * 3) % Math.max(1, ZONE_SLOTS[zone].length);
}

export function getUnitSlot(zone: Zone, player: "A" | "B", unitType: string, unitIndex: number): [number, number] {
  const slots = ZONE_SLOTS[zone];
  if (slots.length === 0) {
    const b = ZONE_BOUNDS[zone];
    return [Math.floor((b.r0 + b.r1) / 2), Math.floor((b.c0 + b.c1) / 2)];
  }
  const idx = deriveSlotIndex(zone, player, unitType, unitIndex) % slots.length;
  return slots[idx];
}

export function getBuildingSlot(
  zone: Zone,
  player: "A" | "B",
  buildingType: string,
  buildingIndex: number,
): [number, number] {
  if (buildingType === "TownCenter") return TC_TILES[zone];
  const slots = ZONE_SLOTS[zone];
  if (slots.length === 0) {
    const b = ZONE_BOUNDS[zone];
    return [Math.floor((b.r0 + b.r1) / 2), Math.floor((b.c0 + b.c1) / 2)];
  }
  const idx = (deriveSlotIndex(zone, player, buildingType, buildingIndex) + 25) % slots.length;
  return slots[idx];
}

// ── Sprite paths ──────────────────────────────────────────────────────────────
export const UNIT_SPRITE: Record<string, string> = {
  Villager: "/sprites/units/villager.png",
  Militia:  "/sprites/units/militia.png",
  Archer:   "/sprites/units/archer.png",
  Knight:   "/sprites/units/knight.png",
  Catapult: "/sprites/units/catapult.png",
};

export const BUILDING_SPRITE: Record<string, string> = {
  Barracks:   "/sprites/buildings/barracks.png",
  Range:      "/sprites/buildings/range.png",
  Wall:       "/sprites/buildings/wall.png",
  Tower:      "/sprites/buildings/tower.png",
  Blacksmith: "/sprites/buildings/blacksmith.png",
  TownCenter: "/sprites/buildings/towncenter.png",
};

// ── Team colour class names ───────────────────────────────────────────────────
export function playerSpriteClass(player: "A" | "B"): string {
  return player === "A" ? "sprite-a" : "sprite-b";
}

// ── Zone centroid (pixel position, square tiles) ──────────────────────────────
export function zoneCentroid(zone: Zone, tileSize: number): { x: number; y: number } {
  const b = ZONE_BOUNDS[zone];
  return {
    x: ((b.c0 + b.c1) / 2 + 0.5) * tileSize,
    y: ((b.r0 + b.r1) / 2 + 0.5) * tileSize,
  };
}

// ── Movement detection ────────────────────────────────────────────────────────
export interface MoveAnimation {
  id: string;
  player: "A" | "B";
  unitType: string;
  spriteUrl: string;
  fromZone: Zone;
  toZone: Zone;
  startedAt: number;
  duration: number;
}

let _moveCounter = 0;

export function detectMoves(prev: GameState, curr: GameState): MoveAnimation[] {
  const animations: MoveAnimation[] = [];
  const now = performance.now();

  for (const player of (["A", "B"] as const)) {
    const prevUnits = prev.players[player].units;
    const currUnits = curr.players[player].units;

    for (const fromZone of ZONES) {
      const prevCounts = prevUnits[fromZone] ?? {};
      const currCounts = currUnits[fromZone] ?? {};

      for (const unitType of Object.keys(prevCounts)) {
        const departed = (prevCounts[unitType] ?? 0) - (currCounts[unitType] ?? 0);
        if (departed <= 0) continue;

        for (const toZone of Array.from(ADJACENCY[fromZone])) {
          const arrived = (currUnits[toZone]?.[unitType] ?? 0) - (prevUnits[toZone]?.[unitType] ?? 0);
          if (arrived <= 0) continue;

          const movers = Math.min(departed, arrived);
          for (let i = 0; i < movers; i++) {
            animations.push({
              id: `move-${_moveCounter++}`,
              player,
              unitType,
              spriteUrl: UNIT_SPRITE[unitType] ?? UNIT_SPRITE.Militia,
              fromZone,
              toZone,
              startedAt: now,
              duration: 350,
            });
          }
          break;
        }
      }
    }
  }

  return animations;
}
