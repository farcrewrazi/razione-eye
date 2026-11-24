/**
 * render-covers.mjs — Render job-application cover letters to clean one-page A4 PDFs.
 *
 * Usage: node render-covers.mjs <export.json> <out-dir>
 *
 * Dependency-free apart from pdfkit (run with NODE_PATH=/tmp/pdfenv/node_modules).
 * Reads the Action Gate payload (top-level key `careers`, or `payload.careers`,
 * or a bare array), and writes one PDF per draft plus a manifest is produced by
 * the companion step. Emits per-file JSON status lines on stdout.
 *
 * Layout: A4, Helvetica, ink #14161c, muted #5c6472, accent #1a7ba6.
 * Letterhead: name in Helvetica-Bold + accent hairline rule + muted contact line.
 * Subject: "Re: Application for <role> — <company>".
 * Body: hard-wrapped source is re-joined into flowing paragraphs (a wrapped
 *   sentence split over 3 lines renders as ONE paragraph). Blank lines separate
 *   paragraphs. ~10.5pt, leading ~15.5pt, 85pt side margins (~75 chars), left aligned.
 * Signature block: "Regards," / name (bold). The contact line lives in the
 *   letterhead ONLY — printing it twice on a one-page letter looks like a draft.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Resolve pdfkit robustly: prefer a normal bare import; fall back to an
// explicit install directory given via PDFKIT_DIR (or the known dev env at
// /tmp/pdfenv/node_modules). ESM ignores NODE_PATH, so we resolve manually.
const require = createRequire(import.meta.url);
function loadPDFDocument() {
  const candidates = [];
  const dirs = [];
  if (process.env.PDFKIT_DIR) dirs.push(process.env.PDFKIT_DIR);
  dirs.push('/tmp/pdfenv/node_modules');
  for (const d of dirs) {
    candidates.push(path.join(d, 'pdfkit', 'js', 'pdfkit.js'));
    candidates.push(path.join(d, 'pdfkit'));
  }
  candidates.push('pdfkit');
  for (const c of candidates) {
    try {
      const mod = require(c);
      return mod && mod.default ? mod.default : mod;
    } catch (_) { /* try next */ }
  }
  throw new Error('pdfkit not found; set PDFKIT_DIR to its node_modules directory');
}
const PDFDocument = loadPDFDocument();

const INK = '#14161c';
const MUTED = '#5c6472';
const ACCENT = '#1a7ba6';
const RULE = '#d5dbe4';

const BODY_SIZE = 10.5;
const BODY_LEADING = 15.5;      // generous leading
const PARA_GAP = 9;             // space between paragraphs
const NAME = 'Fakhrur Razi Abdul Halim';
const DEFAULT_CONTACT =
  '+6017-964-4192 \u00b7 farcrewrazi@gmail.com \u00b7 linkedin.com/in/farcrewrazi';

// 85pt side margins keep the measure at ~75 characters. At 60pt the line ran
// ~95 characters, which is past the comfortable reading width and makes a short
// letter look like a pasted paragraph rather than a letter.
const MARGIN = { top: 60, bottom: 60, left: 85, right: 85 };

/* ------------------------------------------------------------------ utils */

// Remove any trailing "---\n## Tailored CV ..." appendix and any markdown chars.
function stripAppendix(text) {
  let t = text;
  // Cut a trailing horizontal-rule + "Tailored CV" block (or anything after a lone ---).
  t = t.replace(/\n-{3,}\n[\s\S]*$/m, '');
  // Drop any heading lines like "## Tailored CV — ..."
  t = t.replace(/^#{1,6}\s+.*$/gm, '');
  return t;
}

// Remove stray markdown emphasis characters ("**", leading "* ", backticks) but
// keep genuine punctuation. Never leave an emphasis '*' in output.
function deMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')  // bold
    .replace(/(^|\s)\*(?=\S)/g, '$1') // leading list bullets
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '');
}

// Collapse internal whitespace but keep single spaces.
function normSpaces(s) {
  return s.replace(/[ \t]+/g, ' ').replace(/\s+$/g, '');
}

/**
 * Parse a cover_note into { greeting, paragraphs[], signoff, signer, contact }.
 *
 * Handles three shapes seen in the data:
 *   A) wrapped, blank-line-separated, explicit "\nRegards,\n<name>\n<contact>"
 *   B) fully inline (no newlines at all): "... Regards, <name> <contact>"
 *   C) no signature at all (letter ends mid-flow) -> synthesize name/contact
 */
function parseCoverNote(raw) {
  let text = stripAppendix(raw || '');
  text = deMarkdown(text);

  // Normalise line endings and trim trailing spaces per line.
  let lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t]+$/, ''));

  // --- Signature extraction -------------------------------------------------
  let signer = null;
  let contact = null;
  let signoff = null;

  const joined = lines.join('\n');
  const hasNewlineSig = /\n[ \t]*Regards,[ \t]*\n/.test(joined);
  const inlineSigMatch = joined.match(/Regards,\s*([^]*)$/i);

  if (hasNewlineSig) {
    // Shape A: split the trailing signature block off.
    const idx = lines.findIndex((l, i) => /^[ \t]*Regards,[ \t]*$/.test(l));
    const tail = lines.slice(idx + 1).map((l) => l.trim()).filter(Boolean);
    signoff = lines[idx].trim();
    signer = tail[0] || null;
    contact = tail.slice(1).join(' ').trim() || null;
    lines = lines.slice(0, idx);
  } else if (inlineSigMatch) {
    // Shape B: everything after "Regards," is the signature, inline.
    const after = inlineSigMatch[1].trim();
    // Pull the contact line (contains '@' or '+60' or 'linkedin').
    const phone = after.match(/\+?\d[\d\s-]{7,}\d/);
    signoff = 'Regards,';
    signer = NAME;
    let rest = after;
    // Remove the known name from the tail.
    rest = rest.replace(NAME, '').trim();
    const contactMatch = rest.match(/\+?\d[\d\s-]{7,}\d[^]*$/);
    if (contactMatch) contact = contactMatch[0].trim();
    else if (phone) contact = phone[0].trim();
    // Cut the body at "Regards,".
    const bodyEnd = joined.search(/Regards,/i);
    lines = joined.slice(0, bodyEnd).split('\n');
  }

  // Shape C: no signature found at all -> synthesize.
  if (!signoff) signoff = 'Regards,';
  if (!signer) signer = NAME;
  if (!contact || contact.length < 6) contact = DEFAULT_CONTACT;
  contact = normSpaces(deMarkdown(contact));

  // --- Paragraph assembly ---------------------------------------------------
  // Join consecutive non-blank lines into a single paragraph. Blank lines
  // separate paragraphs.
  const paragraphs = [];
  let buf = [];
  const flush = () => {
    if (buf.length) {
      // Join wrapped lines into one flowing paragraph, single-space separated.
      const p = normSpaces(buf.join(' '));
      if (p) paragraphs.push(p);
      buf = [];
    }
  };
  for (const l of lines) {
    if (l.trim() === '') flush();
    else buf.push(l.trim());
  }
  flush();

  // Shape B inline blob: no blank lines means one giant paragraph. Re-split it
  // into readable paragraphs at sentence boundaries (2-4 sentences each).
  if (paragraphs.length === 1 && paragraphs[0].length > 420) {
    paragraphs.splice(0, 1, ...splitBlobIntoParagraphs(paragraphs[0]));
  }

  // Greeting ("Dear X,") is the first paragraph if it looks like one.
  let greeting = null;
  if (paragraphs.length && /^Dear\b[^.]*,\s*$/.test(paragraphs[0])) {
    greeting = paragraphs.shift();
  } else if (paragraphs.length && /^Dear\b[^.]*,/.test(paragraphs[0]) &&
             paragraphs[0].length < 60) {
    greeting = paragraphs.shift();
  }

  return { greeting, paragraphs, signoff, signer, contact };
}

// Split a long run-on blob into paragraphs at sentence boundaries, targeting
// ~3 sentences per paragraph.
function splitBlobIntoParagraphs(blob) {
  const sentences = blob.split(/(?<=[.!?])\s+(?=[A-Z("])/);
  const out = [];
  let cur = [];
  for (const s of sentences) {
    cur.push(s);
    if (cur.length >= 3 && cur.join(' ').length > 220) {
      out.push(cur.join(' '));
      cur = [];
    }
  }
  if (cur.length) out.push(cur.join(' '));
  return out;
}

// Company cleanup: strip a duplicated role suffix, e.g.
// "Verus Virtus Sdn. Bhd. — Senior Software Engineer" with role
// "Senior Software Engineer" -> "Verus Virtus Sdn. Bhd.".
function cleanCompany(company, role) {
  let c = normSpaces((company || '').trim());
  if (!c) return role || '';
  const r = normSpaces((role || '').trim());
  if (r) {
    // Common separators used to append the role.
    for (const sep of [' \u2014 ', ' \u2013 ', ' - ', ' \u00b7 ', ' | ']) {
      const suffix = sep + r;
      if (c.toLowerCase().endsWith(suffix.toLowerCase())) {
        c = c.slice(0, c.length - suffix.length).trim();
        break;
      }
    }
    // If the whole thing is exactly the role, keep role as company fallback.
    if (c.toLowerCase() === r.toLowerCase()) c = r;
  }
  return c.replace(/[\s\u2014\u2013\-|·]+$/, '').trim() || c;
}

function cleanRole(role, company) {
  return normSpaces((role || '').trim()) || normSpaces((company || '').trim());
}

// Derive the output slug: cv_pdf stem, else cv_file stem, else action_id.
function outName(item) {
  const stemOf = (n) => {
    if (!n) return null;
    const base = n.split('/').pop().replace(/\.(pdf|md)$/i, '');
    return base || null;
  };
  const stem = stemOf(item.cv_pdf) || stemOf(item.cv_file) || String(item.action_id || 'cover');
  return `${stem}-cover.pdf`;
}

/* ---------------------------------------------------------------- renderer */

function renderOne(item, outDir) {
  const meta = parseCoverNote(item.cover_note);
  const role = cleanRole(item.role, item.company);
  const company = cleanCompany(item.company, item.role);
  const file = outName(item);
  const outPath = path.join(outDir, file);

  const doc = new PDFDocument({
    size: 'A4',
    margins: MARGIN,
    info: {
      Title: `Cover letter \u2014 ${role} \u2014 ${company}`,
      Author: NAME,
      Creator: 'RaziOne Eye (Action Gate draft)',
    },
  });

  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // --- Letterhead -----------------------------------------------------------
  doc.font('Helvetica-Bold').fontSize(19).fillColor(INK)
    .text(NAME, left, doc.page.margins.top, { width, lineGap: 0 });
  const ruleY = doc.y + 4;
  doc.moveTo(left, ruleY).lineTo(left + 42, ruleY).lineWidth(2.2).strokeColor(ACCENT).stroke();
  doc.moveTo(left + 42, ruleY).lineTo(left + width, ruleY).lineWidth(0.7).strokeColor(RULE).stroke();
  doc.y = ruleY + 7;
  doc.font('Helvetica').fontSize(8.8).fillColor(MUTED)
    .text(meta.contact, left, doc.y, { width });
  doc.moveDown(1.1);

  // --- Subject line ---------------------------------------------------------
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK)
    .text(`Re: Application for ${role} \u2014 ${company}`, left, doc.y, { width, lineGap: 1 });
  doc.moveDown(0.9);

  // --- Body -----------------------------------------------------------------
  const bodyOpts = { width, align: 'left', lineGap: BODY_LEADING - BODY_SIZE };
  let first = true;
  const writeParagraph = (text, opts = {}) => {
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(opts.size || BODY_SIZE)
      .fillColor(opts.color || INK)
      .text(text, left, doc.y, {
        width,
        align: 'left',
        lineGap: (opts.lineGap != null ? opts.lineGap : BODY_LEADING) - (opts.size || BODY_SIZE),
      });
    doc.y += opts.after != null ? opts.after : PARA_GAP;
  };

  if (meta.greeting) {
    writeParagraph(meta.greeting, { after: PARA_GAP + 2 });
  }
  meta.paragraphs.forEach((p) => {
    writeParagraph(p, { after: PARA_GAP });
    first = false;
  });

  // --- Signature block ------------------------------------------------------
  // No extra lift here: the last paragraph already advanced by PARA_GAP, and a
  // second gap before "Regards," reads as a typo. The contact line lives in the
  // letterhead only — printing it twice on a one-page letter looks sloppy.
  writeParagraph(meta.signoff, { after: 2 });
  writeParagraph(meta.signer, { bold: true, after: 3 });

  doc.end();

  return new Promise((resolve) => {
    stream.on('finish', () => {
      const bytes = fs.statSync(outPath).size;
      resolve({
        action_id: item.action_id,
        cover_pdf: file,
        role,
        company,
        path: outPath,
        bytes,
      });
    });
  });
}

/* -------------------------------------------------------------------- main */

async function main() {
  const [inPath, outDir] = process.argv.slice(2);
  if (!inPath || !outDir) {
    console.error('usage: node render-covers.mjs <export.json> <out-dir>');
    process.exit(2);
  }
  const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const items = Array.isArray(data)
    ? data
    : (data.careers || (data.payload && data.payload.careers) || []);
  if (!items.length) throw new Error('no career items found in input');

  fs.mkdirSync(outDir, { recursive: true });

  const results = [];
  for (const item of items) {
    const r = await renderOne(item, outDir);
    results.push(r);
    console.log(JSON.stringify(r));
  }
  // Emit a machine-readable summary on the last line for the caller.
  console.log('SUMMARY ' + JSON.stringify(results));
}

main().catch((e) => {
  console.error('FATAL', e && e.stack ? e.stack : e);
  process.exit(1);
});