"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { GameState } from "@/lib/engine/state";
import { Zone, ZONES } from "@/lib/config";
import {
  GRID_SIZE,
  ZONE_BOUNDS,
  TC_TILES,
  UNIT_SPRITE,
  BUILDING_SPRITE,
  playerSpriteClass,
  zoneCentroid,
  getUnitSlot,
  getBuildingSlot,
  detectMoves,
  MoveAnimation,
} from "@/lib/sprites";

interface TileMapProps {
  gs: GameState;
}

// ── Tile size hook — square tiles, fills container ───────────────────────────
function useTileSize(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [tileSize, setTileSize] = useState(24);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const side = Math.min(el.clientWidth, el.clientHeight);
      setTileSize(Math.max(4, side / GRID_SIZE));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  return tileSize;
}

// ── Zone mapping for 32×32 grid ───────────────────────────────────────────────
// Vertical lane layout — lanes run top-to-bottom:
//   Row  0-9  : Base_A (full width) — 10 rows
//   Row 10-15 : Top_A (cols 0-10) | Mid_A (cols 11-20) | Bot_A (cols 21-31) — 6 rows
//   Row 16-21 : Top_B (cols 0-10) | Mid_B (cols 11-20) | Bot_B (cols 21-31) — 6 rows
//   Row 22-31 : Base_B (full width) — 10 rows
function getZone(row: number, col: number): Zone {
  if (row <= 9)  return "Base_A";
  if (row >= 22) return "Base_B";
  const aside = row <= 15;
  if (col <= 10) return aside ? "Top_A" : "Top_B";
  if (col <= 20) return aside ? "Mid_A" : "Mid_B";
  return            aside ? "Bot_A" : "Bot_B";
}

// ── Canvas terrain ────────────────────────────────────────────────────────────

// Two-round integer hash — fully decorrelated per grid point
function hash2d(ix: number, iy: number, seed: number): number {
  let h = (ix * 1619 + iy * 31337 + seed * 6271) >>> 0;
  h = (h ^ (h >>> 16)) * 0x45d9f3b | 0;
  h = (h ^ (h >>> 16)) * 0x45d9f3b | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t: number): number { return t * t * (3 - 2 * t); }

// Bilinearly-interpolated value noise — produces smooth organic patches.
// scale = size of patches in tiles (higher → bigger blobs).
function valueNoise(col: number, row: number, scale: number, seed: number): number {
  const xi = Math.floor(col / scale);
  const yi = Math.floor(row / scale);
  const xf = smoothstep((col / scale) - xi);
  const yf = smoothstep((row / scale) - yi);
  const v00 = hash2d(xi,   yi,   seed);
  const v10 = hash2d(xi+1, yi,   seed);
  const v01 = hash2d(xi,   yi+1, seed);
  const v11 = hash2d(xi+1, yi+1, seed);
  return v00*(1-xf)*(1-yf) + v10*xf*(1-yf) + v01*(1-xf)*yf + v11*xf*yf;
}

// Per-tile hash — still fine for sparse details (tufts, pebbles)
function tileHash(row: number, col: number, salt: number): number {
  let h = (row * 2971 + col * 1193 + salt * 7919) >>> 0;
  h = (h ^ (h >>> 16)) * 0x45d9f3b | 0;
  h = (h ^ (h >>> 16)) * 0x45d9f3b | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function drawTerrain(ctx: CanvasRenderingContext2D, gridPx: number) {
  const t = gridPx / GRID_SIZE;

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const zone = getZone(row, col);
      let r: number, g: number, b: number;

      // Smooth organic noise — large patches (scale 5) for base colour mixing,
      // medium patches (scale 3) for battlefield brownness.
      const baseShade   = valueNoise(col, row, 5, 1); // 0-1 smooth
      const battleShade = valueNoise(col, row, 3, 2); // 0-1 smooth
      // Fine-detail brightness jitter (per tile, small amplitude)
      const jitter = tileHash(row, col, 7) * 0.18 - 0.09;

      if (zone === "Base_A" || zone === "Base_B") {
        // Bases: organic blend from dark green to light green across smooth patches
        // baseShade 0 → deep dark green,  baseShade 1 → bright meadow green
        const darkR = 12, darkG = 44, darkB = 10;
        const liteR = 34, liteG = 80, liteB = 16;
        const s = baseShade + jitter;
        r = Math.round(darkR + (liteR - darkR) * s);
        g = Math.round(darkG + (liteG - darkG) * s);
        b = Math.round(darkB + (liteB - darkB) * s);
      } else if (zone === "Mid_A" || zone === "Mid_B") {
        // Dirt battlefield — uniform brown, no river or green blobs
        r = Math.round(66 + battleShade * 22 + jitter * 24);
        g = Math.round(44 + battleShade * 14 + jitter * 14);
        b = Math.round(12 + battleShade * 8);
      } else {
        // Top / Bot lanes — uniform brown dirt
        r = Math.round(62 + battleShade * 22 + jitter * 20);
        g = Math.round(42 + battleShade * 14 + jitter * 14);
        b = Math.round(10 + battleShade * 8);
      }

      // Clamp to valid byte range
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));

      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(col * t, row * t, t + 0.5, t + 0.5);

      // Grass tufts — scattered decorative marks, placed per tile but sparse
      const tuftRoll = tileHash(row, col, 13);
      const isBase = zone === "Base_A" || zone === "Base_B";
      if (tuftRoll < (isBase ? 0.15 : 0.04)) {
        ctx.fillStyle = isBase ? `rgba(20,80,12,0.55)` : "rgba(40,70,10,0.45)";
        ctx.fillRect(col * t + t * 0.28, row * t + t * 0.52, t * 0.1, t * 0.42);
        ctx.fillRect(col * t + t * 0.54, row * t + t * 0.44, t * 0.08, t * 0.34);
      }

      // Pebbles on dirt (~6%) — use tileHash for placement
      const pebbleRoll = tileHash(row, col, 5);
      if ((zone === "Mid_A" || zone === "Mid_B") && pebbleRoll > 0.94) {
        const px = tileHash(row, col, 17);
        const py = tileHash(row, col, 19);
        ctx.fillStyle = "rgba(100,80,50,0.6)";
        ctx.beginPath();
        ctx.arc(col * t + t * (0.25 + px * 0.5), row * t + t * (0.25 + py * 0.5), t * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Zone outlines — draw a rect around each named zone
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 1;
  for (const b of Object.values(ZONE_BOUNDS)) {
    ctx.strokeRect(b.c0 * t, b.r0 * t, (b.c1 - b.c0 + 1) * t, (b.r1 - b.r0 + 1) * t);
  }
}

// ── Entity spec ───────────────────────────────────────────────────────────────
interface EntitySpec {
  key: string;
  player: "A" | "B";
  type: string;
  spriteUrl: string;
  row: number;
  col: number;
}

function computeEntities(gs: GameState): EntitySpec[] {
  const entities: EntitySpec[] = [];

  for (const player of (["A", "B"] as const)) {
    const ps = gs.players[player];

    // Town Center — always in base zone centre
    const tcTile = TC_TILES[ps.baseZone];
    entities.push({
      key: `${player}-TownCenter`,
      player,
      type: "TownCenter",
      spriteUrl: BUILDING_SPRITE.TownCenter,
      row: tcTile[0],
      col: tcTile[1],
    });

    // Buildings
    for (const zone of ZONES) {
      const list = ps.buildings[zone] ?? [];
      const seen: Record<string, number> = {};
      for (const btype of list) {
        const idx = seen[btype] ?? 0;
        seen[btype] = idx + 1;
        const [row, col] = getBuildingSlot(zone, player, btype, idx);
        entities.push({
          key: `${player}-${btype}-${zone}-${idx}`,
          player,
          type: btype,
          spriteUrl: BUILDING_SPRITE[btype] ?? BUILDING_SPRITE.Barracks,
          row,
          col,
        });
      }
    }

    // Units — max 5 visible per type per zone to keep it readable
    for (const zone of ZONES) {
      for (const [utype, count] of Object.entries(ps.units[zone] ?? {})) {
        const visible = Math.min(count, 5);
        for (let i = 0; i < visible; i++) {
          const [row, col] = getUnitSlot(zone, player, utype, i);
          entities.push({
            key: `${player}-${utype}-${zone}-${i}`,
            player,
            type: utype,
            spriteUrl: UNIT_SPRITE[utype] ?? UNIT_SPRITE.Militia,
            row,
            col,
          });
        }
      }
    }
  }

  return entities;
}

// ── GhostSprite ───────────────────────────────────────────────────────────────
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

interface GhostSpriteProps {
  anim: MoveAnimation;
  tileSize: number;
  onDone: (id: string) => void;
}

function GhostSprite({ anim, tileSize, onDone }: GhostSpriteProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const from = zoneCentroid(anim.fromZone, tileSize);
    const to   = zoneCentroid(anim.toZone,   tileSize);

    const tick = () => {
      const el = divRef.current;
      if (!el) return;
      const t = Math.min((performance.now() - anim.startedAt) / anim.duration, 1);
      const e = easeInOut(t);
      const x = from.x + (to.x - from.x) * e - tileSize / 2;
      const y = from.y + (to.y - from.y) * e - tileSize / 2;
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.style.opacity = String(1 - 0.7 * e);
      if (t < 1) { rafRef.current = requestAnimationFrame(tick); }
      else        { onDone(anim.id); }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [anim, tileSize, onDone]);

  return (
    <div
      ref={divRef}
      style={{ position: "absolute", top: 0, left: 0, width: tileSize, height: tileSize, pointerEvents: "none", willChange: "transform, opacity" }}
    >
      <img
        src={anim.spriteUrl}
        alt=""
        className={playerSpriteClass(anim.player)}
        style={{ display: "block", width: "100%", height: "100%", imageRendering: "pixelated", mixBlendMode: "lighten" }}
      />
    </div>
  );
}

// ── Zone label positions (top-left corner of each zone, in tile coords) ──────
const ZONE_LABEL: Record<Zone, [number, number]> = {
  Base_A: [0,  1],
  Top_A:  [10, 1],   Mid_A:  [10, 12],  Bot_A:  [10, 22],
  Top_B:  [16, 1],   Mid_B:  [16, 12],  Bot_B:  [16, 22],
  Base_B: [22, 1],
};

const ZONE_DISPLAY_NAME: Record<Zone, string> = {
  Base_A: "Village A",
  Top_A:  "Left Flank A",
  Mid_A:  "Battlefield A",
  Bot_A:  "Right Flank A",
  Top_B:  "Left Flank B",
  Mid_B:  "Battlefield B",
  Bot_B:  "Right Flank B",
  Base_B: "Village B",
};

// ── TileMap ───────────────────────────────────────────────────────────────────
export function TileMap({ gs }: TileMapProps) {
  const outerRef  = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevGsRef = useRef<GameState>(gs);
  const tileSize  = useTileSize(outerRef);
  const gridPx    = tileSize * GRID_SIZE;

  // Redraw canvas whenever grid size changes
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = gridPx;
    canvas.height = gridPx;
    const ctx = canvas.getContext("2d");
    if (ctx) drawTerrain(ctx, gridPx);
  }, [gridPx]);

  useEffect(drawCanvas, [drawCanvas]);

  // Movement animations
  const [animations, setAnimations] = useState<MoveAnimation[]>([]);
  useEffect(() => {
    const moves = detectMoves(prevGsRef.current, gs);
    if (moves.length > 0) setAnimations((p) => [...p, ...moves]);
    prevGsRef.current = gs;
  }, [gs]);
  const handleAnimDone = useCallback((id: string) => {
    setAnimations((p) => p.filter((a) => a.id !== id));
  }, []);

  const entities = computeEntities(gs);

  // Contested zones (combat pulse)
  const contested = new Set<Zone>(
    ZONES.filter((z) =>
      Object.values(gs.players.A.units[z] ?? {}).some((c) => c > 0) &&
      Object.values(gs.players.B.units[z] ?? {}).some((c) => c > 0),
    ),
  );

  return (
    <div
      className="aoe-panel"
      style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}
    >
      <div className="aoe-panel-title" style={{ flexShrink: 0 }}>Battlefield</div>

      {/* Outer — centres the grid square in the panel */}
      <div
        ref={outerRef}
        style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}
      >
        {/* Fixed-size grid */}
        <div style={{ position: "relative", width: gridPx, height: gridPx, flexShrink: 0 }}>

          {/* Canvas terrain */}
          <canvas
            ref={canvasRef}
            style={{ position: "absolute", inset: 0, width: gridPx, height: gridPx, imageRendering: "pixelated" }}
          />

          {/* Combat pulse overlays */}
          {Array.from(contested).map((zone) => {
            const b = ZONE_BOUNDS[zone];
            return (
              <div
                key={`pulse-${zone}`}
                className="combat-pulse"
                style={{
                  position: "absolute",
                  left: b.c0 * tileSize, top: b.r0 * tileSize,
                  width:  (b.c1 - b.c0 + 1) * tileSize,
                  height: (b.r1 - b.r0 + 1) * tileSize,
                  pointerEvents: "none",
                }}
              />
            );
          })}

          {/* Entities — 1 tile each, grid-snapped */}
          {entities.map((e) => (
            <div
              key={e.key}
              style={{
                position: "absolute",
                left:   e.col * tileSize,
                top:    e.row * tileSize,
                width:  tileSize,
                height: tileSize,
                border: `1px solid ${e.player === "A" ? "rgba(68,136,255,0.85)" : "rgba(255,68,68,0.85)"}`,
                boxSizing: "border-box",
                pointerEvents: "none",
                overflow: "hidden",
              }}
            >
              <img
                src={e.spriteUrl}
                alt={e.type}
                style={{
                  display: "block",
                  width: "100%",
                  height: "100%",
                  imageRendering: "pixelated",
                  mixBlendMode: "lighten",
                }}
              />
            </div>
          ))}

          {/* Ghost movement sprites */}
          {animations.map((anim) => (
            <GhostSprite key={anim.id} anim={anim} tileSize={tileSize} onDone={handleAnimDone} />
          ))}

          {/* Zone labels */}
          {ZONES.map((zone) => {
            const [r, c] = ZONE_LABEL[zone];
            return (
              <div
                key={`lbl-${zone}`}
                style={{
                  position: "absolute",
                  left: c * tileSize + 2,
                  top:  r * tileSize + 10,
                  fontSize: Math.max(7, tileSize * 0.5) + "px",
                  fontFamily: "Cinzel, serif",
                  color: "rgba(240,210,140,0.75)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  textShadow: "0 1px 3px rgba(0,0,0,0.9)",
                  userSelect: "none",
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                  lineHeight: 1,
                  fontWeight: 600,
                }}
              >
                {ZONE_DISPLAY_NAME[zone]}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
