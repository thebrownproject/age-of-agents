"""
Rich-based terminal renderer: tables, panels, zone map, turn log.
"""
from __future__ import annotations
from typing import TYPE_CHECKING

import sys

from rich.console import Console
from rich.columns import Columns
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich import box

if TYPE_CHECKING:
    from engine.state import GameState

from config import ZONES, AGE_NAMES

# Reconfigure stdout for UTF-8 so Rich box-drawing chars work on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

console = Console(legacy_windows=False)


class Renderer:
    def __init__(self):
        self._console = console

    def render(self, gs: "GameState") -> None:
        self._console.rule(f"[bold cyan]Turn {gs.turn}[/bold cyan]")

        # Player panels
        panel_a = _player_panel(gs.players["A"], "A", "cyan")
        panel_b = _player_panel(gs.players["B"], "B", "magenta")
        self._console.print(Columns([panel_a, panel_b], equal=True))

        # Zone map
        self._console.print(_zone_map(gs))

        # Recent log
        log_lines = gs.recent_log(5)
        log_text = "\n".join(log_lines) if log_lines else "(no events)"
        self._console.print(Panel(log_text, title="[bold yellow]Turn Log[/bold yellow]",
                                  border_style="yellow"))

        if gs.winner:
            if gs.winner == "draw":
                self._console.print("[bold yellow]DRAW![/bold yellow]")
            else:
                self._console.print(
                    f"[bold green]Player {gs.winner} WINS![/bold green]"
                )


def _player_panel(player, pid: str, color: str) -> Panel:
    res = player.resources
    res_str = (
        f"Food: [green]{res.get('food', 0)}[/green]  "
        f"Wood: [yellow]{res.get('wood', 0)}[/yellow]  "
        f"Gold: [gold1]{res.get('gold', 0)}[/gold1]"
    )

    age_name = AGE_NAMES.get(player.age, "Unknown")
    age_str = f"Age {player.age}: [bold]{age_name}[/bold]"

    # Units table
    unit_table = Table(box=box.SIMPLE, show_header=True, header_style="bold")
    unit_table.add_column("Zone", style="dim")
    unit_table.add_column("Units")

    for zone, units in player.units.items():
        active = {k: v for k, v in units.items() if v > 0}
        if active:
            unit_str = "  ".join(f"{v}x{k}" for k, v in active.items())
            unit_table.add_row(zone, unit_str)

    # Buildings with HP for Wall/Tower
    buildings_parts = []
    for zone, blist in player.buildings.items():
        if blist:
            zone_hp = player.building_hp.get(zone, {})
            building_strs = []
            for b in blist:
                if b in ("Wall", "Tower") and b in zone_hp:
                    building_strs.append(f"{b}({zone_hp[b]}HP)")
                else:
                    building_strs.append(b)
            buildings_parts.append(f"{zone}: {', '.join(building_strs)}")
    buildings_str = "  ".join(buildings_parts) or "none"

    # Villager task display
    tasks = player.villager_tasks
    if tasks:
        task_parts = [f"{res}:{n}" for res, n in tasks.items() if n > 0]
        task_str = "Tasks: " + ", ".join(task_parts)
    else:
        task_str = "Tasks: idle"

    # Production queue
    if player.production_queue:
        queue_str = "  ".join(
            f"{item.unit_type}({item.turns_left}t)" for item in player.production_queue
        )
    else:
        queue_str = "idle"

    # Upgrades and bonuses
    if player.upgrades:
        upg_str = f"Upgrades: {', '.join(player.upgrades)} | +{player.attack_bonus}atk +{player.armor_bonus}armor"
    else:
        upg_str = "Upgrades: none"

    tc_color = "green" if player.town_center_hp > 100 else ("yellow" if player.town_center_hp > 50 else "red")
    content = (
        f"{res_str}\n"
        f"{age_str}\n"
        f"Town Center: [{tc_color}]{player.town_center_hp} HP[/{tc_color}]\n"
        f"Buildings: {buildings_str}\n"
        f"{task_str}\n"
        f"Queue: {queue_str}\n"
        f"{upg_str}\n"
    )

    return Panel(
        content + _renderable_table(unit_table),
        title=f"[bold {color}]Player {pid} ({player.base_zone})[/bold {color}]",
        border_style=color,
    )


def _renderable_table(table: Table) -> str:
    """Render a Rich Table to string for embedding."""
    from io import StringIO
    from rich.console import Console as _Con
    buf = StringIO()
    c = _Con(file=buf, highlight=False, width=60)
    c.print(table)
    return buf.getvalue()


def _zone_map(gs: "GameState") -> Panel:
    pa = gs.players["A"]
    pb = gs.players["B"]

    def cell(zone: str) -> str:
        a_units = {k: v for k, v in pa.units.get(zone, {}).items() if v > 0}
        b_units = {k: v for k, v in pb.units.get(zone, {}).items() if v > 0}
        a_bldgs = pa.buildings.get(zone, [])
        b_bldgs = pb.buildings.get(zone, [])
        name = zone.replace("_", " ")
        lines = [f"[bold]{name}[/bold]"]
        if a_units:
            lines.append("[cyan]A:" + " ".join(f"{v}{k[:3]}" for k, v in a_units.items()) + "[/cyan]")
        if a_bldgs:
            lines.append(f"[dim]A:{','.join(b[:3] for b in a_bldgs)}[/dim]")
        if b_units:
            lines.append("[magenta]B:" + " ".join(f"{v}{k[:3]}" for k, v in b_units.items()) + "[/magenta]")
        if b_bldgs:
            lines.append(f"[dim]B:{','.join(b[:3] for b in b_bldgs)}[/dim]")
        if not a_units and not b_units and not a_bldgs and not b_bldgs:
            lines.append("[dim](empty)[/dim]")
        return "\n".join(lines)

    # 3-lane grid layout using a Table (4 cols, 3 rows)
    # col: Base_A | Top/Mid/Bot_A | Top/Mid/Bot_B | Base_B
    grid = Table(box=box.SIMPLE_HEAD, show_header=False, padding=(0, 1), expand=False)
    grid.add_column("BaseA", justify="center", min_width=12)
    grid.add_column("LaneA", justify="center", min_width=14)
    grid.add_column("LaneB", justify="center", min_width=14)
    grid.add_column("BaseB", justify="center", min_width=12)

    # Row 0: Top lane
    grid.add_row("", cell("Top_A"), cell("Top_B"), "")
    # Row 1: Mid lane + bases
    grid.add_row(cell("Base_A"), cell("Mid_A"), cell("Mid_B"), cell("Base_B"))
    # Row 2: Bot lane
    grid.add_row("", cell("Bot_A"), cell("Bot_B"), "")

    from io import StringIO
    from rich.console import Console as _Con
    buf = StringIO()
    c = _Con(file=buf, highlight=False, width=80)
    c.print(grid)
    map_text = buf.getvalue()

    map_text += "\n[dim]Top/Bot lanes connect across (Top_A↔Top_B, Bot_A↔Bot_B)[/dim]"
    map_text += "\n[dim]Jungle: Top_A↔Mid_A, Bot_A↔Mid_A, Top_B↔Mid_B, Bot_B↔Mid_B[/dim]"

    return Panel(map_text, title="[bold white]Zone Map (3-Lane)[/bold white]", border_style="white")
