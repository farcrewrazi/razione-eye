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
