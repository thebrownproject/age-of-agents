"""
Validate and sanitise raw LLM action dicts.
Invalid actions are silently dropped (no-op).
"""
from __future__ import annotations
from typing import Any, Dict, List

from config import (
    UNITS, BUILDINGS, ZONES, ADJACENCY,
    UNIT_AGE_REQUIREMENT, BUILDING_AGE_REQUIREMENT,
    AGE_ADVANCE_COSTS, UPGRADES,
)
from engine.state import PlayerState


EMPTY_ACTION = {
    "train": [],
    "build": [],
    "move": [],
    "attack": [],
    "advance_age": False,
    "task_villagers": {},
    "research": [],
}


def validate_action(raw: Any, player: PlayerState, turn: int) -> dict:
    """
    Validate and sanitise raw LLM output.
    Returns a clean action dict with only legal entries.
    """
    if not isinstance(raw, dict):
        return dict(EMPTY_ACTION)

    clean = {
        "train": _validate_train(raw.get("train", []), player),
        "build": _validate_build(raw.get("build", []), player),
        "move": _validate_move(raw.get("move", []), player),
        "attack": [],  # attack is implicit via zone presence
        "advance_age": _validate_advance_age(raw.get("advance_age", False), player),
        "task_villagers": _validate_task_villagers(raw.get("task_villagers", {}), player),
        "research": _validate_research(raw.get("research", []), player),
    }
    return clean


def _validate_train(items: Any, player: PlayerState) -> List[dict]:
    if not isinstance(items, list):
        return []
    valid = []
    for item in items:
        if not isinstance(item, dict):
            continue
        unit = item.get("unit")
        count = item.get("count", 1)
        if unit not in UNITS:
            continue
        if not isinstance(count, int) or count < 1:
            continue
        # Age requirement check
        if player.age < UNIT_AGE_REQUIREMENT.get(unit, 1):
            continue
        # Check building prerequisite
        if unit in ("Militia", "Knight") and not player.any_building("Barracks"):
            continue
        if unit == "Archer" and not player.any_building("Range"):
            continue
        # Check resource affordability (greedy: as many as resources allow)
        cost = UNITS[unit]["cost"]
        max_affordable = _max_affordable(player.resources, cost, count)
        if max_affordable < 1:
            continue
        valid.append({"unit": unit, "count": max_affordable})
    return valid


def _validate_build(items: Any, player: PlayerState) -> List[dict]:
    if not isinstance(items, list):
        return []
    valid = []
    for item in items:
        if not isinstance(item, dict):
            continue
        building = item.get("building")
        if building not in BUILDINGS:
            continue
        # Age requirement check
        if player.age < BUILDING_AGE_REQUIREMENT.get(building, 1):
            continue
        cost = BUILDINGS[building]["cost"]
        if not _can_afford(player.resources, cost):
            continue
        valid.append({"building": building})
    return valid


def _validate_move(items: Any, player: PlayerState) -> List[dict]:
    if not isinstance(items, list):
        return []
    valid = []
    zone_names = set(ZONES)
    for item in items:
        if not isinstance(item, dict):
            continue
        unit = item.get("unit")
        count = item.get("count", 1)
        from_zone = item.get("from")
        to_zone = item.get("to")
        if unit not in UNITS:
            continue
        if from_zone not in zone_names or to_zone not in zone_names:
            continue
        if to_zone not in ADJACENCY.get(from_zone, set()):
            continue
        if not isinstance(count, int) or count < 1:
            continue
        available = player.unit_count(from_zone, unit)
        if available < 1:
            continue
        count = min(count, available)
        valid.append({"unit": unit, "count": count, "from": from_zone, "to": to_zone})
    return valid


def _validate_advance_age(flag: Any, player: PlayerState) -> bool:
    if not flag:
        return False
    if player.age >= 4:
        return False
    next_age = player.age + 1
    cost = AGE_ADVANCE_COSTS.get(next_age, {})
    return _can_afford(player.resources, cost)


def _validate_task_villagers(tasks: Any, player: PlayerState) -> dict:
    if not isinstance(tasks, dict):
        return {}
    valid_resources = {"food", "wood", "gold"}
    cleaned = {}
    for res, count in tasks.items():
        if res not in valid_resources:
            continue
        if not isinstance(count, int) or count < 0:
            continue
        cleaned[res] = count

    # Total villagers across all zones
    total_villagers = sum(
        zone_units.get("Villager", 0)
        for zone_units in player.units.values()
    )

    # Scale down if tasked exceeds total
    total_tasked = sum(cleaned.values())
    if total_tasked > total_villagers and total_tasked > 0:
        scale = total_villagers / total_tasked
        cleaned = {res: int(n * scale) for res, n in cleaned.items()}

    # Remove zeros
    cleaned = {res: n for res, n in cleaned.items() if n > 0}
    return cleaned


def _validate_research(items: Any, player: PlayerState) -> List[dict]:
    if not isinstance(items, list):
        return []
    valid = []
    for item in items:
        if not isinstance(item, dict):
            continue
        upgrade_name = item.get("upgrade")
        if upgrade_name not in UPGRADES:
            continue
        if upgrade_name in player.upgrades:
            continue  # already researched
        upg = UPGRADES[upgrade_name]
        # Age requirement
        if player.age < upg["age"]:
            continue
        # Building prerequisite
        req_building = upg.get("requires_building")
        if req_building and not player.any_building(req_building):
            continue
        # Upgrade prerequisite
        req_upgrade = upg.get("requires_upgrade")
        if req_upgrade and req_upgrade not in player.upgrades:
            continue
        # Affordability
        if not _can_afford(player.resources, upg["cost"]):
            continue
        valid.append({"upgrade": upgrade_name})
    return valid


def _can_afford(resources: Dict[str, int], cost: Dict[str, int]) -> bool:
    return all(resources.get(r, 0) >= cost.get(r, 0) for r in cost)


def _max_affordable(resources: Dict[str, int], cost: Dict[str, int], requested: int) -> int:
    """Return how many units can be afforded up to requested."""
    max_count = requested
    for res, amount in cost.items():
        if amount > 0:
            max_count = min(max_count, resources.get(res, 0) // amount)
    return max(0, max_count)


def deduct_costs(action: dict, player: PlayerState) -> None:
    """Deduct resource costs for validated build actions only.
    Train costs are already deducted in _process_trains."""
    for item in action.get("build", []):
        building = item["building"]
        cost = BUILDINGS[building]["cost"]
        for res, amount in cost.items():
            player.resources[res] = player.resources.get(res, 0) - amount
            player.resources_banked += amount
