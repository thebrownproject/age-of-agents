"use client";

import { GameState } from "@/lib/engine/state";
import { Zone } from "@/lib/config";

interface ZoneMapProps {
  gs: GameState;
}

interface ZoneCellProps {
  zone: Zone;
  gs: GameState;
}

function ZoneCell({ zone, gs }: ZoneCellProps) {
  const unitsA = Object.fromEntries(
    Object.entries(gs.players.A.units[zone] ?? {}).filter(([, v]) => v > 0),
  );
  const unitsB = Object.fromEntries(
    Object.entries(gs.players.B.units[zone] ?? {}).filter(([, v]) => v > 0),
  );
  const hasA = Object.keys(unitsA).length > 0;
  const hasB = Object.keys(unitsB).length > 0;
  const buildingsA = gs.players.A.buildings[zone] ?? [];
  const buildingsB = gs.players.B.buildings[zone] ?? [];

  let cellClass = "zone-cell";
  if (hasA && hasB) cellClass += " zone-cell-contested";
  else if (hasA) cellClass += " zone-cell-own";
  else if (hasB) cellClass += " zone-cell-enemy";

  return (
    <div className={cellClass} style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <div className="zone-name">{zone.replace("_", " ")}</div>

      {hasA && (
        <div style={{ color: "#6aaa4a", fontSize: "0.65rem" }}>
          A: {Object.entries(unitsA).map(([u, c]) => `${c}${u[0]}`).join(" ")}
        </div>
      )}
      {hasB && (
        <div style={{ color: "#aa4a4a", fontSize: "0.65rem" }}>
          B: {Object.entries(unitsB).map(([u, c]) => `${c}${u[0]}`).join(" ")}
        </div>
      )}
      {buildingsA.length > 0 && (
        <div style={{ color: "#4a9a4a", fontSize: "0.6rem", opacity: 0.8 }}>
          [{buildingsA.join(",")}]
        </div>
      )}
      {buildingsB.length > 0 && (
        <div style={{ color: "#9a4a4a", fontSize: "0.6rem", opacity: 0.8 }}>
          [{buildingsB.join(",")}]
        </div>
      )}
    </div>
  );
}

export function ZoneMap({ gs }: ZoneMapProps) {
  /*
   * Visual layout matching the 3-lane map:
   *
   *          [Top_A] ─── [Top_B]
   *         /                   \
   * [Base_A]  [Mid_A] ─── [Mid_B]  [Base_B]
   *         \                   /
   *          [Bot_A] ─── [Bot_B]
   *
   * Grid: 4 columns × 3 rows
   * col 0=BaseA, col 1=A lanes, col 2=B lanes, col 3=BaseB
   */
  return (
    <div className="aoe-panel" style={{ padding: "0.5rem" }}>
      <div className="aoe-panel-title" style={{ marginBottom: "0.5rem" }}>
        Battlefield Map
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gridTemplateRows: "1fr 1fr 1fr",
          gap: "4px",
          minHeight: "200px",
        }}
      >
        {/* Row 0: Top lane */}
        <div style={{ gridColumn: "1", gridRow: "1 / 4", alignSelf: "center" }}>
          <ZoneCell zone="Base_A" gs={gs} />
        </div>
        <div style={{ gridColumn: "2", gridRow: "1" }}>
          <ZoneCell zone="Top_A" gs={gs} />
        </div>
        <div style={{ gridColumn: "3", gridRow: "1" }}>
          <ZoneCell zone="Top_B" gs={gs} />
        </div>
        <div style={{ gridColumn: "4", gridRow: "1 / 4", alignSelf: "center" }}>
          <ZoneCell zone="Base_B" gs={gs} />
        </div>

        {/* Row 1: Mid lane */}
        <div style={{ gridColumn: "2", gridRow: "2" }}>
          <ZoneCell zone="Mid_A" gs={gs} />
        </div>
        <div style={{ gridColumn: "3", gridRow: "2" }}>
          <ZoneCell zone="Mid_B" gs={gs} />
        </div>

        {/* Row 2: Bot lane */}
        <div style={{ gridColumn: "2", gridRow: "3" }}>
          <ZoneCell zone="Bot_A" gs={gs} />
        </div>
        <div style={{ gridColumn: "3", gridRow: "3" }}>
          <ZoneCell zone="Bot_B" gs={gs} />
        </div>
      </div>
    </div>
  );
}
