#!/usr/bin/env python3
"""
lab-control - a tiny, deliberately restricted bridge between the lab UI and the Docker daemon.

WHY IT EXISTS
    The lessons on Eureka / health checks / load balancing are far more convincing when a student can click
    "KILL product-service-2" and watch the registry react.  A browser can't talk to Docker, so the UI calls
    this service (through the nginx proxy) and this service calls Docker.

SAFETY
    * It only touches containers carrying the label  lab.control=true  (see docker-compose.yml)
    * It only allows six actions: stop, kill, pause, unpause, start, restart
    * It is NOT published on a host port: only the UI container can reach it.
    * It uses only the Python standard library (no pip install).

    It does need /var/run/docker.sock -> treat the lab as a trusted, local, classroom tool.

ENDPOINTS
    GET  /health
    GET  /containers                       -> state of every controllable container
    POST /containers/<name>/<action>       -> action in: stop | kill | pause | unpause | start | restart
"""
import http.client
import json
import os
import re
import socket
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote

DOCKER_SOCK = os.environ.get("DOCKER_SOCK", "/var/run/docker.sock")
PORT = int(os.environ.get("PORT", "9000"))
LABEL = "lab.control=true"

# what each UI action means for Docker, and what it teaches
ACTIONS = {
    "stop":    "stop?t=10",   # SIGTERM -> graceful shutdown -> app DEREGISTERS from Eureka
    "kill":    "kill",        # SIGKILL -> crash: no deregistration, Eureka must notice via missed heartbeats
    "pause":   "pause",       # freeze the process (cgroup freezer): looks like a network partition / hung JVM
    "unpause": "unpause",
    "start":   "start",
    "restart": "restart?t=10",
}


class UnixHTTPConnection(http.client.HTTPConnection):
    """http.client over the Docker unix socket."""

    def __init__(self, path, timeout=30):
        super().__init__("localhost", timeout=timeout)
        self._path = path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self._path)


def docker(method, path, timeout=30):
    conn = UnixHTTPConnection(DOCKER_SOCK, timeout=timeout)
    try:
        conn.request(method, path)
        resp = conn.getresponse()
        body = resp.read()
        return resp.status, body
    finally:
        conn.close()


def list_containers():
    filters = quote(json.dumps({"label": [LABEL]}))
    status, body = docker("GET", f"/containers/json?all=true&filters={filters}")
    if status != 200:
        raise RuntimeError(f"docker returned {status}: {body[:200]!r}")
    result = []
    for c in json.loads(body):
        name = c["Names"][0].lstrip("/")
        labels = c.get("Labels", {})
        result.append({
            "name": name,
            "role": labels.get("lab.role", ""),
            "state": c.get("State", "unknown"),          # running | paused | exited | created ...
            "status": c.get("Status", ""),               # "Up 2 minutes (healthy)" / "Up 3 min (Paused)" / "Exited (137) ..."
        })
    result.sort(key=lambda x: x["name"])
    return result


def run_action(name, action):
    if action not in ACTIONS:
        return 400, {"ok": False, "message": f"unknown action '{action}'"}
    if not re.fullmatch(r"[a-z0-9][a-z0-9_.-]*", name):
        return 400, {"ok": False, "message": "invalid container name"}
    allowed = {c["name"] for c in list_containers()}
    if name not in allowed:
        return 403, {"ok": False, "message": f"'{name}' is not a lab-controlled container"}
    status, body = docker("POST", f"/containers/{quote(name)}/{ACTIONS[action]}", timeout=40)
    if status in (204, 304):
        return 200, {"ok": True, "container": name, "action": action,
                     "message": "done" if status == 204 else "already in that state"}
    try:
        detail = json.loads(body).get("message", "")
    except Exception:
        detail = body.decode("utf-8", "replace")[:200]
    return 409, {"ok": False, "container": name, "action": action, "message": detail}


class Handler(BaseHTTPRequestHandler):
    server_version = "lab-control/1.0"

    def _send(self, code, payload):
        data = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        try:
            if self.path == "/health":
                return self._send(200, {"status": "UP"})
            if self.path == "/containers":
                return self._send(200, {"containers": list_containers()})
            return self._send(404, {"error": "not found"})
        except Exception as e:  # noqa: BLE001 - report anything to the UI
            return self._send(500, {"error": str(e)})

    def do_POST(self):
        m = re.fullmatch(r"/containers/([^/]+)/([a-z]+)", self.path)
        if not m:
            return self._send(404, {"error": "not found"})
        try:
            code, payload = run_action(m.group(1), m.group(2))
            print(f"[lab-control] {m.group(2)} {m.group(1)} -> {code} {payload.get('message')}", flush=True)
            return self._send(code, payload)
        except Exception as e:  # noqa: BLE001
            return self._send(500, {"ok": False, "message": str(e)})

    def log_message(self, fmt, *args):  # keep the container log quiet
        pass


if __name__ == "__main__":
    print(f"[lab-control] listening on :{PORT}, docker socket {DOCKER_SOCK}", flush=True)
    try:
        ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
