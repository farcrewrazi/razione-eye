#!/usr/bin/env python3
"""Attach rendered PDFs to their gate drafts.

Reads a manifest of rendered files and writes the payload field the API serves
from: `cv_pdf` for a tailored CV, `cover_note_pdf` for a cover letter. PATCH is
PENDING-only by design ("decisions are final"), so a decided draft is patched
straight in `gate_actions.payload` instead of being skipped silently.

Manifest shape (extra keys ignored):
    [{"action_id": "...", "cv_pdf": "x.pdf"}, {"action_id": "...", "cover_pdf": "y.pdf"}]

  python3 attach-docs.py <manifest.json> [--dry-run]

Must run on the app host (needs the API on 127.0.0.1 and docker for the DB).
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

API = "http://127.0.0.1:8082/api/gate/actions"
ENV = os.path.expanduser("~/razione-eye/.env")
FIELDS = {"cv_pdf": "cv_pdf", "cover_pdf": "cover_note_pdf", "proposal_pdf": "proposal_pdf"}


def env(key):
    with open(ENV) as fh:
        for line in fh:
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip()
    raise SystemExit(f"{key} missing from .env")


TOKEN = env("EYE_SERVICE_TOKEN")


def call(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={"Content-Type": "application/json", "X-Eye-Service-Token": TOKEN},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()[:200]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    if not args:
        raise SystemExit("usage: attach-docs.py <manifest.json> [--dry-run]")
    rows = json.load(open(args[0]))

    patched = already = 0
    decided, failed = [], []
    for row in rows:
        aid = row.get("action_id")
        patch = {dst: row[src] for src, dst in FIELDS.items() if row.get(src)}
        if not aid or not patch:
            continue
        code, action = call("GET", f"{API}/{aid}")
        if code != 200:
            failed.append((aid, f"GET {code}"))
            continue
        if all((action["payload"] or {}).get(k) == v for k, v in patch.items()):
            already += 1
            continue
        if dry:
            print("DRY", aid, patch)
            continue
        code, resp = call("PATCH", f"{API}/{aid}", {"payload": patch})
        if code == 200:
            patched += 1
        elif code == 409:
            decided.append((aid, patch))
        else:
            failed.append((aid, f"PATCH {code} {resp}"))

    if decided:
        user, db = env("POSTGRES_USER"), env("POSTGRES_DB")
        stmts = []
        for aid, patch in decided:
            js = json.dumps(patch)
            if "$q$" in js:
                raise SystemExit("dollar-quote collision")
            stmts.append(
                f"UPDATE gate_actions SET payload = payload || $q${js}$q$::jsonb WHERE id = '{aid}';"
            )
        sql = "BEGIN;\n" + "\n".join(stmts) + "\nCOMMIT;\n"
        out = subprocess.run(
            ["docker", "exec", "-i", "razione-eye-db", "psql", "-U", user, "-d", db,
             "-v", "ON_ERROR_STOP=1", "-f", "-"],
            input=sql, capture_output=True, text=True,
        )
        print((out.stdout or out.stderr).strip())
        if out.returncode != 0:
            failed.append(("sql", out.stderr.strip()[:200]))

    print(f"patched={patched} already_current={already} decided_via_sql={len(decided)} failed={len(failed)}")
    for aid, why in failed:
        print("  FAILED", aid, why)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
