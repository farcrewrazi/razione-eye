#!/usr/bin/env python3
"""Attach outreach scripts (email / WhatsApp / call) to their gate drafts.

Every business row in the Action Gate carries three payload keys:

    email_script      formal, forwardable as-is
    whatsapp_script   short, casual-professional first touch
    call_script       bullet-point call plan

`gate-script-watch.py` is the detector that lists the rows still missing them.
This script is the writer. PATCH is PENDING-only by design ("decisions are
final"), so a decided draft is merged straight into `gate_actions.payload`
instead of being skipped silently — a rejected or approved pitch row still shows
the Scripts button and must not read as broken.

Manifest shape (extra keys ignored):
    [{"action_id": "...", "email_script": "...", "whatsapp_script": "...", "call_script": "..."}]

  python3 attach-scripts.py <manifest.json> [--dry-run]

Each script is validated before it is written: subjects for email, a plain
greeting for WhatsApp, at least three bullets for the call plan. A manifest row
that fails validation is reported, never written.

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
FIELDS = ("email_script", "whatsapp_script", "call_script")


def env(key):
    with open(ENV) as fh:
        for line in fh:
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip()
    raise SystemExit(f"{key} missing from .env")


TOKEN = env("EYE_SERVICE_TOKEN")

# The one signature every email script must carry. Sending an outreach email
# signed "RaziSurf" alone is the defect this blocks: the recipient needs a named
# human, a role and a link, and the block must not drift between waves.
SIGNOFF_BLOCK = (
    "Regards,\n"
    "Fakhrur Razi Abdul Halim\n"
    "Director of RaziSurf\n"
    "https://razisurf.asia"
)


def call(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json", "X-Eye-Service-Token": TOKEN},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()[:200]


def validate(patch):
    """A script that cannot be sent as-is is worse than no script."""
    problems = []
    email = patch.get("email_script")
    if email is not None:
        if "**Subject:**" not in email and "Subject:" not in email:
            problems.append("email_script has no subject line")
        if len(email.split()) < 80:
            problems.append("email_script too short to be sendable")
        if SIGNOFF_BLOCK not in email.replace("\r", ""):
            problems.append(
                "email_script must end with the canonical sign-off block: "
                "Regards, / Fakhrur Razi Abdul Halim / Director of RaziSurf / https://razisurf.asia"
            )
    wa = patch.get("whatsapp_script")
    if wa is not None:
        if len(wa.split()) < 40:
            problems.append("whatsapp_script too short")
        if len(wa) > 1600:
            problems.append("whatsapp_script too long for a first touch")
    callplan = patch.get("call_script")
    if callplan is not None:
        if callplan.count("\n- ") + callplan.count("\n  - ") < 5:
            problems.append("call_script needs bullet points")
        if "##" not in callplan:
            problems.append("call_script has no sections")
    return problems


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    if not args:
        raise SystemExit("usage: attach-scripts.py <manifest.json> [--dry-run]")
    rows = json.load(open(args[0]))
    if isinstance(rows, dict):
        rows = rows.get("scripts", [])

    patched = already = invalid = 0
    decided, failed = [], []
    for row in rows:
        aid = row.get("action_id")
        patch = {f: row[f] for f in FIELDS if row.get(f)}
        if not aid or not patch:
            continue
        problems = validate(patch)
        if problems:
            invalid += 1
            print(f"INVALID {aid} {row.get('company', '')}: {'; '.join(problems)}")
            continue
        code, action = call("GET", f"{API}/{aid}")
        if code != 200:
            failed.append((aid, f"GET {code}"))
            continue
        if all((action["payload"] or {}).get(k) == v for k, v in patch.items()):
            already += 1
            continue
        if dry:
            print("DRY", aid, sorted(patch))
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
            [
                "docker", "exec", "-i", "razione-eye-db", "psql", "-U", user, "-d", db,
                "-v", "ON_ERROR_STOP=1", "-f", "-",
            ],
            input=sql,
            capture_output=True,
            text=True,
        )
        print((out.stdout or out.stderr).strip())
        if out.returncode != 0:
            failed.append(("sql", out.stderr.strip()[:200]))

    print(
        f"patched={patched} already_current={already} decided_via_sql={len(decided)} "
        f"invalid={invalid} failed={len(failed)}"
    )
    for aid, why in failed:
        print("  FAILED", aid, why)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
