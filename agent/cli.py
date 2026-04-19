from __future__ import annotations

import argparse
import sys

import task_ops


def cmd_enqueue(args: argparse.Namespace) -> None:
    task = task_ops.enqueue_preset(args.preset, created_by="cli")
    path = task_ops.tasks_path(task_ops.load_config())
    print(f"Enqueued task id={task.id!r} status=RUN_PENDING -> {path}")


def cmd_list(args: argparse.Namespace) -> None:
    rows = task_ops.list_tasks(args.limit)
    if not rows:
        print("(no tasks)")
        return

    col_id = "id"
    col_st = "status"
    col_ca = "createdAt"
    w_id = max(len(col_id), *(len(r["id"]) for r in rows), 20)
    w_st = max(len(col_st), *(len(r["status"]) for r in rows), 12)
    w_ca = max(len(col_ca), *(len(r["createdAt"]) for r in rows), 24)

    header = f"{col_id.ljust(w_id)}  {col_st.ljust(w_st)}  {col_ca.ljust(w_ca)}"
    sep = "-" * len(header)
    print(header)
    print(sep)
    for r in rows:
        print(
            f"{r['id'].ljust(w_id)}  {r['status'].ljust(w_st)}  {r['createdAt'].ljust(w_ca)}"
        )


def cmd_show_last_build_prompt(_args: argparse.Namespace) -> None:
    data = task_ops.get_last_build_prompt()
    if not data.get("ok"):
        print(data.get("error", "Unknown error"), file=sys.stderr)
        raise SystemExit(1)
    print(f"# task id: {data['taskId']}")
    print(f"# buildPromptPath: {data['path']}")
    print()
    print(data["content"].rstrip("\n"))


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="python agent/cli.py",
        description="local-agent task CLI (enqueue / list / show-last-build-prompt)",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_enq = sub.add_parser("enqueue", help="Append a preset RUN_PENDING TaskSpec to tasks.json")
    p_enq.add_argument(
        "preset",
        help="Preset name (e.g. myphonecheck_build_test)",
    )
    p_enq.set_defaults(func=cmd_enqueue)

    p_list = sub.add_parser("list", help="List recent tasks (id / status / createdAt)")
    p_list.add_argument(
        "--limit",
        type=int,
        default=10,
        metavar="N",
        help="Max number of tasks (most recent first by createdAt). Default: 10",
    )
    p_list.set_defaults(func=cmd_list)

    p_show = sub.add_parser(
        "show-last-build-prompt",
        help="Print build_fix_prompt.txt from the latest FAILED task that has buildPromptPath",
    )
    p_show.set_defaults(func=cmd_show_last_build_prompt)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
