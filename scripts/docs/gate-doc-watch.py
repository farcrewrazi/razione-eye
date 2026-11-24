#!/usr/bin/env python3
"""Find gate drafts that have a document SOURCE but no rendered PDF.

The Action Gate never renders at request time: a draft is a markdown source
(`cv_markdown`, `cover_note`, `proposal_markdown`) plus a filename field
(`cv_pdf`, `cover_note_pdf`, `proposal_pdf`) that the API streams from disk. A
draft created by the hunt rail therefore starts life markdown-only, and the
owner sees a disabled PDF tab until something renders it.

This script is the detector. It is cheap and deterministic on purpose: a cron
job uses its output as a `monitor`, so an unchanged result never wakes an agent.
When the missing set CHANGES (a new draft arrived, or a render failed), the
monitor fires and the render job runs.

  python3 gate-doc-watch.py            # human/agent readable summary
  python3 gate-doc-watch.py --json     # machine readable

Exit code is always 0 — the output is the signal, not the status.

Reads EYE_SERVICE_TOKEN from ~/razione-eye/.env; must run on the app host.
"""
import json
import os
import sys
import urllib.request

ENV = os.path.expanduser("~/razione-eye/.env")
OUT_DIR = os.path.expanduser("~/eye-data/docwork")
WATCH_OUT = os.path.join(OUT_DIR, "pending-docs.json")
CV_DIR = os.path.expanduser("~/eye-data/cvs")
COVER_DIR = os.path.expanduser("~/eye-data/covers")
API = "http://127.0.0.1:8082/api/gate/actions?limit=1000"


def token():
    with open(ENV) as fh:
        for line in fh:
            if line.startswith("EYE_SERVICE_TOKEN="):
                return line.split("=", 1)[1].strip()
    raise SystemExit("EYE_SERVICE_TOKEN missing from .env")


def fetch():
    req = urllib.request.Request(API, headers={"X-Eye-Service-Token": token()})
    return json.loads(urllib.request.urlopen(req).read())["items"]


def missing_file(directory, name):
    """A declared PDF that is not on disk is as broken as no filename at all."""
    return not name or not os.path.exists(os.path.join(directory, os.path.basename(name)))


def main():
    items = fetch()
    cv_batch, cover_batch, plan = [], [], []

    for a in items:
        if a.get("status") != "PENDING":
            continue  # decisions are final, but see attach-docs.py for backfill
        p = a.get("payload") or {}
        o = a.get("opportunity") or {}
        data = o.get("data") or {}
        company = (o.get("company") or {}).get("name") or data.get("company")
        role = data.get("role") or a.get("summary")

        if a["action_type"] == "apply_to_job":
            md = p.get("cv_markdown") or ""
            if md and missing_file(CV_DIR, p.get("cv_pdf")):
                cv_file = p.get("cv_file") or f"{a['id']}.md"
                cv_batch.append({"action_id": a["id"], "cv_file": cv_file, "markdown": md})
                plan.append({"action_id": a["id"], "kind": "cv",
                             "file": p.get("cv_pdf") or cv_file.replace(".md", ".pdf"),
                             "summary": a.get("summary", "")[:70]})

            note = p.get("cover_note") or ""
            if note and missing_file(COVER_DIR, p.get("cover_note_pdf")):
                cover_batch.append({
                    "action_id": a["id"], "role": role, "company": company,
                    "cover_note": note, "cv_file": p.get("cv_file"),
                    "cv_pdf": p.get("cv_pdf"),
                })
                plan.append({"action_id": a["id"], "kind": "cover", "file": None,
                             "summary": a.get("summary", "")[:70]})

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(WATCH_OUT, "w") as fh:
        json.dump({"cv_export": cv_batch, "cover_export": {"careers": cover_batch},
                   "plan": plan}, fh, indent=1)

    n_cv = sum(1 for x in plan if x["kind"] == "cv")
    n_cover = sum(1 for x in plan if x["kind"] == "cover")

    if "--json" in sys.argv:
        print(json.dumps({"cv": n_cv, "cover": n_cover, "plan": plan, "export": WATCH_OUT}))
        return

    # Deterministic on purpose: this line is the cron monitor. No timestamps.
    print(f"MISSING cv={n_cv} cover={n_cover}")
    for p in plan:
        print(f"  {p['kind']:5s} {p['action_id']} {p['summary']}")
    print(f"export {WATCH_OUT}")


if __name__ == "__main__":
    main()
