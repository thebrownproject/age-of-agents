"""
Age of Agents — CLI entry point.

Usage:
    python main.py --p1 claude-sonnet-4-6 --p2 gpt-4o
    python main.py --p1 claude-sonnet-4-6 --p2 claude-sonnet-4-6 --p1-persona aggressive --p2-persona economic
    python main.py --p1 claude-sonnet-4-6 --p2 gpt-4o --turns 30 --web
    python main.py --web          # browser lobby: pick models + API keys in the browser
"""
import argparse
import asyncio
import os
import sys

# Ensure UTF-8 output on Windows terminals
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

from engine.state import GameState
from engine.resolver import run_turn
from display.renderer import Renderer


def make_agent(model_id: str, persona: str):
    """Instantiate the correct Agent subclass based on model_id prefix."""
    if model_id.startswith("claude"):
        from agents.anthropic_agent import AnthropicAgent
        return AnthropicAgent(model_id=model_id, persona=persona)
    elif model_id.startswith(("gpt", "o1", "o3")):
        from agents.openai_agent import OpenAIAgent
        return OpenAIAgent(model_id=model_id, persona=persona)
    else:
        raise ValueError(
            f"Unknown model prefix for '{model_id}'. "
            "Use a model starting with 'claude' or 'gpt'/'o1'/'o3'."
        )


async def main():
    parser = argparse.ArgumentParser(description="Age of Agents — LLM vs LLM strategy game")
    parser.add_argument("--p1", default=None, help="Player 1 model ID (e.g. claude-sonnet-4-6)")
    parser.add_argument("--p2", default=None, help="Player 2 model ID (e.g. gpt-4o)")
    parser.add_argument("--p1-persona", default="balanced",
                        help="Player 1 strategy persona (default: balanced)")
    parser.add_argument("--p2-persona", default="balanced",
                        help="Player 2 strategy persona (default: balanced)")
    parser.add_argument("--turns", type=int, default=50,
                        help="Max turns (default: 50)")
    parser.add_argument("--log-dir", default="game_logs",
                        help="Directory to save turn JSON logs (default: game_logs)")
    parser.add_argument("--no-log", action="store_true",
                        help="Disable turn logging")
    parser.add_argument("--web", action="store_true",
                        help="Launch live web viewer at http://localhost:PORT")
    parser.add_argument("--port", type=int, default=8080,
                        help="Web viewer port (default: 8080)")
    args = parser.parse_args()

    import config
    config.TURN_LIMIT = args.turns

    from rich.console import Console
    console = Console()

    # ── Web / lobby setup ──
    # Web is enabled if --web flag set, OR if agents not specified (lobby mode)
    needs_web = args.web or not (args.p1 and args.p2)
    web_broadcast = None
    uvicorn_server = None

    if needs_web:
        import uvicorn
        import webbrowser
        import threading
        from web.server import app as web_app, broadcast as _broadcast

        web_broadcast = _broadcast

        uv_config = uvicorn.Config(
            web_app,
            host="0.0.0.0",
            port=args.port,
            log_level="warning",
            loop="none",
        )
        uvicorn_server = uvicorn.Server(uv_config)
        url = f"http://localhost:{args.port}"
        console.print(f"[green]Web viewer:[/green] {url}")
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()

    # ── Inner game loop (shared by direct and lobby modes) ──
    async def run_game(agent_a, agent_b, max_turns: int):
        gs = GameState.new_game()
        renderer = Renderer()
        log_dir = None if args.no_log else args.log_dir
        agents = {"A": agent_a, "B": agent_b}

        _stop_event = None
        if web_broadcast:
            from web.server import stop_event as _stop_event
            _stop_event.clear()

        winner = None
        for turn in range(1, max_turns + 1):
            try:
                winner = await run_turn(gs, agents, renderer=renderer, log_dir=log_dir)
            except Exception as e:
                console.print(f"[bold red]Fatal error on turn {turn}:[/bold red] {e}")
                import traceback
                traceback.print_exc()
                break

            if web_broadcast:
                await web_broadcast(gs.to_dict())

            if _stop_event and _stop_event.is_set():
                break

            if winner:
                break

        # Turn limit reached without TC destruction — determine winner by score
        if not winner:
            score_a = gs.players["A"].score()
            score_b = gs.players["B"].score()
            if score_a > score_b:
                winner = "A"
            elif score_b > score_a:
                winner = "B"
            else:
                winner = "draw"
            gs.winner = winner
            result_msg = (
                f"Turn limit reached — A:{score_a} B:{score_b} → "
                + ("DRAW" if winner == "draw" else f"Player {winner} wins by score")
            )
            gs.add_log(result_msg)
            if web_broadcast:
                await web_broadcast(gs.to_dict())

        score_a = gs.players["A"].score()
        score_b = gs.players["B"].score()
        console.rule("[bold]Game Over[/bold]")
        if winner == "draw":
            console.print("[bold yellow]Result: DRAW[/bold yellow]")
        else:
            color = "cyan" if winner == "A" else "magenta"
            console.print(f"[bold {color}]Winner: Player {winner}![/bold {color}]")
        console.print(f"Final scores — A: {score_a}  B: {score_b}")

        if log_dir:
            console.print(f"\nGame log saved to: [dim]{log_dir}/[/dim]")

        if uvicorn_server:
            console.print(f"\n[dim]Web viewer still running at http://localhost:{args.port} — press Ctrl+C to exit[/dim]")

    # ── Direct mode: both agents specified on CLI ──
    if args.p1 and args.p2:
        console.print("[bold cyan]Age of Agents[/bold cyan] — Initialising...\n")
        console.print(f"  Player A: [cyan]{args.p1}[/cyan] (persona: {args.p1_persona})")
        console.print(f"  Player B: [magenta]{args.p2}[/magenta] (persona: {args.p2_persona})")
        console.print(f"  Turn limit: {args.turns}\n")

        try:
            agent_a = make_agent(args.p1, args.p1_persona)
            agent_b = make_agent(args.p2, args.p2_persona)
        except EnvironmentError as e:
            console.print(f"[bold red]Configuration error:[/bold red] {e}")
            sys.exit(1)
        except ValueError as e:
            console.print(f"[bold red]Invalid model:[/bold red] {e}")
            sys.exit(1)

        console.print("[green]Game started![/green]\n")

        if uvicorn_server:
            from web.server import set_phase
            set_phase("running")
            await asyncio.gather(
                uvicorn_server.serve(),
                run_game(agent_a, agent_b, args.turns),
            )
        else:
            await run_game(agent_a, agent_b, args.turns)

    # ── Lobby mode: wait for browser config ──
    else:
        from web.server import start_event, get_pending_config, set_phase

        console.print("[bold cyan]Age of Agents[/bold cyan] — Waiting for game config via browser...\n")

        async def wait_and_run():
            await start_event.wait()
            cfg = get_pending_config()

            # Apply API keys from browser form
            if cfg.anthropic_api_key:
                os.environ["ANTHROPIC_API_KEY"] = cfg.anthropic_api_key
            if cfg.openai_api_key:
                os.environ["OPENAI_API_KEY"] = cfg.openai_api_key

            # Apply turn limit from form
            config.TURN_LIMIT = cfg.turns

            console.print(f"  Player A: [cyan]{cfg.p1_model}[/cyan] (persona: {cfg.p1_persona})")
            console.print(f"  Player B: [magenta]{cfg.p2_model}[/magenta] (persona: {cfg.p2_persona})")
            console.print(f"  Turn limit: {cfg.turns}\n")

            try:
                agent_a = make_agent(cfg.p1_model, cfg.p1_persona)
                agent_b = make_agent(cfg.p2_model, cfg.p2_persona)
            except (EnvironmentError, ValueError) as e:
                console.print(f"[bold red]Error:[/bold red] {e}")
                set_phase("lobby")
                start_event.clear()
                return

            console.print("[green]Game started![/green]\n")
            await run_game(agent_a, agent_b, cfg.turns)
            set_phase("finished")

        await asyncio.gather(
            uvicorn_server.serve(),
            wait_and_run(),
        )


if __name__ == "__main__":
    asyncio.run(main())
