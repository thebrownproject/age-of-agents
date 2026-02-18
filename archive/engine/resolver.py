"""
Orchestrates one full turn: economy → validate → move → combat → victory.
"""
from __future__ import annotations
import asyncio
import json
import os
from typing import Dict, Optional, Tuple

from config import TURN_LIMIT, ZONES, UNITS, BUILDINGS, AGE_ADVANCE_COSTS, UPGRADES
from engine.state import GameState, ProductionItem
from engine.economy import economy_tick
from engine.combat import resolve_combat
from engine.validator import validate_action, deduct_costs


async def run_turn(
    gs: GameState,
    agents: Dict[str, object],  # {"A": Agent, "B": Agent}
    renderer=None,
    log_dir: Optional[str] = None,
) -> Optional[str]:
    """
    Run one full game turn. Returns winner string or None if game continues.
    Mutates gs in-place.
    """
    # 1. Economy tick (uses villager_tasks from previous turn)
    economy_tick(gs)

    # 2. Build observations
    from prompts.builder import build_observation
    obs_a = build_observation(gs, "A")
    obs_b = build_observation(gs, "B")

    # 3. Parallel API calls
    raw_a, raw_b = await asyncio.gather(
        _get_agent_action(agents["A"], obs_a, "A", gs),
        _get_agent_action(agents["B"], obs_b, "B", gs),
    )

    # 4. Validate actions
    action_a = validate_action(raw_a, gs.players["A"], gs.turn)
    action_b = validate_action(raw_b, gs.players["B"], gs.turn)

    gs.add_log(f"A actions: train={action_a['train']} build={action_a['build']} move={action_a['move']}")
    gs.add_log(f"B actions: train={action_b['train']} build={action_b['build']} move={action_b['move']}")

    # 5a. Process age advances
    _process_advance_age(gs, "A", action_a)
    _process_advance_age(gs, "B", action_b)

    # 5b. Process villager tasks
    _process_task_villagers(gs, "A", action_a)
    _process_task_villagers(gs, "B", action_b)

    # 5c. Process research
    _process_research(gs, "A", action_a)
    _process_research(gs, "B", action_b)

    # 5d. Process builds
    _process_builds(gs, "A", action_a)
    _process_builds(gs, "B", action_b)

    # 5e. Process trains (deducts costs internally)
    _process_trains(gs, "A", action_a)
    _process_trains(gs, "B", action_b)

    # 6. Deduct costs (builds only — train costs already done)
    deduct_costs(action_a, gs.players["A"])
    deduct_costs(action_b, gs.players["B"])

    # 7. Process moves
    _process_moves(gs, "A", action_a)
    _process_moves(gs, "B", action_b)

    # 8. Combat resolution for each zone
    for zone in ZONES:
        resolve_combat(gs, zone)

    # 9. Victory check
    winner = _check_victory(gs)

    # 10. Render + save log
    if renderer:
        renderer.render(gs)

    if log_dir:
        _save_turn_log(gs, log_dir)

    gs.turn += 1
    return winner


async def _get_agent_action(agent, observation: dict, pid: str, gs: GameState) -> dict:
    """Call agent with timeout/error handling."""
    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(agent.get_action, observation),
            timeout=60.0,
        )
        return result if isinstance(result, dict) else {}
    except asyncio.TimeoutError:
        gs.add_log(f"P{pid} agent timed out — no-op")
        return {}
    except Exception as e:
        gs.add_log(f"P{pid} agent error: {e} — no-op")
        return {}


def _process_advance_age(gs: GameState, pid: str, action: dict) -> None:
    if not action.get("advance_age"):
        return
    player = gs.players[pid]
    next_age = player.age + 1
    cost = AGE_ADVANCE_COSTS.get(next_age, {})
    if not all(player.resources.get(r, 0) >= cost.get(r, 0) for r in cost):
        return
    for res, amount in cost.items():
        player.resources[res] = player.resources.get(res, 0) - amount
        player.resources_banked += amount
    player.age = next_age
    from config import AGE_NAMES
    gs.add_log(f"P{pid} advanced to Age {next_age} ({AGE_NAMES[next_age]})")


def _process_task_villagers(gs: GameState, pid: str, action: dict) -> None:
    tasks = action.get("task_villagers", {})
    if not tasks:
        return
    player = gs.players[pid]
    player.villager_tasks = dict(tasks)
    gs.add_log(f"P{pid} tasked villagers: {tasks}")


def _process_research(gs: GameState, pid: str, action: dict) -> None:
    player = gs.players[pid]
    for item in action.get("research", []):
        upgrade_name = item.get("upgrade")
        if upgrade_name not in UPGRADES:
            continue
        if upgrade_name in player.upgrades:
            continue
        upg = UPGRADES[upgrade_name]
        cost = upg["cost"]
        if not all(player.resources.get(r, 0) >= cost.get(r, 0) for r in cost):
            continue
        for res, amount in cost.items():
            player.resources[res] = player.resources.get(res, 0) - amount
            player.resources_banked += amount
        player.upgrades.append(upgrade_name)
        player.attack_bonus += upg.get("attack_bonus", 0)
        player.armor_bonus += upg.get("armor_bonus", 0)
        gs.add_log(f"P{pid} researched {upgrade_name} (+{upg.get('attack_bonus',0)} atk, +{upg.get('armor_bonus',0)} armor)")


def _process_builds(gs: GameState, pid: str, action: dict) -> None:
    player = gs.players[pid]
    for item in action.get("build", []):
        building = item["building"]
        cost = BUILDINGS[building]["cost"]
        if not all(player.resources.get(r, 0) >= cost.get(r, 0) for r in cost):
            continue
        player.buildings[player.base_zone].append(building)
        # Track HP for Wall and Tower
        if building in ("Wall", "Tower"):
            zone_hp = player.building_hp.setdefault(player.base_zone, {})
            zone_hp[building] = zone_hp.get(building, 0) + BUILDINGS[building]["hp"]
        gs.add_log(f"P{pid} built {building} in {player.base_zone}")


def _process_trains(gs: GameState, pid: str, action: dict) -> None:
    player = gs.players[pid]
    for item in action.get("train", []):
        unit = item["unit"]
        count = item["count"]
        turns = UNITS[unit]["train_turns"]
        cost = UNITS[unit]["cost"]
        # Deduct per unit and add to queue
        for _ in range(count):
            if not all(player.resources.get(r, 0) >= cost.get(r, 0) for r in cost):
                break
            for res, amount in cost.items():
                player.resources[res] = player.resources.get(res, 0) - amount
                player.resources_banked += amount
            player.production_queue.append(ProductionItem(unit, turns))
        gs.add_log(f"P{pid} queued {count}×{unit} ({turns} turn(s) each)")


def _process_moves(gs: GameState, pid: str, action: dict) -> None:
    player = gs.players[pid]
    for item in action.get("move", []):
        unit = item["unit"]
        count = item["count"]
        from_zone = item["from"]
        to_zone = item["to"]
        available = player.units.get(from_zone, {}).get(unit, 0)
        actual = min(count, available)
        if actual < 1:
            continue
        player.units[from_zone][unit] = available - actual
        to_units = player.units.setdefault(to_zone, {})
        to_units[unit] = to_units.get(unit, 0) + actual
        gs.add_log(f"P{pid} moved {actual}×{unit}: {from_zone}→{to_zone}")


def _check_victory(gs: GameState) -> Optional[str]:
    tc_a = gs.players["A"].town_center_hp
    tc_b = gs.players["B"].town_center_hp

    if tc_a <= 0 and tc_b <= 0:
        gs.winner = "draw"
        gs.add_log("Draw — both Town Centers destroyed!")
        return "draw"
    if tc_b <= 0:
        gs.winner = "A"
        gs.add_log("Player A wins — destroyed B's Town Center!")
        return "A"
    if tc_a <= 0:
        gs.winner = "B"
        gs.add_log("Player B wins — destroyed A's Town Center!")
        return "B"

    if gs.turn >= TURN_LIMIT:
        score_a = gs.players["A"].score()
        score_b = gs.players["B"].score()
        if score_a > score_b:
            gs.winner = "A"
            msg = f"Turn limit! A wins by score ({score_a} vs {score_b})"
        elif score_b > score_a:
            gs.winner = "B"
            msg = f"Turn limit! B wins by score ({score_b} vs {score_a})"
        else:
            gs.winner = "draw"
            msg = f"Turn limit! Draw ({score_a} each)"
        gs.add_log(msg)
        return gs.winner

    return None


def _save_turn_log(gs: GameState, log_dir: str) -> None:
    os.makedirs(log_dir, exist_ok=True)
    path = os.path.join(log_dir, f"turn_{gs.turn:03d}.json")
    with open(path, "w") as f:
        json.dump(gs.to_dict(), f, indent=2)
