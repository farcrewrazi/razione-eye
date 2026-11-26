# Document rail — offline PDF rendering

The Action Gate never generates a document at request time. Each draft points at a
PDF that was rendered **offline** into `~/eye-data/<family>/` on the app host and is
served read-only by the API:

| Draft | payload field | dir (`EYE_*_DIR`) | route |
| --- | --- | --- | --- |
| `apply_to_job` — tailored CV | `cv_pdf` | `~/eye-data/cvs` | `/api/gate/actions/:id/cv.pdf` |
| `apply_to_job` — cover letter | `cover_note_pdf` | `~/eye-data/covers` | `/api/gate/actions/:id/cover.pdf` |
| `prepare_pitch` — proposal | `proposal_pdf` | `~/eye-data/proposals` | `/api/gate/actions/:id/document.pdf` |

All three take `?download=1` for a `Content-Disposition: attachment` response.

## Renderers

| script | input | output |
| --- | --- | --- |
| `render-cvs.mjs` | `[{cv_file, markdown}]` | `~/eye-data/cvs/<cv file stem>.pdf` |
| `render-covers.mjs` | `{careers: [{action_id, role, company, cover_note, cv_pdf}]}` | `~/eye-data/covers/<cv stem>-cover.pdf` |
| `render-proposals.mjs` | `{proposals: [{action_id, company, proposal_pdf, proposal_markdown}]}` | `~/eye-data/proposals/<proposal_pdf>` |

`pdfkit` is not a workspace dependency. Either `npm i pdfkit` somewhere and run with
`NODE_PATH=<dir>/node_modules`, or let the scripts fall back to `/tmp/pdfenv/node_modules`.

## The render sweep (automatic)

`gate-doc-watch.py` is the detector: it lists PENDING gate drafts that have a document
source (`cv_markdown`, `cover_note`) but no PDF on disk, and writes
`~/eye-data/docwork/pending-docs.json` with the render batches. `attach-docs.py` writes
the rendered filenames back into `payload.cv_pdf` / `payload.cover_note_pdf`.

A cron job ("Action Gate — PDF render sweep (Rina)", every 15 min) runs the detector as
its `monitor`, so an unchanged missing-set never wakes the agent — the sweep fires only
when a new draft arrives or a render left a gap. The sweep delegates the rendering to
the admin agent, then runs `attach-docs.py`.

    ssh fakhru94@34.143.217.207 'cd ~/razione-eye && python3 scripts/docs/gate-doc-watch.py'
    ssh fakhru94@34.143.217.207 'cd ~/razione-eye && python3 scripts/docs/attach-docs.py <manifest.json>'

A draft with no PDF is a real state the UI must show (a disabled PDF tab), never a hidden
button — but it should not survive the next sweep.

## Rules that came from real defects

- **Client documents carry no back-office evidence.** Scores, bands, tiers, the
  contact-hunting trail (organiser profiles, scraped emails, phone numbers) belong in
  `payload.description` / `recipient_evidence` for the owner's triage. A proposal PDF
  that names the client's buyer email is not sendable. Grep the rendered text for `@`
  and `\+?60` before shipping one.
- **A proposal ends after section 4.** No "next step" section: the owner opens with his
  own email and states the call there. The call invitation lives in the Description as a
  `**Next step:**` row.
- **Footers must not create pages.** PDFKit auto-breaks a page when text is written
  past the bottom margin. When adding "page N of M" inside a `bufferPages` loop, set
  `doc.page.margins.bottom = 0` for the footer write, or every footer lands on its own
  blank page. Verify with `pdfinfo | grep Pages` **against the footer's own N** — a
  renderer that reports "page 2 of 2" on a 4-page file passed its own author's check.
- **The markdown source is hard-wrapped.** Join consecutive non-blank lines into one
  paragraph; only blank lines and the signature block break the flow. The salutation is
  its own block — a fused "Dear X team, I am applying…" paragraph reads as a bug.
- **`PATCH /api/gate/actions/:id` is PENDING-only.** A decided draft that needs a new
  document field must be updated in the DB (`gate_actions.payload`), not through the API.

## The outreach-script rail (email · WhatsApp · call)

Every business draft (`prepare_pitch`) carries three markdown scripts in its payload —
`email_script` (formal, sendable as-is), `whatsapp_script` (short casual-professional
first touch) and `call_script` (bullet-point call plan). They are **payload only**: no
file, no route, no PDF. The gate row shows a **Scripts** button beside *View proposal*
with a `n/3` badge; the dialog toggles the three tabs and copies the selected script as
plain text (markdown markers stripped) so it pastes straight into a mail app or WhatsApp.

| script | role |
| --- | --- |
| `gate-script-watch.py` | detector — lists EVERY business row missing any of the three, any wave, pending or decided; writes `~/eye-data/scriptwork/pending-scripts.json` with the facts a writer may use |
| `attach-scripts.py` | writer — validates each script (subject line, RaziSurf sign-off, length, bullets) then PATCHes pending rows and SQL-merges decided ones |

    ssh fakhru94@34.143.217.207 'cd ~/razione-eye && python3 scripts/docs/gate-script-watch.py'
    ssh fakhru94@34.143.217.207 'cd ~/razione-eye && python3 scripts/docs/attach-scripts.py ~/eye-data/scripts/manifest.json --dry-run'

Rules that keep the scripts sendable:

- **The detector scans the queue, not one campaign.** It was written after a wave of
  business drafts arrived with proposals but no scripts, so the button had nothing to
  open. Scope it to `action_type = prepare_pitch` and every status, never to a batch id.
- **Scripts live in `~/eye-data/scripts/`, not the repo.** They quote real phone numbers
  and addresses and the repo is public; only the detector/writer logic is committed.
- **Copy strips markdown.** The panel renders markdown but the copy button emits plain
  text — pasting `**Subject:**` into Gmail is the defect this prevents.
- **Line breaks are content here.** A CV renderer joins hard-wrapped lines; a script must
  not (the sign-off and each call-plan bullet are their own lines), so `MarkdownScript`
  keeps one source line per rendered line.
- **A missing script is a visible state.** The Scripts button renders on every business
  row with `n/3`, and missing tabs are disabled with a reason — never hidden, never a
  disabled button with no explanation.
