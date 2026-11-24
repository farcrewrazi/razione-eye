/**
 * render-proposals.mjs — render client-facing RaziSurf proposals to A4 PDFs.
 *
 * Reads an export JSON ({ proposals: [...] }) and, for each proposal, writes a
 * cleaned, sendable PDF to <out-dir>/<proposal_pdf> (overwriting in place), and
 * a manifest with the exact cleaned markdown used for each render.
 *
 * Usage: NODE_PATH=/tmp/pdfenv/node_modules node render-proposals.mjs <export.json> <out-dir> [manifest.json]
 *
 * Layout: PDFKit, A4, Helvetica, ink #14161c, muted #5c6472, accent #1a7ba6,
 * rule #d5dbe4, body 8.9pt. Margins 52/52/44/44.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const PDFDocument = require('pdfkit');
const pdfParse = require('pdf-parse');

const INK = '#14161c';
const MUTED = '#5c6472';
const ACCENT = '#1a7ba6';
const RULE = '#d5dbe4';
const BODY = 8.9;

const MARGIN_LEFT = 52;
const MARGIN_RIGHT = 52;
const MARGIN_TOP = 44;
const MARGIN_BOTTOM = 44;
const ORPHAN_GUARD = 40;

// ---------------------------------------------------------------------------
// Editorial clean-up: strip private back-office research from the client body.
// Only removes the injected bold evidence line that sits between the section-5
// call invitation and the sign-off. Everything else is left byte-identical.
// ---------------------------------------------------------------------------

// Bold spans whose text looks like contact-hunting / organiser-profile evidence.
const PRIVATE_TOKENS = [
  'organiser profile',
  'organiser named',
  'lesgo',
  'contact page',
  'contact details',
  'contact-hunting',
];

function looksPrivate(text) {
  const t = text.toLowerCase();
  if (t.includes('@')) return true;
  if (/\+?6?0?\d[\d\s().-]{6,}\d/.test(text)) return true; // phone-ish
  if (t.includes('http')) return true;
  return PRIVATE_TOKENS.some((tok) => t.includes(tok));
}

function stripPrivateBoldLines(markdown) {
  const lines = markdown.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const s = raw.trim();
    const isBoldLine = s.startsWith('**') && s.endsWith('**') && s.length > 4;
    if (isBoldLine && looksPrivate(s)) {
      // Drop the line and collapse one immediately-preceding blank line.
      if (out.length && out[out.length - 1].trim() === '') out.pop();
      // Also collapse a following blank line to avoid a double gap.
      if (i + 1 < lines.length && lines[i + 1].trim() === '') i++;
      continue;
    }
    out.push(raw);
  }
  // Remove residual references to the third-party race portal used only for
  // back-office evidence gathering, without altering the underlying facts.
  let md = out.join('\n');
  md = md.replace(/(\d[\d,]*) events listed on Lesgo/gi, '$1 events across the season');
  return md;
}

// ---------------------------------------------------------------------------
// Inline rich-text writer: **bold** -> Helvetica-Bold, *italic* -> Helvetica-Oblique.
// Never prints the markdown markers. Returns the y after the paragraph.
// ---------------------------------------------------------------------------

const TOKEN_RE = /(\*\*[^*]+\*\*|\*[^*\n]+\*)/g;

function tokenize(text) {
  const parts = text.split(TOKEN_RE).filter((s) => s !== '' && s !== undefined);
  return parts.map((part) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return { font: 'Helvetica-Bold', text: part.slice(2, -2) };
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return { font: 'Helvetica-Oblique', text: part.slice(1, -1) };
    }
    return { font: 'Helvetica', text: part };
  });
}

function writeRich(doc, text, x, width, size, color) {
  const tokens = tokenize(text).filter((t) => t.text !== '');
  if (tokens.length === 0) return;
  tokens.forEach((tok, idx) => {
    doc.font(tok.font).fontSize(size).fillColor(color);
    const options = { continued: idx < tokens.length - 1, lineGap: 1.5, width };
    if (idx === 0) doc.text(tok.text, x, doc.y, options);
    else doc.text(tok.text, options);
  });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderOne(item, outPath, cleanedMarkdown) {
  const company = String(item.company || '').split('—')[0].split('-')[0].trim();
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT, right: MARGIN_RIGHT },
    bufferPages: true,
    info: {
      Title: `RaziSurf proposal — ${company}`,
      Author: 'RaziSurf',
      Creator: 'RaziOne Eye (Action Gate draft)',
    },
  });

  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const width = pageW - MARGIN_LEFT - MARGIN_RIGHT;
  const left = MARGIN_LEFT;
  const bottomLimit = pageH - MARGIN_BOTTOM;

  const ensureSpace = (needed) => {
    if (doc.y + needed > bottomLimit) doc.addPage();
  };

  const lines = cleanedMarkdown.split('\n');
  let firstSection = true;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');

    if (!line.trim()) { doc.moveDown(0.3); continue; }

    // Hairline rules (---): render as a thin rule, not literal.
    if (/^-{3,}$/.test(line.trim())) {
      ensureSpace(16);
      const y = doc.y + 2;
      doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.6).strokeColor(RULE).stroke();
      doc.y = y + 8;
      continue;
    }

    // Title block (# ) — reads as a document, not a list item.
    if (line.startsWith('# ')) {
      const title = line.slice(2).replace(/\*\*/g, '').replace(/\*/g, '').trim();
      doc.font('Helvetica-Bold').fontSize(18).fillColor(INK)
        .text(title, left, doc.y, { width, lineGap: 2 });
      const y = doc.y + 2.5;
      doc.moveTo(left, y).lineTo(left + 96, y).lineWidth(2).strokeColor(ACCENT).stroke();
      doc.y = y + 4;
      doc.moveDown(0.2);
      continue;
    }

    // Numbered section headings (## ) — uppercase with accent rule.
    if (line.startsWith('## ')) {
      ensureSpace(ORPHAN_GUARD);
      doc.moveDown(firstSection ? 0.3 : 0.5);
      firstSection = false;
      const heading = line.slice(3).replace(/\*\*/g, '').replace(/\*/g, '').trim().toUpperCase();
      doc.font('Helvetica-Bold').fontSize(8.6).fillColor(ACCENT)
        .text(heading, left, doc.y, { width });
      const y = doc.y + 1.5;
      doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.7).strokeColor(RULE).stroke();
      doc.y = y + 7;
      continue;
    }

    // Sub-heads (### ...) — bold, no rule.
    if (/^#{3,6}\s+/.test(line)) {
      ensureSpace(24);
      doc.moveDown(0.3);
      writeRich(doc, line.replace(/^#{3,6}\s+/, ''), left, width, 9.9, INK);
      doc.moveDown(0.08);
      continue;
    }

    // Bullets (-, *, +) with nesting support (indented sub-bullets).
    const bullet = line.match(/^(\s*)([-*+])\s+(.*)$/);
    if (bullet) {
      const indent = bullet[1].length;
      const text = bullet[3];
      const x = left + (indent >= 2 ? 24 : 0);
      const w = width - (indent >= 2 ? 24 : 0);
      ensureSpace(20);
      const y = doc.y;
      doc.circle(x + 3.4, y + 4.4, indent >= 2 ? 1.0 : 1.3).fill(indent >= 2 ? MUTED : INK);
      writeRich(doc, text, x + 13, w - 13, BODY, INK);
      doc.moveDown(0.10);
      continue;
    }

    // Link-only lines: label + URL where label IS the URL -> print once.
    // Handled naturally by writeRich (URL stays as plain text once).
    writeRich(doc, line, left, width, BODY, INK);
    doc.moveDown(0.18);
  }

  // Footer on every page: RaziSurf · razisurf.asia · page N of M
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = range.start; i < range.start + total; i++) {
    doc.switchToPage(i);
    const y = pageH - MARGIN_BOTTOM + 14;
    // Temporarily disable the bottom margin so the footer can sit in the margin
    // band without PDFKit auto-adding a blank page.
    const oldBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
      .text('RaziSurf · razisurf.asia · page ' + (i - range.start + 1) + ' of ' + total,
        left, y, { width, align: 'center', lineBreak: false });
    doc.page.margins.bottom = oldBottom;
  }

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve({ pages: total }));
    stream.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const [, , input, outDir, manifestPath] = process.argv;
if (!input || !outDir) {
  console.error('usage: node render-proposals.mjs <export.json> <out-dir> [manifest.json]');
  process.exit(2);
}
const data = JSON.parse(fs.readFileSync(input, 'utf8'));
const proposals = data.proposals || data;
fs.mkdirSync(outDir, { recursive: true });

const manifest = [];
for (const item of proposals) {
  const cleaned = stripPrivateBoldLines(item.proposal_markdown);
  const outPath = path.join(outDir, item.proposal_pdf);
  const { pages } = await renderOne(item, outPath, cleaned);

  const buf = fs.readFileSync(outPath);
  const parsed = await pdfParse(buf);
  if (parsed.numpages !== pages) {
    console.warn(`  (page count mismatch: pdfkit=${pages} parsed=${parsed.numpages})`);
  }
  const bytes = buf.length;

  manifest.push({
    action_id: item.action_id,
    proposal_pdf: item.proposal_pdf,
    markdown_cleaned: cleaned,
    pages,
    bytes,
  });
  console.log(`rendered ${item.proposal_pdf}  pages=${pages}  bytes=${bytes}`);
}

if (manifestPath) {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`manifest written: ${manifestPath} (${manifest.length} entries)`);
}