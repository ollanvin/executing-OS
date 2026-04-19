from __future__ import annotations

import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import task_ops

ROOT = Path(__file__).resolve().parent.parent
UI_DIR = ROOT / "ui"
HOST = "127.0.0.1"
PORT = 7860


def interpret_command(text: str) -> str:
    """Rule-based intent: enqueue | list | last_prompt | retry | unknown."""
    raw = (text or "").strip()
    if not raw:
        return "unknown"
    low = raw.lower()

    if any(x in raw for x in ["다시 실행", "재실행"]):
        return "retry"
    if "retry last failed" in low or ("retry" in low and "failed" in low):
        return "retry"
    if low == "retry" or low.startswith("retry "):
        return "retry"

    if any(k in raw for k in ["마지막 실패", "실패 원인"]):
        return "last_prompt"
    if "build prompt" in low or "build_prompt" in low:
        return "last_prompt"
    if "프롬프트" in raw and ("실패" in raw or "마지막" in raw):
        return "last_prompt"

    if any(k in raw for k in ["최근 작업", "task 목록"]):
        return "list"
    if "상태" in raw and ("보여" in raw or "줘" in raw):
        return "list"
    if "task" in low and ("목록" in raw or " list" in low or low.endswith(" list")):
        return "list"

    if any(k in raw for k in ["마이폰", "마이폰첵"]) or "myphone" in low:
        return "enqueue"
    if "빌드" in raw and ("돌려" in raw or "돌리" in raw):
        return "enqueue"
    if "build" in low.split() or low.strip() == "build":
        return "enqueue"
    if "assemble" in low:
        return "enqueue"

    return "unknown"


def _json(handler: BaseHTTPRequestHandler, code: int, payload: object) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _text(handler: BaseHTTPRequestHandler, code: int, body: bytes, ctype: str) -> None:
    handler.send_response(code)
    handler.send_header("Content-Type", ctype)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class Handler(BaseHTTPRequestHandler):
    server_version = "LocalAgentBot/1.0"

    def log_message(self, fmt: str, *args: object) -> None:
        return

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/health":
            _json(self, 200, {"status": "ok", "service": "local-agent-bot"})
            return

        if path == "/api/tasks":
            qs = parse_qs(parsed.query or "")
            try:
                limit = int(qs.get("limit", ["10"])[0])
            except ValueError:
                limit = 10
            limit = max(1, min(limit, 100))
            try:
                tasks = task_ops.list_tasks(limit)
                _json(self, 200, {"tasks": tasks})
            except Exception as exc:
                _json(self, 500, {"error": str(exc)})
            return

        if path == "/api/last-build-prompt":
            try:
                data = task_ops.get_last_build_prompt()
                _json(self, 200, data)
            except Exception as exc:
                _json(self, 500, {"ok": False, "error": str(exc)})
            return

        if path in ("/", "/index.html"):
            self._serve_ui_file("local-agent-bot.html")
            return

        if path == "/favicon.svg":
            # Same asset as chat header (single source: ui/perpy.svg)
            self._serve_ui_file("perpy.svg")
            return

        if path.startswith("/ui/"):
            name = path[len("/ui/") :].lstrip("/")
            if not name or ".." in name:
                self.send_error(404)
                return
            self._serve_ui_file(name)
            return

        self.send_error(404)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/chat":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", "0") or "0")
        raw_body = self.rfile.read(length) if length else b""
        try:
            body = json.loads(raw_body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            _json(self, 400, {"error": "Invalid JSON body"})
            return

        msg = body.get("message", "")
        if not isinstance(msg, str):
            msg = str(msg)

        intent = interpret_command(msg)
        reply_lines: list[str] = []
        extra: dict[str, object] = {"intent": intent}

        try:
            if intent == "enqueue":
                task = task_ops.enqueue_preset("myphonecheck_build_test", created_by="bot")
                reply_lines.append(
                    f"큐에 넣었습니다. **RUN_PENDING** — task id: `{task.id}`\n"
                    f"- project: {task.project}\n"
                    f"- 로컬 에이전트가 실행 중이면 곧 처리됩니다."
                )
                extra["task"] = {
                    "id": task.id,
                    "status": task.status,
                    "createdAt": task.createdAt,
                }
            elif intent == "list":
                tasks = task_ops.list_tasks(10)
                if not tasks:
                    reply_lines.append("등록된 작업이 없습니다.")
                else:
                    lines = ["최근 작업 (최대 10개):"]
                    for t in tasks:
                        lines.append(
                            f"- `{t['id']}` — **{t['status']}** — {t['createdAt']}"
                        )
                    reply_lines.append("\n".join(lines))
                extra["tasks"] = tasks
            elif intent == "last_prompt":
                data = task_ops.get_last_build_prompt()
                if not data.get("ok"):
                    reply_lines.append(
                        data.get("error", "마지막 실패 프롬프트를 찾을 수 없습니다.")
                    )
                    extra["lastBuildPrompt"] = data
                else:
                    reply_lines.append(
                        f"**Task:** `{data['taskId']}`\n**파일:** `{data['path']}`\n\n"
                        "---\n\n"
                        + data["content"]
                    )
                    extra["lastBuildPrompt"] = data
            elif intent == "retry":
                task = task_ops.retry_last_failed(created_by="bot")
                reply_lines.append(
                    f"마지막 FAILED 작업을 복제해 다시 큐에 넣었습니다.\n"
                    f"- 새 task id: `{task.id}`\n"
                    f"- status: **{task.status}**"
                )
                extra["task"] = {
                    "id": task.id,
                    "status": task.status,
                    "createdAt": task.createdAt,
                }
            else:
                reply_lines.append(
                    "무슨 말인지 잘 모르겠어요. 예: 「마이폰첵 빌드 돌려」, "
                    "「최근 작업 보여줘」, 「마지막 실패 원인 보여줘」, 「다시 실행」."
                )
        except ValueError as exc:
            _json(self, 400, {"error": str(exc), "intent": intent})
            return
        except Exception as exc:
            _json(self, 500, {"error": str(exc), "intent": intent})
            return

        out: dict[str, object] = {
            "reply": "\n".join(reply_lines),
            "intent": intent,
        }
        out.update(extra)
        _json(self, 200, out)

    def _serve_ui_file(self, name: str) -> None:
        path = UI_DIR / name
        if not path.is_file():
            self.send_error(404)
            return
        ctype, _ = mimetypes.guess_type(str(path))
        if not ctype:
            ctype = "application/octet-stream"
        data = path.read_bytes()
        _text(self, 200, data, ctype)


def main() -> None:
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Local Agent Bot: http://{HOST}:{PORT}/")
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
