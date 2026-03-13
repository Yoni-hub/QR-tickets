"""Launcher for QR Tickets local services (DB, backend, frontend)."""

import os
import queue
import socket
import subprocess
import threading
import time
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, scrolledtext, ttk


def _resolve_project_root() -> Path:
    env_root = os.getenv("QR_TICKETS_ROOT")
    candidates = []
    if env_root:
        candidates.append(Path(env_root))
    candidates.extend(
        [
            Path("C:/Users/yonat/Downloads/QR_Tickets"),
            Path("C:/Users/yonat/OneDrive/Desktop/QR_Tickets"),
        ]
    )

    for candidate in candidates:
        if (candidate / ".git").exists() and (candidate / "backend").exists() and (candidate / "frontend").exists():
            return candidate

    return candidates[0] if candidates else Path.cwd()


PROJECT_ROOT = _resolve_project_root()
BACKEND_DIR = PROJECT_ROOT / "backend"
FRONTEND_DIR = PROJECT_ROOT / "frontend"
COMPOSE_FILE = PROJECT_ROOT / "infra" / "docker-compose.local.yml"

NPM_EXECUTABLE = "npm.cmd" if os.name == "nt" else "npm"
BACKEND_CMD = [NPM_EXECUTABLE, "run", "dev"]
FRONTEND_CMD = [NPM_EXECUTABLE, "run", "dev"]

DB_HOST = "localhost"
DB_PORT = 5434
DB_WAIT_SECONDS = 45
BACKEND_PORT = 4100

FRONTEND_URL = "http://localhost:5174"
BACKEND_URL = "http://localhost:4100"


class ProcessController:
    def __init__(self, name: str, command: list[str], cwd: Path, status_var: tk.StringVar, log_queue: queue.Queue[str]):
        self.name = name
        self.command = command
        self.cwd = cwd
        self.status_var = status_var
        self.log_queue = log_queue
        self.process: subprocess.Popen | None = None
        self.thread: threading.Thread | None = None

    def _log(self, message: str) -> None:
        self.log_queue.put(f"[{time.strftime('%H:%M:%S')}] [{self.name}] {message}")

    def is_running(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def start(self) -> None:
        if self.is_running():
            self.status_var.set("Running")
            self._log("Already running.")
            return
        try:
            self.process = subprocess.Popen(
                self.command,
                cwd=str(self.cwd),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )
        except Exception as exc:
            self.status_var.set("Stopped")
            self._log(f"Start failed: {exc}")
            return
        self.status_var.set("Running")
        self._log("Started.")
        self.thread = threading.Thread(target=self._stream_logs, daemon=True)
        self.thread.start()

    def stop(self) -> None:
        if not self.is_running():
            self.status_var.set("Stopped")
            self._log("Not running.")
            return
        self.status_var.set("Stopping")
        self._log("Stopping...")
        try:
            self.process.terminate()
            self.process.wait(timeout=6)
        except subprocess.TimeoutExpired:
            self._log("Force killing after timeout.")
            self.process.kill()
        except Exception as exc:
            self._log(f"Stop failed: {exc}")
        self.status_var.set("Stopped")

    def restart(self) -> None:
        self.stop()
        self.start()

    def _stream_logs(self) -> None:
        process = self.process
        if process is None or process.stdout is None:
            return
        for line in process.stdout:
            if line:
                self._log(line.rstrip())
        code = process.wait()
        self.status_var.set("Stopped")
        self._log(f"Exited with code {code}.")


class QRTicketsLauncher(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("QR Tickets Launcher")
        self.minsize(760, 540)
        self.protocol("WM_DELETE_WINDOW", self.on_close)

        self.log_queue: queue.Queue[str] = queue.Queue()
        self.db_status = tk.StringVar(value="Unknown")
        self.backend_status = tk.StringVar(value="Stopped")
        self.frontend_status = tk.StringVar(value="Stopped")

        self.backend = ProcessController("Backend", BACKEND_CMD, BACKEND_DIR, self.backend_status, self.log_queue)
        self.frontend = ProcessController("Frontend", FRONTEND_CMD, FRONTEND_DIR, self.frontend_status, self.log_queue)

        self.db_start_cmd = f'docker compose -f "{COMPOSE_FILE}" up -d postgres'
        self.db_stop_cmd = f'docker compose -f "{COMPOSE_FILE}" stop postgres'

        self._build_ui()
        self._validate_project_layout()
        self._refresh_db_status()
        self.after(120, self._poll_logs)

    def _build_ui(self) -> None:
        top = ttk.LabelFrame(self, text="QR Tickets Services", padding="10")
        top.pack(fill="x", padx=12, pady=(12, 6))

        ttk.Label(top, text="Database:").grid(row=0, column=0, sticky="w")
        ttk.Label(top, textvariable=self.db_status, width=30).grid(row=0, column=1, sticky="w", padx=(6, 0))
        self.db_start_button = ttk.Button(top, text="Start DB", command=self.start_db)
        self.db_start_button.grid(row=0, column=2, padx=(6, 0))
        self.db_stop_button = ttk.Button(top, text="Stop DB", command=self.stop_db)
        self.db_stop_button.grid(row=0, column=3, padx=(6, 0))

        ttk.Label(top, text="Backend:").grid(row=1, column=0, sticky="w", pady=(8, 0))
        ttk.Label(top, textvariable=self.backend_status, width=30).grid(row=1, column=1, sticky="w", padx=(6, 0), pady=(8, 0))
        self.backend_start_button = ttk.Button(top, text="Start Backend", command=self.start_backend)
        self.backend_start_button.grid(row=1, column=2, padx=(6, 0), pady=(8, 0))
        self.backend_stop_button = ttk.Button(top, text="Stop Backend", command=self.stop_backend)
        self.backend_stop_button.grid(row=1, column=3, padx=(6, 0), pady=(8, 0))
        self.backend_restart_button = ttk.Button(top, text="Restart Backend", command=self.restart_backend)
        self.backend_restart_button.grid(row=1, column=4, padx=(6, 0), pady=(8, 0))

        ttk.Label(top, text="Frontend:").grid(row=2, column=0, sticky="w", pady=(8, 0))
        ttk.Label(top, textvariable=self.frontend_status, width=30).grid(row=2, column=1, sticky="w", padx=(6, 0), pady=(8, 0))
        self.frontend_start_button = ttk.Button(top, text="Start Frontend", command=self.start_frontend)
        self.frontend_start_button.grid(row=2, column=2, padx=(6, 0), pady=(8, 0))
        self.frontend_stop_button = ttk.Button(top, text="Stop Frontend", command=self.stop_frontend)
        self.frontend_stop_button.grid(row=2, column=3, padx=(6, 0), pady=(8, 0))
        self.frontend_restart_button = ttk.Button(top, text="Restart Frontend", command=self.restart_frontend)
        self.frontend_restart_button.grid(row=2, column=4, padx=(6, 0), pady=(8, 0))

        actions = ttk.Frame(self, padding=(12, 4, 12, 6))
        actions.pack(fill="x")
        ttk.Button(actions, text="Start All", command=self.start_all).pack(side="left")
        ttk.Button(actions, text="Stop All", command=self.stop_all).pack(side="left", padx=(6, 0))
        ttk.Button(actions, text="Open Frontend", command=lambda: self._open_url(FRONTEND_URL)).pack(side="left", padx=(20, 0))
        ttk.Button(actions, text="Open Backend", command=lambda: self._open_url(BACKEND_URL)).pack(side="left", padx=(6, 0))

        log_box = ttk.LabelFrame(self, text="Live Logs", padding="10")
        log_box.pack(fill="both", expand=True, padx=12, pady=(0, 12))
        self.log_text = scrolledtext.ScrolledText(log_box, state="disabled", height=18)
        self.log_text.pack(fill="both", expand=True)

    def _open_url(self, url: str) -> None:
        try:
            import webbrowser

            webbrowser.open(url, new=2)
        except Exception as exc:
            messagebox.showerror("Open URL", f"Could not open URL: {exc}")

    def _validate_project_layout(self) -> None:
        missing = []
        if not (PROJECT_ROOT / ".git").exists():
            missing.append(".git")
        if not BACKEND_DIR.exists():
            missing.append("backend/")
        if not FRONTEND_DIR.exists():
            missing.append("frontend/")
        if not COMPOSE_FILE.exists():
            missing.append("infra/docker-compose.local.yml")

        self.log_queue.put(f"[{time.strftime('%H:%M:%S')}] [Launcher] PROJECT_ROOT={PROJECT_ROOT}")
        if not missing:
            return

        missing_text = ", ".join(missing)
        messagebox.showerror(
            "Project Root Error",
            "QR Tickets root looks invalid.\n\n"
            f"Resolved root: {PROJECT_ROOT}\n"
            f"Missing: {missing_text}\n\n"
            "Set QR_TICKETS_ROOT to the correct repo path and restart.",
        )

    def _is_db_reachable(self) -> bool:
        try:
            with socket.create_connection((DB_HOST, DB_PORT), timeout=1):
                return True
        except OSError:
            return False

    def _is_backend_port_in_use(self) -> bool:
        try:
            with socket.create_connection(("127.0.0.1", BACKEND_PORT), timeout=1):
                return True
        except OSError:
            return False

    def _wait_for_db(self, timeout_seconds: int = DB_WAIT_SECONDS) -> bool:
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            if self._is_db_reachable():
                return True
            time.sleep(1)
        return self._is_db_reachable()

    def _run_command_background(self, name: str, command: str) -> None:
        def worker() -> None:
            self.log_queue.put(f"[{time.strftime('%H:%M:%S')}] [{name}] Running: {command}")
            try:
                process = subprocess.Popen(
                    command,
                    shell=True,
                    cwd=str(PROJECT_ROOT),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    bufsize=1,
                )
            except Exception as exc:
                self.log_queue.put(f"[{time.strftime('%H:%M:%S')}] [{name}] Failed: {exc}")
                return

            if process.stdout is not None:
                for line in process.stdout:
                    if line:
                        self.log_queue.put(f"[{time.strftime('%H:%M:%S')}] [{name}] {line.rstrip()}")
            code = process.wait()
            self.log_queue.put(f"[{time.strftime('%H:%M:%S')}] [{name}] Completed with code {code}.")

        threading.Thread(target=worker, daemon=True).start()

    def _set_backend_buttons(self, state: str) -> None:
        self.backend_start_button["state"] = state
        self.backend_stop_button["state"] = state
        self.backend_restart_button["state"] = state

    def start_db(self) -> None:
        self._run_command_background("DB", self.db_start_cmd)

    def stop_db(self) -> None:
        self._run_command_background("DB", self.db_stop_cmd)

    def start_backend(self) -> None:
        def worker() -> None:
            self.after(0, lambda: self._set_backend_buttons("disabled"))
            if not self.backend.is_running() and self._is_backend_port_in_use():
                self.backend_status.set("Running (external)")
                self.log_queue.put(
                    f"[{time.strftime('%H:%M:%S')}] [Launcher] Backend already running on localhost:{BACKEND_PORT}."
                )
                self.after(0, lambda: self._set_backend_buttons("normal"))
                return
            if not self._is_db_reachable():
                self._run_command_background("DB", self.db_start_cmd)
                self.log_queue.put(f"[{time.strftime('%H:%M:%S')}] [Launcher] Waiting for DB on localhost:{DB_PORT}...")
                if not self._wait_for_db():
                    self.after(0, lambda: messagebox.showerror("Database", f"Could not reach localhost:{DB_PORT}."))
                    self.after(0, lambda: self._set_backend_buttons("normal"))
                    return
            self.after(0, self.backend.start)
            self.after(0, lambda: self._set_backend_buttons("normal"))

        threading.Thread(target=worker, daemon=True).start()

    def stop_backend(self) -> None:
        self.backend.stop()

    def restart_backend(self) -> None:
        self.backend.stop()
        self.start_backend()

    def start_frontend(self) -> None:
        self.frontend.start()

    def stop_frontend(self) -> None:
        self.frontend.stop()

    def restart_frontend(self) -> None:
        self.frontend.restart()

    def start_all(self) -> None:
        self.start_backend()
        self.start_frontend()

    def stop_all(self) -> None:
        self.frontend.stop()
        self.backend.stop()
        self.stop_db()

    def _refresh_db_status(self) -> None:
        self.db_status.set(f"Ready on localhost:{DB_PORT}" if self._is_db_reachable() else "Unavailable")
        self.after(3000, self._refresh_db_status)

    def _poll_logs(self) -> None:
        while not self.log_queue.empty():
            line = self.log_queue.get_nowait()
            self.log_text.configure(state="normal")
            self.log_text.insert("end", line + "\n")
            self.log_text.configure(state="disabled")
            self.log_text.yview_moveto(1.0)
        self.after(120, self._poll_logs)

    def on_close(self) -> None:
        self.frontend.stop()
        self.backend.stop()
        self.destroy()


def main() -> None:
    app = QRTicketsLauncher()
    app.mainloop()


if __name__ == "__main__":
    main()
