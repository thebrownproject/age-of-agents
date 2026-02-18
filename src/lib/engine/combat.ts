/**
 * Deterministic combat resolution — port of engine/combat.py
 * Fix: Catapult "Building" counter now correctly fires vs any defending enemy units.
 */

import { UNITS, INFANTRY_TYPES, COUNTER_BONUS, BUILDINGS, Zone } from "@/lib/config";
import { GameState, PlayerState, addLog } from "@/lib/engine/state";

export function resolveCombat(gs: GameState, zone: Zone): void {
  const pa = gs.players["A"];
  const pb = gs.players["B"];

  // Towers fire before field combat
  applyTowerDamage(gs, zone, pa, pb);

  // Refresh after tower damage
  const unitsA = activeUnits(pa, zone);
  const unitsB = activeUnits(pb, zone);

  if (!hasUnits(unitsA) || !hasUnits(unitsB)) {
    handleBaseAttack(gs, zone, pa, pb, unitsA, unitsB);
    return;
  }

  addLog(gs, `Combat in ${zone}: A=${fmt(unitsA)} vs B=${fmt(unitsB)}`);

  // Both sides deal damage simultaneously
  const dmgToB = computeTotalDamage(unitsA, unitsB, pa.attackBonus);
  const dmgToA = computeTotalDamage(unitsB, unitsA, pb.attackBonus);

  applyDamage(pa, zone, activeUnits(pa, zone), dmgToA, gs, pa.armorBonus);
  applyDamage(pb, zone, activeUnits(pb, zone), dmgToB, gs, pb.armorBonus);

  // Catapult TC damage if attacking enemy base
  handleBaseAttack(
    gs,
    zone,
    pa,
    pb,
    activeUnits(pa, zone),
    activeUnits(pb, zone),
  );
}

function applyTowerDamage(gs: GameState, zone: Zone, pa: PlayerState, pb: PlayerState): void {
  const aTowers = pa.buildings[zone].filter((b) => b === "Tower").length;
  if (aTowers > 0) {
    const bUnits = activeUnits(pb, zone);
    if (hasUnits(bUnits)) {
      const dmg = aTowers * (BUILDINGS["Tower"].damage_per_turn ?? 8);
      addLog(gs, `  A's ${aTowers} Tower(s) in ${zone} fire ${dmg} dmg at B's units`);
      applyDamage(pb, zone, bUnits, dmg, gs, pb.armorBonus);
    }
  }

  const bTowers = pb.buildings[zone].filter((b) => b === "Tower").length;
  if (bTowers > 0) {
    const aUnits = activeUnits(pa, zone);
    if (hasUnits(aUnits)) {
      const dmg = bTowers * (BUILDINGS["Tower"].damage_per_turn ?? 8);
      addLog(gs, `  B's ${bTowers} Tower(s) in ${zone} fire ${dmg} dmg at A's units`);
      applyDamage(pa, zone, aUnits, dmg, gs, pa.armorBonus);
    }
  }
}

function computeTotalDamage(
  attackers: Record<string, number>,
  defenders: Record<string, number>,
  attackBonus: number,
): number {
  let total = 0;

  for (const [atype, acount] of Object.entries(attackers)) {
    if (acount <= 0) continue;
    const baseAtk = (UNITS[atype]?.atk ?? 0) + attackBonus;
    const baseDmg = baseAtk * acount;
    const counter = UNITS[atype]?.counter ?? null;
    let bonus = 1.0;

    if (counter === "Infantry") {
      // Archer counters infantry (Villager or Militia present)
      if (Object.keys(defenders).some((d) => INFANTRY_TYPES.has(d) && (defenders[d] ?? 0) > 0)) {
        bonus = COUNTER_BONUS;
      }
    } else if (counter === "Archer") {
      if ((defenders["Archer"] ?? 0) > 0) bonus = COUNTER_BONUS;
    } else if (counter === "Building") {
      // Catapult: bonus vs any defenders (simulating siege effectiveness)
      // FIX: previously never triggered because "Building" was never in defenders dict
      if (hasUnits(defenders)) bonus = COUNTER_BONUS;
    }

    total += baseDmg * bonus;
  }

  return total;
}

function applyDamage(
  player: PlayerState,
  zone: Zone,
  currentUnits: Record<string, number>,
  damage: number,
  gs: GameState,
  armorBonus: number,
): void {
  let remaining = damage;

  // Sort by HP descending (tanks high-HP units first)
  const sortedTypes = Object.keys(currentUnits).sort(
    (a, b) => (UNITS[b]?.hp ?? 0) - (UNITS[a]?.hp ?? 0),
  );

  for (const utype of sortedTypes) {
    if (remaining <= 0) break;
    const count = currentUnits[utype] ?? 0;
    if (count <= 0) continue;

    const unitHp = (UNITS[utype]?.hp ?? 1) + armorBonus;
    let kills = Math.min(count, Math.floor(remaining / unitHp));
    remaining -= kills * unitHp;

    if (remaining > 0 && kills < count) {
      kills += 1;
      remaining = 0;
    }

    const actualKills = Math.min(kills, count);
    currentUnits[utype] = count - actualKills;

    if (actualKills > 0) {
      addLog(gs, `  P${player.playerId} lost ${actualKills}×${utype} in ${zone}`);
      player.unitsLost += actualKills;
      const opponentPid = player.playerId === "A" ? "B" : "A";
      gs.players[opponentPid].unitsKilled += actualKills;
    }
  }

  // Write back to player state
  for (const [utype, cnt] of Object.entries(currentUnits)) {
    player.units[zone][utype] = cnt;
  }
}

function baseAttack(
  gs: GameState,
  attackerUnits: Record<string, number>,
  attackerPid: string,
  defender: PlayerState,
  zone: Zone,
): void {
  let dmg = Object.entries(attackerUnits).reduce(
    (sum, [utype, count]) => sum + (UNITS[utype]?.atk ?? 0) * count,
    0,
  );
  if (dmg <= 0) return;

  // Wall absorption
  const wallHp = defender.buildingHp[zone]?.["Wall"] ?? 0;
  if (wallHp > 0) {
    const absorbed = Math.min(dmg, wallHp);
    dmg -= absorbed;
    const newWallHp = wallHp - absorbed;
    if (newWallHp <= 0) {
      defender.buildingHp[zone]["Wall"] = 0;
      defender.buildings[zone] = defender.buildings[zone].filter((b) => b !== "Wall");
      addLog(gs, `  ${attackerPid}'s forces destroyed P${defender.playerId}'s Wall in ${zone}!`);
    } else {
      defender.buildingHp[zone]["Wall"] = newWallHp;
      addLog(gs, `  P${defender.playerId}'s Wall absorbed damage (HP: ${newWallHp})`);
    }
  }

  if (dmg > 0) {
    const unitSummary = Object.entries(attackerUnits)
      .filter(([, c]) => c > 0)
      .map(([u, c]) => `${c}×${u}`)
      .join(", ");
    defender.townCenterHp = Math.max(0, defender.townCenterHp - dmg);
    addLog(
      gs,
      `  ${attackerPid}'s forces (${unitSummary}) hit P${defender.playerId}'s Town Center ` +
        `for ${dmg} dmg (TC HP: ${defender.townCenterHp})`,
    );
  }
}

function handleBaseAttack(
  gs: GameState,
  zone: Zone,
  pa: PlayerState,
  pb: PlayerState,
  unitsA: Record<string, number>,
  unitsB: Record<string, number>,
): void {
  if (zone === pb.baseZone && hasUnits(unitsA) && !hasUnits(unitsB)) {
    baseAttack(gs, unitsA, "A", pb, zone);
  }
  if (zone === pa.baseZone && hasUnits(unitsB) && !hasUnits(unitsA)) {
    baseAttack(gs, unitsB, "B", pa, zone);
  }
}

// Helpers
function activeUnits(player: PlayerState, zone: Zone): Record<string, number> {
  return Object.fromEntries(
    Object.entries(player.units[zone] ?? {}).filter(([, v]) => v > 0),
  );
}

function hasUnits(units: Record<string, number>): boolean {
  return Object.values(units).some((v) => v > 0);
}

function fmt(units: Record<string, number>): string {
  return Object.entries(units)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v}x${k}`)
    .join(", ");
}
