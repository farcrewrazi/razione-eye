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
 *   paragraphs. ~10.5pt, leading ~15.5pt, left aligned.
 * Signature block kept on its own lines: "Regards," / name (bold) / contact (muted).
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

  // Greeting ("Dear X,") is the first paragraph if it looks like one.
  // Greeting extraction. The greeting must ALWAYS end up as its own block, so we
  // peel it off BEFORE any paragraph re-split. Two cases:
  //   1) the salutation is already its own line ("Dear X,"); or
  //   2) the salutation shares the first line with body text (the inline/"Shape B"
  //      blob: "Dear X, I am applying for ..."). We split at the first comma and
  //      keep the remainder as the first body paragraph. No wording changes — the
  //      salutation is moved, not rewritten.
  let greeting = null;
  if (paragraphs.length) {
    const ownLine = /^Dear\b[^,]*,?\s*$/.test(paragraphs[0]);
    // Salutation runs to the first comma and is short (<=60 chars). Using ',' as
    // the delimiter (not '.') keeps dotted names like "Mudah.my" intact.
    const inline = paragraphs[0].match(/^Dear\b[^,]{0,60},\s*/);
    if (ownLine) {
      greeting = paragraphs.shift();
    } else if (inline) {
      greeting = inline[0].trim();
      const rest = paragraphs[0].slice(inline[0].length).trim();
      if (rest) paragraphs[0] = rest;
      else paragraphs.shift();
    }
  }

  // Readability: a body that arrived as ONE dense paragraph (a pasted-note blob)
  // is re-split into 2-3 paragraphs at EXISTING sentence boundaries only — the
  // opening statement of intent, then the closing/gap sentence. Wording is never
  // added, removed, reworded or reordered; only paragraph breaks are inserted.
  if (paragraphs.length === 1 && paragraphs[0].length > 230) {
    const split = splitBodyIntoParagraphs(paragraphs[0]);
    if (split.length > 1) paragraphs.splice(0, 1, ...split);
  }

  return { greeting, paragraphs, signoff, signer, contact };
}

// Split a single dense body paragraph into 2-3 paragraphs at EXISTING sentence
// boundaries only. Never adds, removes, rewords or reorders a single word.
// Preference order:
//   1) break after the opening statement of intent (the sentence naming the role
//      / why he is writing), then
//   2) break before the closing/gap sentence (e.g. "I have not worked in Go,
//      TypeScript or Next.js." / "I would be glad to go deeper on either.").
// Guarantees: non-final paragraphs are never a lone short sentence; the final
// gap/closing sentence may stand alone — that is the intended closing paragraph.
// The opening statement of intent: the sentence naming the role / why he writes.
// Kept to sentence-boundary verbs/phrases only so a paragraph break is inserted
// at an EXISTING sentence end and no wording is ever touched.
const INTENT_RE = /\b(applying for|am writing|like to be considered for|expressing my interest)\b/i;
const GAP_RES = [
  /^I have not\b/i,   // "I have not worked in ...", "I have not used ...", "I have not built ...", "I have not yet ..."
  /^I should\b/i,     // "I should flag ...", "I should be direct ..."
  /^I will be direct\b/i,
  /^To be direct\b/i,
  /^Two honest gaps\b/i,
  /^I would be glad\b/i,
  /^I would welcome\b/i,
  /^I do not hold\b/i,
  /^Redis,\s+GraphQL\b/i,
  /^Python and LangChain\b/i,
  /^My background is\b/i,
];

// Split on sentence boundaries only — a '.', '!', '?' followed by whitespace and
// a capital letter / opening quote / bracket. Never splits inside a sentence.
function splitSentences(text) {
  return text.split(/(?<=[.!?])\s+(?=[A-Z(\u201c"])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitBodyIntoParagraphs(body) {
  const sents = splitSentences(body);
  if (sents.length < 2) return [body];

  const intentIdx = sents.findIndex((s) => INTENT_RE.test(s));
  if (intentIdx < 0) {
    // No opening-statement-of-intent phrase (e.g. the note opens "This role fits
    // how I already work: ..."). Still avoid a single wall-of-text paragraph:
    // break before the closing/gap sentence if one matches, otherwise before the
    // final sentence. Existing sentence boundary only — no wording change.
    let cut = -1;
    for (let i = 1; i < sents.length; i++) {
      if (GAP_RES.some((re) => re.test(sents[i]))) { cut = i; break; }
    }
    if (cut < 0) cut = sents.length - 1;
    if (cut >= 1 && sents.length - cut >= 1) {
      const a = sents.slice(0, cut).join(' ');
      const b = sents.slice(cut).join(' ');
      if (a.trim() && b.trim()) return [a, b];
    }
    return [body];
  }

  // First break: the intent sentence closes paragraph 1. If that alone would be a
  // lone short sentence, absorb the next sentence(s) so paragraph 1 is a real
  // paragraph (at most 2 extra sentences).
  let p1End = intentIdx;
  while (p1End + 1 < sents.length &&
         (p1End === intentIdx || sents.slice(0, p1End + 1).join(' ').length < 190) &&
         p1End - intentIdx < 2) {
    p1End += 1;
  }

  // Second break: first closing/gap sentence after paragraph 1.
  let gapIdx = -1;
  for (let i = p1End + 1; i < sents.length; i++) {
    if (GAP_RES.some((re) => re.test(sents[i]))) { gapIdx = i; break; }
  }

  const paras = [sents.slice(0, p1End + 1).join(' ')];
  const gapStart = (gapIdx > p1End) ? gapIdx : sents.length;

  const mid = sents.slice(p1End + 1, gapStart);
  if (mid.length) {
    // A middle paragraph must not be a lone short sentence; merge it upward.
    if (mid.length === 1 && mid[0].length < 130) {
      paras[0] += ' ' + mid[0];
    } else {
      paras.push(mid.join(' '));
    }
  }
  if (gapStart < sents.length) {
    paras.push(sents.slice(gapStart).join(' '));
  }
  return paras.filter((p) => p.trim().length);
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