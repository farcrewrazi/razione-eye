/**
 * Render tailored CVs (markdown) to A4 PDFs — one file per CV.
 *
 * Usage: node render-cvs.mjs cv-export.json /path/to/out-dir
 *
 * Markdown source comes from the Action Gate payload (payload.cv_markdown),
 * which is already stripped of frontmatter, cover note and change log.
 * Layout: Helvetica, tight command-centre typography, accent section rules.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Resolve pdfkit explicitly: ESM ignores NODE_PATH for bare specifiers, so a
// `NODE_PATH=/tmp/pdfenv/node_modules node render-cvs.mjs` invocation dies with
// ERR_MODULE_NOT_FOUND even though the package is there. Walk the install dirs.
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

const BODY = 8.9;

function writeRich(doc, text, x, width, size, color) {
  // Bold (**x**), italic (*x*) and both (***x***) are REAL fonts here. The CV
  // source marks employment dates as *Jan 2020 – Present*; a renderer that only
  // strips **bold** prints those asterisks straight into the served PDF.
  const parts = text.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter((s) => s !== '');
  if (parts.length === 0) return;
  parts.forEach((part, idx) => {
    const both = part.startsWith('***') && part.endsWith('***');
    const bold = !both && part.startsWith('**') && part.endsWith('**');
    const italic = !both && !bold && part.startsWith('*') && part.endsWith('*') && part.length > 2;
    const chunk = both ? part.slice(3, -3) : bold ? part.slice(2, -2) : italic ? part.slice(1, -1) : part;
    const font = both
      ? 'Helvetica-BoldOblique'
      : bold
        ? 'Helvetica-Bold'
        : italic
          ? 'Helvetica-Oblique'
          : 'Helvetica';
    doc.font(font).fontSize(size).fillColor(color);
    const options = { continued: idx < parts.length - 1, lineGap: 1.5, width };
    if (idx === 0) doc.text(chunk, x, doc.y, options);
    else doc.text(chunk, options);
  });
}

function renderOne(item, outDir) {
  const slug = item.cv_file.replace(/\.md$/, '');
  const file = `${slug}.pdf`;
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 44, bottom: 44, left: 52, right: 52 },
    info: {
      Title: `Tailored CV — ${slug}`,
      Author: 'Fakhrur Razi Abdul Halim',
      Creator: 'RaziOne Eye (Action Gate draft)',
    },
  });
  const stream = fs.createWriteStream(path.join(outDir, file));
  doc.pipe(stream);

  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left = doc.page.margins.left;
  let firstSection = true;

  for (const rawLine of item.markdown.split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim()) {
      doc.moveDown(0.3);
      continue;
    }
    if (/^-{3,}$/.test(line.trim())) continue;

    if (line.startsWith('# ')) {
      doc.font('Helvetica-Bold').fontSize(18).fillColor(INK)
        .text(line.slice(2).trim(), left, doc.y, { width });
      doc.moveDown(0.25);
      continue;
    }

    if (line.startsWith('## ')) {
      doc.moveDown(firstSection ? 0.25 : 0.45);
      firstSection = false;
      doc.font('Helvetica-Bold').fontSize(8.6).fillColor(ACCENT)
        .text(line.slice(3).trim().toUpperCase(), left, doc.y, { width });
      const y = doc.y + 1.5;
      doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.7).strokeColor(RULE).stroke();
      doc.y = y + 7;
      continue;
    }

    // Role / project sub-headings (###) — bold, no rule, slight lift.
    if (/^#{3,6}\s+/.test(line)) {
      doc.moveDown(0.3);
      writeRich(doc, line.replace(/^#{3,6}\s+/, ''), left, width, 9.9, INK);
      doc.moveDown(0.08);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const text = line.replace(/^\s*[-*+]\s+/, '');
      const y = doc.y;
      doc.circle(left + 3.4, y + 4.4, 1.3).fill(INK);
      writeRich(doc, text, left + 13, width - 13, BODY, INK);
      doc.moveDown(0.10);
      continue;
    }

    const isContact = !line.includes('**') && (line.includes('@') || /^\+?[0-9]/.test(line));
    writeRich(doc, line, left, width, isContact ? 9 : BODY, isContact ? MUTED : INK);
    doc.moveDown(0.18);
  }

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(file));
    stream.on('error', reject);
  });
}

const [, , input, outDir] = process.argv;
if (!input || !outDir) {
  console.error('usage: node render-cvs.mjs <export.json> <out-dir>');
  process.exit(2);
}
const items = JSON.parse(fs.readFileSync(input, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const written = [];
for (const item of items) {
  written.push(await renderOne(item, outDir));
}
console.log(`rendered ${written.length} PDFs into ${outDir}`);
for (const file of written) {
  const { size } = fs.statSync(path.join(outDir, file));
  console.log(`  ${file}  ${size} bytes`);
}
