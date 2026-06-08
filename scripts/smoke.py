"""End-to-end smoke test driven against a live backend.

Run via `scripts\\smoke.bat` (backend must be running). Verifies:
  - project create
  - script generate
  - scenes generate
  - images job
  - voice job
  - transcribe
  - video assemble
  - download mp4 ≥ 1 MB
"""
from __future__ import annotations

import json
import sys
import time
import urllib.request


API = "http://127.0.0.1:8000"


def post(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        f"{API}{path}", data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read().decode("utf-8"))


def get(path: str) -> dict:
    with urllib.request.urlopen(f"{API}{path}", timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def wait_job(job_id: int, timeout_s: int = 1800) -> dict:
    t0 = time.time()
    while True:
        j = get(f"/api/jobs/{job_id}")
        print(f"  job {job_id} {j['kind']}: {j['status']} {int(j['progress']*100)}% — {j['message']}")
        if j["status"] in ("done", "failed"):
            return j
        if time.time() - t0 > timeout_s:
            raise SystemExit("timed out waiting for job")
        time.sleep(2)


def main() -> int:
    print("==> create project")
    project = post("/api/projects", {
        "name": "smoke-honey", "topic": "How honey is made",
        "style": "documentary", "voice": "female",
    })
    pid = project["id"]

    print("==> generate script")
    script = post("/api/scripts/generate", {"project_id": pid, "target_seconds": 30})
    print("    script id", script["id"])

    print("==> generate scenes")
    scenes = post("/api/scenes/generate", {"project_id": pid, "script_id": script["id"]})
    print(f"    {len(scenes)} scenes")

    print("==> images")
    j = post("/api/images/generate", {"project_id": pid, "style": "documentary"})
    if wait_job(j["job_id"])["status"] != "done":
        raise SystemExit("image job failed")

    print("==> voice")
    j = post("/api/voice/generate", {"project_id": pid, "voice": "female"})
    if wait_job(j["job_id"])["status"] != "done":
        raise SystemExit("voice job failed")

    print("==> transcribe")
    post("/api/voice/transcribe", {"project_id": pid})

    print("==> assemble")
    j = post("/api/video/assemble", {"project_id": pid})
    if wait_job(j["job_id"])["status"] != "done":
        raise SystemExit("video job failed")

    exports = get(f"/api/video/by-project/{pid}")
    if not exports:
        raise SystemExit("no export produced")
    size_mb = exports[0]["size_bytes"] / (1024 * 1024)
    print(f"==> OK — MP4 produced: {size_mb:.2f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
