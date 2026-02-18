"use client";

import { useMemo } from "react";
import { GameState, newGame } from "@/lib/engine/state";
import { TileMap } from "@/components/TileMap";
import { PlayerPanel } from "@/components/PlayerPanel";

// ── Build a rich mock GameState so every map feature is visible ───────────────
function mockGameState(): GameState {
  const gs = newGame();
  gs.turn = 7;

  // Player A — units spread across the map
  gs.players.A.units.Base_A  = { Villager: 4 };
  gs.players.A.units.Top_A   = { Militia: 3, Archer: 1 };
  gs.players.A.units.Mid_A   = { Knight: 2 };          // contested with B
  gs.players.A.units.Bot_A   = { Archer: 2 };
  gs.players.A.units.Mid_B   = { Catapult: 1 };        // A is pushing B's lanes
  gs.players.A.resources     = { food: 312, wood: 180, gold: 95 };
  gs.players.A.age           = 2;
  gs.players.A.townCenterHp  = 1800;
  gs.players.A.upgrades      = ["fletching"];
  gs.players.A.attackBonus   = 1;
  gs.players.A.armorBonus    = 0;
  gs.players.A.unitsKilled   = 3;
  gs.players.A.villagerTasks = { food: 2, wood: 1 };
  gs.players.A.productionQueue = [{ unitType: "Knight", turnsLeft: 2 }];
  gs.players.A.buildings.Base_A  = ["Barracks", "Blacksmith"];
  gs.players.A.buildings.Top_A   = ["Tower"];
  gs.players.A.buildings.Mid_A   = ["Wall"];

  // Player B — defending and counter-pushing
  gs.players.B.units.Base_B  = { Villager: 3 };
  gs.players.B.units.Top_B   = { Archer: 2, Militia: 1 };
  gs.players.B.units.Mid_A   = { Knight: 1, Militia: 2 }; // contested with A in Mid_A
  gs.players.B.units.Mid_B   = { Knight: 2 };
  gs.players.B.units.Bot_B   = { Archer: 1 };
  gs.players.B.resources     = { food: 240, wood: 210, gold: 60 };
  gs.players.B.age           = 2;
  gs.players.B.townCenterHp  = 2200;
  gs.players.B.upgrades      = [];
  gs.players.B.attackBonus   = 0;
  gs.players.B.armorBonus    = 1;
  gs.players.B.unitsKilled   = 2;
  gs.players.B.villagerTasks = { food: 2, gold: 1 };
  gs.players.B.productionQueue = [{ unitType: "Archer", turnsLeft: 1 }];
  gs.players.B.buildings.Base_B  = ["Barracks", "Range"];
  gs.players.B.buildings.Mid_B   = ["Tower"];
  gs.players.B.buildings.Bot_B   = ["Wall"];

  gs.log = [
    "[T1] Player A: task 2 villagers to food, 1 to wood",
    "[T2] Player B: train Militia",
    "[T3] Combat in Mid_A — A Knight vs B Militia",
    "[T4] Player A: build Tower in Top_A",
    "[T5] Tower(s) in Top_A fire — 1 B Archer lost",
    "[T6] Player A: train Knight (2t)",
    "[T7] Combat in Mid_A — contested zone",
  ];

  return gs;
}

export function TestBoard() {
  const gs = useMemo(mockGameState, []);

  return (
    <div
      style={{
        height: "100vh",
        overflow: "hidden",
        padding: "0.6rem",
        background: "radial-gradient(ellipse at top, #1a1208 0%, #0d0a06 100%)",
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
      }}
    >
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
        }}
      >
        <h2
          style={{
            fontFamily: "Cinzel, serif",
            fontSize: "1rem",
            color: "var(--aoe-gold)",
            margin: 0,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Age of Agents
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            className="turn-badge"
            style={{ background: "rgba(139,105,20,0.25)", borderColor: "#8b6914" }}
          >
            TEST MODE — Turn {gs.turn}
          </span>
          <a
            href="/"
            className="aoe-btn"
            style={{ textDecoration: "none", fontSize: "0.7rem", padding: "0.3rem 0.75rem" }}
          >
            Exit Test
          </a>
        </div>
      </div>

      {/* Map + sidebar */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          gap: "0.4rem",
          overflow: "hidden",
        }}
      >
        <TileMap gs={gs} />
        <div
          style={{
            width: "240px",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
            minHeight: 0,
          }}
        >
          <PlayerPanel player={gs.players.B} model="claude-sonnet-4-6" persona="balanced" />
          <PlayerPanel player={gs.players.A} model="claude-sonnet-4-6" persona="balanced" />
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          flexShrink: 0,
          textAlign: "center",
          fontSize: "0.55rem",
          opacity: 0.3,
          fontFamily: "Cinzel, serif",
          letterSpacing: "0.08em",
        }}
      >
        ⚗ Static mock — navigate to localhost:3000 to start a real game
      </div>
    </div>
  );
}
