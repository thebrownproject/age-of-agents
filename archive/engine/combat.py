"""
Deterministic combat resolution and counter system.
"""
from __future__ import annotations
from typing import Dict, List, Tuple

from config import UNITS, INFANTRY_TYPES, COUNTER_BONUS, BUILDINGS
from engine.state import GameState, PlayerState


def resolve_combat(gs: GameState, zone: str) -> None:
    """
    Resolve one round of combat in a zone where both players have units.
    Modifies player unit counts in-place.
    Also handles Catapult attacks on Town Center if zone is enemy base.
    """
    pa = gs.players["A"]
    pb = gs.players["B"]

    # Apply tower damage before field combat
    _apply_tower_damage(gs, zone, pa, pb)

    # Refresh unit dicts after tower damage
    units_a = {k: v for k, v in pa.units.get(zone, {}).items() if v > 0}
    units_b = {k: v for k, v in pb.units.get(zone, {}).items() if v > 0}

    if not units_a or not units_b:
        # No field combat if only one side present
        _handle_base_attack(gs, zone, pa, pb, units_a, units_b)
        return

    gs.add_log(f"Combat in {zone}: A={_fmt(units_a)} vs B={_fmt(units_b)}")

    # Both sides deal damage simultaneously
    dmg_to_b = _compute_total_damage(units_a, units_b, pa.attack_bonus)
    dmg_to_a = _compute_total_damage(units_b, units_a, pb.attack_bonus)

    _apply_damage(pa, zone, units_a, dmg_to_a, gs, pa.armor_bonus)
    _apply_damage(pb, zone, units_b, dmg_to_b, gs, pb.armor_bonus)

    # Catapult TC damage if attacking enemy base
    _handle_base_attack(gs, zone, pa, pb,
                        {k: v for k, v in pa.units.get(zone, {}).items() if v > 0},
                        {k: v for k, v in pb.units.get(zone, {}).items() if v > 0})


def _apply_tower_damage(gs: GameState, zone: str, pa: PlayerState, pb: PlayerState) -> None:
    """Towers in a zone fire at enemy units before field combat."""
    # A's towers fire at B's units in the same zone
    a_towers = pa.buildings.get(zone, []).count("Tower")
    if a_towers > 0:
        b_units = {k: v for k, v in pb.units.get(zone, {}).items() if v > 0}
        if b_units:
            tower_dmg = a_towers * BUILDINGS["Tower"]["damage_per_turn"]
            gs.add_log(f"  A's {a_towers} Tower(s) in {zone} fire {tower_dmg} dmg at B's units")
            _apply_damage(pb, zone, b_units, float(tower_dmg), gs, pb.armor_bonus)

    # B's towers fire at A's units in the same zone
    b_towers = pb.buildings.get(zone, []).count("Tower")
    if b_towers > 0:
        a_units = {k: v for k, v in pa.units.get(zone, {}).items() if v > 0}
        if a_units:
            tower_dmg = b_towers * BUILDINGS["Tower"]["damage_per_turn"]
            gs.add_log(f"  B's {b_towers} Tower(s) in {zone} fire {tower_dmg} dmg at A's units")
            _apply_damage(pa, zone, a_units, float(tower_dmg), gs, pa.armor_bonus)


def _compute_total_damage(attackers: Dict[str, int], defenders: Dict[str, int],
                          attack_bonus: int = 0) -> float:
    """Return total damage dealt by attackers to defenders."""
    total = 0.0
    for atype, acount in attackers.items():
        base_atk = UNITS[atype]["atk"] + attack_bonus
        base_dmg = base_atk * acount
        counter = UNITS[atype]["counter"]
        bonus = 1.0
        if counter == "Infantry":
            # Archer counters infantry
            for dtype in defenders:
                if dtype in INFANTRY_TYPES:
                    bonus = COUNTER_BONUS
                    break
        elif counter is not None:
            # Knight counters Archer, etc.
            if counter in defenders:
                bonus = COUNTER_BONUS
        total += base_dmg * bonus
    return total


def _apply_damage(player: PlayerState, zone: str,
                  current_units: Dict[str, int],
                  damage: float, gs: GameState,
                  armor_bonus: int = 0) -> None:
    """Distribute damage to units in descending HP order until exhausted."""
    remaining = damage
    # Sort unit types by HP descending (tank high-HP units first)
    sorted_types = sorted(current_units.keys(),
                          key=lambda u: UNITS[u]["hp"], reverse=True)
    for utype in sorted_types:
        if remaining <= 0:
            break
        count = current_units[utype]
        unit_hp = UNITS[utype]["hp"] + armor_bonus
        # How many full kills?
        kills = min(count, int(remaining // unit_hp))
        remaining -= kills * unit_hp
        # Partial kill on one more unit if damage remains
        if remaining > 0 and kills < count:
            kills += 1
            remaining = 0
        actual_kills = min(kills, count)
        current_units[utype] = count - actual_kills
        if actual_kills:
            gs.add_log(f"  P{player.player_id} lost {actual_kills}×{utype} in {zone}")
            player.units_lost += actual_kills
            opponent_pid = "B" if player.player_id == "A" else "A"
            gs.players[opponent_pid].units_killed += actual_kills

    # Write back
    for utype, cnt in current_units.items():
        player.units[zone][utype] = cnt


def _base_attack(gs: GameState, attacker_units: Dict[str, int],
                 attacker_pid: str, defender: PlayerState, zone: str) -> None:
    """All units in undefended enemy base attack the Town Center (Wall absorbs first)."""
    dmg = sum(UNITS[utype]["atk"] * count
              for utype, count in attacker_units.items() if count > 0)
    if dmg <= 0:
        return

    # Wall absorption: damage hits Wall HP first
    wall_hp = defender.building_hp.get(zone, {}).get("Wall", 0)
    if wall_hp > 0:
        absorbed = min(dmg, wall_hp)
        dmg -= absorbed
        wall_hp -= absorbed
        if wall_hp <= 0:
            defender.building_hp[zone]["Wall"] = 0
            if "Wall" in defender.buildings.get(zone, []):
                defender.buildings[zone].remove("Wall")
            gs.add_log(f"  {attacker_pid}'s forces destroyed P{defender.player_id}'s Wall in {zone}!")
        else:
            defender.building_hp[zone]["Wall"] = wall_hp
            gs.add_log(f"  P{defender.player_id}'s Wall absorbed damage (HP: {wall_hp})")

    if dmg > 0:
        unit_summary = ", ".join(f"{c}×{u}" for u, c in attacker_units.items() if c > 0)
        defender.town_center_hp = max(0, defender.town_center_hp - dmg)
        gs.add_log(
            f"  {attacker_pid}'s forces ({unit_summary}) hit P{defender.player_id}'s Town Center "
            f"for {dmg} dmg (TC HP: {defender.town_center_hp})"
        )


def _handle_base_attack(gs: GameState, zone: str,
                        pa: PlayerState, pb: PlayerState,
                        units_a: Dict[str, int], units_b: Dict[str, int]) -> None:
    """
    Any units in an undefended enemy base zone attack the Town Center.
    """
    # A's units in B's base with no defenders
    if zone == pb.base_zone and units_a and not units_b:
        _base_attack(gs, units_a, "A", pb, zone)
    # B's units in A's base with no defenders
    if zone == pa.base_zone and units_b and not units_a:
        _base_attack(gs, units_b, "B", pa, zone)


def _fmt(units: Dict[str, int]) -> str:
    return ", ".join(f"{v}x{k}" for k, v in units.items() if v)
