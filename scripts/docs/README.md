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
| `render-proposals.mjs` | `{proposals: [{action_id, company, proposal_pdf, proposal_markdown}]}` | `~/eye-data/proposals/<proposal_pdf>` |
| `render-covers.mjs` | `{careers: [{action_id, role, company, cover_note, cv_pdf}]}` | `~/eye-data/covers/<cv stem>-cover.pdf` |

`pdfkit` is not a workspace dependency. Either `npm i pdfkit` somewhere and run with
`NODE_PATH=<dir>/node_modules`, or let the scripts fall back to `/tmp/pdfenv/node_modules`.

## Rules that came from real defects

- **Client documents carry no back-office evidence.** Scores, bands, tiers, the
  contact-hunting trail (organiser profiles, scraped emails, phone numbers) belong in
  `payload.description` / `recipient_evidence` for the owner's triage. A proposal PDF
  that names the client's buyer email is not sendable. Grep the rendered text for `@`
  and `\+?60` before shipping one.
- **Footers must not create pages.** PDFKit auto-breaks a page when text is written
  past the bottom margin. When adding "page N of M" inside a `bufferPages` loop, set
  `doc.page.margins.bottom = 0` for the footer write, or every footer lands on its own
  blank page. Verify with `pdfinfo | grep Pages` **against the footer's own N** — a
  renderer that reports "page 2 of 2" on a 4-page file passed its own author's check.
- **The markdown source is hard-wrapped.** Join consecutive non-blank lines into one
  paragraph; only blank lines and the signature block break the flow.
- **`PATCH /api/gate/actions/:id` is PENDING-only.** A decided draft that needs a new
  document field must be updated in the DB (`gate_actions.payload`), not through the API.
