"""
Economy tick: income from villagers, passive gold, production queue decrement.
"""
from config import VILLAGER_TASK_RATES, VILLAGER_IDLE_RATES, GOLD_TRICKLE
from engine.state import GameState, PlayerState, ProductionItem


def economy_tick(gs: GameState) -> None:
    """Apply one turn of economy to all players."""
    for pid, player in gs.players.items():
        _apply_income(player, gs)
        _decrement_queue(player, gs)


def _apply_income(player: PlayerState, gs: GameState) -> None:
    # Count total villagers across all zones
    total_villagers = sum(
        zone_units.get("Villager", 0)
        for zone_units in player.units.values()
    )

    # Read villager tasks; safety-scale if villagers died since last task update
    tasks = dict(player.villager_tasks)
    total_tasked = sum(tasks.values())
    if total_tasked > total_villagers and total_villagers > 0:
        # Scale down proportionally
        scale = total_villagers / total_tasked
        tasks = {res: int(n * scale) for res, n in tasks.items()}
        total_tasked = sum(tasks.values())
    elif total_villagers == 0:
        tasks = {}
        total_tasked = 0

    idle_villagers = max(0, total_villagers - total_tasked)

    # Tasked villager income
    food_gain = tasks.get("food", 0) * VILLAGER_TASK_RATES["food"]
    wood_gain = tasks.get("wood", 0) * VILLAGER_TASK_RATES["wood"]
    gold_gain = tasks.get("gold", 0) * VILLAGER_TASK_RATES["gold"]

    # Idle villager income
    food_gain += idle_villagers * VILLAGER_IDLE_RATES["food"]
    wood_gain += idle_villagers * VILLAGER_IDLE_RATES["wood"]

    # Passive gold trickle always applies
    gold_gain += GOLD_TRICKLE

    player.resources["food"] = player.resources.get("food", 0) + food_gain
    player.resources["wood"] = player.resources.get("wood", 0) + wood_gain
    player.resources["gold"] = player.resources.get("gold", 0) + gold_gain

    gs.add_log(
        f"P{player.player_id} income: +{food_gain}f +{wood_gain}w +{gold_gain}g "
        f"(total: {player.resources['food']}f {player.resources['wood']}w {player.resources['gold']}g)"
    )


def _decrement_queue(player: PlayerState, gs: GameState) -> None:
    """Decrement production queue; graduate finished units to home base."""
    still_training: list[ProductionItem] = []
    for item in player.production_queue:
        item.turns_left -= 1
        if item.turns_left <= 0:
            # Graduate unit to home base
            zone_units = player.units.setdefault(player.base_zone, {})
            zone_units[item.unit_type] = zone_units.get(item.unit_type, 0) + 1
            gs.add_log(f"P{player.player_id} trained {item.unit_type} → {player.base_zone}")
        else:
            still_training.append(item)
    player.production_queue = still_training
