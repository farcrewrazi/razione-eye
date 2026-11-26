#!/usr/bin/env python3
"""Find business (prepare_pitch) gate drafts that have no outreach scripts yet.

Every business row in the Action Gate is supposed to carry three ready-to-use
outreach scripts in its payload:

    email_script      formal, forwardable as-is (subject line + body)
    whatsapp_script   short, casual-professional first touch
    call_script       bullet-point call plan (open / discover / offer / close)

The owner opens them from a **Scripts** button beside *View proposal*, so a row
without them is a broken button. This is the DETECTOR for that gap: it scans
EVERY business row (pending and decided, any wave — not just the newest import)
and writes `~/eye-data/scriptwork/pending-scripts.json` with the facts a writer
needs to draft the three scripts for each row.

Deterministic on purpose: a cron job uses this output as its `monitor`, so an
unchanged missing-set never wakes an agent. No timestamps, stable ordering.

  python3 gate-script-watch.py            # human/agent readable
  python3 gate-script-watch.py --json     # machine readable

Exit code is always 0 — the output is the signal, not the status.

Reads EYE_SERVICE_TOKEN from ~/razione-eye/.env; must run on the app host.
"""
import json
import os
import sys
import urllib.request

ENV = os.path.expanduser("~/razione-eye/.env")
OUT_DIR = os.path.expanduser("~/eye-data/scriptwork")
WATCH_OUT = os.path.join(OUT_DIR, "pending-scripts.json")
API = "http://127.0.0.1:8082/api/gate/actions?limit=1000"
FIELDS = ("email_script", "whatsapp_script", "call_script")


def token():
    with open(ENV) as fh:
        for line in fh:
            if line.startswith("EYE_SERVICE_TOKEN="):
                return line.split("=", 1)[1].strip()
    raise SystemExit("EYE_SERVICE_TOKEN missing from .env")


def fetch():
    req = urllib.request.Request(API, headers={"X-Eye-Service-Token": token()})
    return json.loads(urllib.request.urlopen(req).read())["items"]


def labelled(description, label):
    """Pull one `**Label:** value` line out of the structured description."""
    for line in (description or "").split("\n"):
        if line.strip().lower().startswith(f"**{label.lower()}:**"):
            return line.split(":", 1)[1].strip().strip("*").strip()
    return ""


def main():
    items = fetch()
    pending = []
    total_business = 0

    for a in items:
        if a.get("action_type") != "prepare_pitch":
            continue
        total_business += 1
        p = a.get("payload") or {}
        missing = [f for f in FIELDS if not (p.get(f) or "").strip()]
        if not missing:
            continue

        o = a.get("opportunity") or {}
        data = o.get("data") or {}
        description = p.get("description") or ""
        company = (
            (o.get("company") or {}).get("name")
            or data.get("company")
            or a.get("summary", "").replace("Prepare pitch — ", "")
        )
        pending.append(
            {
                "action_id": a["id"],
                "status": a.get("status"),
                "company": company,
                "summary": a.get("summary", ""),
                "missing": missing,
                # facts a writer may use — never invent beyond these
                "where": labelled(description, "Where") or data.get("area", ""),
                "hook": labelled(description, "Hook"),
                "source_url": p.get("source_url") or data.get("source_url", ""),
                "channel": p.get("channel", ""),
                "contact": labelled(description, "Contact") or p.get("recipient_evidence", ""),
                "portfolio": p.get("portfolio") or [],
                "description": description,
                "proposal_markdown": p.get("proposal_markdown", ""),
            }
        )

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(WATCH_OUT, "w") as fh:
        json.dump(
            {"business_rows": total_business, "pending": pending, "export": WATCH_OUT},
            fh,
            indent=1,
            sort_keys=True,
        )

    n = len(pending)
    if "--json" in sys.argv:
        print(json.dumps({"business_rows": total_business, "missing": n, "pending": pending}))
        return

    # Deterministic on purpose: this line is the cron monitor. No timestamps.
    print(f"MISSING scripts={n} business_rows={total_business}")
    for row in pending:
        print(f"  {row['status']:8s} {row['action_id']} {row['company'][:60]} ({','.join(row['missing'])})")
    print(f"export {WATCH_OUT}")


if __name__ == "__main__":
    main()
