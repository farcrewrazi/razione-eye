/**
 * Import pipeline orchestrator (T1.1) — parse → normalize → dedup → persist.
 *
 * Persist: COMPANY find-or-create (by dedup-normalized name) + belongs_to +
 * hiring edges + OPPORTUNITY (status DISCOVERED, source 'import', tags ['imported']).
 * Incomplete records are flagged → stored as SIGNAL nodes (signal_type JOB_POSTING,
 * source 'import', tags ['import','flagged','incomplete']) so they stay queryable
 * and fixable later via manual entry (T1.1.6-FE). The run itself is recorded as
 * an `import_run` event carrying the full report.
 *
 * Cross-batch dedup (T1.2 idempotent re-imports): after in-batch dedup, each
 * surviving record is matched against existing OPPORTUNITY (JOB) nodes on
 * normalized company+role (same rules as dedup.ts). Matches are treated like
 * in-batch duplicates: no new node; the existing opportunity gets the
 * provenance note plus any fields the new record has that it lacks
 * (merged fields + `note_added` event), and the record is reported as a
 * duplicate with reason 'existing'.
 */
import type { Node } from '@razione-eye/shared';
import type { AppContext } from '../context.ts';
import { nowIso } from '../ulid.ts';
import { parseJson } from './parse-json.ts';
import { parseCsv } from './parse-csv.ts';
import { parseMd } from './parse-md.ts';
import { parseChat } from './parse-chat.ts';
import { normalizeRecords } from './normalize.ts';
import { dedupJobs, normalizeCompanyName, normalizeRoleTitle, normalizeSourceName, describe } from './dedup.ts';
import type {
  FileReport,
  ImportFileInput,
  ImportReportData,
  NormalizedJob,
  RawRecord,
} from './types.ts';

const KNOWN_COMPANY_NAMES = ['RaziSurf'] as const;

export function runImport(ctx: AppContext, files: ImportFileInput[]): ImportReportData {
  const { nodes, edges, events } = ctx;
  const fileReports: FileReport[] = [];

  // Per-file parse + normalize + dedup (provenance stays per-file; cross-file
  // duplicates with identical keys are handled in the persist pass below).
  const survivors: Array<{ job: NormalizedJob; file: string }> = [];
  for (const file of files) {
    let raw: RawRecord[] = [];
    let parseError: string | null = null;
    try {
      raw = parseByFormat(file.format, file.content);
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
    }

    const { jobs, flagged } = normalizeRecords(raw, file.name);
    const { kept, duplicates } = dedupJobs(jobs, file.name);
    for (const job of kept) survivors.push({ job, file: file.name });

    if (parseError) {
      flagged.push({ record: { content_preview: file.content.slice(0, 200) }, reason: `parse error: ${parseError}`, file: file.name });
    }

    fileReports.push({
      path: file.name,
      format: file.format,
      raw_records: raw.length,
      normalized: jobs.length,
      flagged,
      duplicates,
    });
  }

  // ── Cross-file dedup (same company+role+source arriving via two formats) ──
  const seen = new Map<string, { job: NormalizedJob; file: string }>();
  const crossFileDuplicates: Array<{ file: string; kept: string; dropped: string }> = [];
  for (const entry of survivors) {
    const key = keyOf(entry.job);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, entry);
      continue;
    }
    // Keep the richer of the two; the other becomes a cross-file duplicate.
    const [winner, loser, loserFile] =
      richnessOf(entry.job) >= richnessOf(existing.job)
        ? [entry, existing, existing.file]
        : [existing, entry, entry.file];
    seen.set(key, winner);
    crossFileDuplicates.push({ file: loserFile, kept: describe(winner.job), dropped: describe(loser.job) });
  }
  const dedupedSurvivors = [...seen.values()];
  for (const dup of crossFileDuplicates) {
    const report = fileReports.find((f) => f.path === dup.file);
    report?.duplicates.push({ kept: dup.kept, dropped: dup.dropped, reason: 'batch', file: dup.file });
  }

  // ── Cross-batch dedup (T1.2): match survivors against existing JOB OPPORTUNITY
  // nodes on normalized company+role. Matches are skipped (never re-created) and
  // merged into the existing node; reported as duplicates with reason 'existing'.
  const existingJobOpps = nodes
    .list({ type: 'OPPORTUNITY', opportunity_type: 'JOB', limit: 200 })
    .items.map((opp) => ({ opp, key: existingKeyOf(opp) }))
    .filter((e) => e.key !== null);
  const findExisting = (job: NormalizedJob): Node | null => {
    const companyKey = normalizeCompanyName(job.company);
    const roleKey = normalizeRoleTitle(job.role);
    for (const { opp, key } of existingJobOpps) {
      if (key!.company === companyKey && key!.role === roleKey) return opp;
    }
    return null;
  };
  /** Fields the new record may supply when the existing opportunity lacks them. */
  const MERGEABLE = ['location', 'salary', 'salary_min', 'salary_max', 'url', 'stack', 'contact'] as const;

  for (const { job, file } of dedupedSurvivors) {
    const existing = findExisting(job);
    if (!existing) continue;

    // Treat exactly like an in-batch duplicate: fold into the per-file report.
    fileReports
      .find((f) => f.path === file)
      ?.duplicates.push({ kept: existing.name ?? `${job.company} — ${job.role}`, dropped: describe(job), reason: 'existing', file });

    // Merge richer fields the existing opportunity lacks.
    const patch: Record<string, unknown> = {};
    const mergedFields: string[] = [];
    for (const field of MERGEABLE) {
      const value = job[field];
      const present = value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0);
      const lacking = existing.data[field] === undefined || existing.data[field] === null || existing.data[field] === '';
      if (present && lacking) {
        patch[field] = value;
        mergedFields.push(field);
      }
    }

    const noteText =
      `Re-imported duplicate skipped: "${describe(job)}" (from file ${file}, format ${formatOf(files, file)})` +
      (mergedFields.length > 0 ? ` — merged fields: ${mergedFields.join(', ')}` : '');
    const notes = [...existing.notes, { text: noteText, created_at: nowIso() }];
    nodes.update(existing.id, { notes, ...(Object.keys(patch).length > 0 ? { data: patch } : {}) });
    events.record({
      type: 'note_added',
      node_id: existing.id,
      summary: noteText,
      data: { file, merged_fields: mergedFields },
    });
  }
  const toCreate = dedupedSurvivors.filter(({ job }) => !findExisting(job));

  // ── Persist ──────────────────────────────────────────────────────────────
  let createdOpportunities = 0;
  let createdCompanies = 0;
  let createdEdges = 0;

  const companyIdsByKey = new Map<string, string>();
  const findOrCreateCompany = (name: string): { id: string; created: boolean } => {
    const key = normalizeCompanyName(name);
    const cached = companyIdsByKey.get(key);
    if (cached) return { id: cached, created: false };

    // Match against existing companies by normalized-name equality.
    const { items: existing } = nodes.list({ type: 'COMPANY', limit: 200 });
    for (const company of existing) {
      if (company.name && normalizeCompanyName(company.name) === key) {
        companyIdsByKey.set(key, company.id);
        return { id: company.id, created: false };
      }
    }
    const displayName = KNOWN_COMPANY_NAMES.find((n) => normalizeCompanyName(n) === key) ?? name.trim();
    const company = nodes.create({
      type: 'COMPANY',
      name: displayName,
      source: 'import',
      tags: ['imported'],
      data: {},
    });
    companyIdsByKey.set(key, company.id);
    return { id: company.id, created: true };
  };

  for (const { job, file } of toCreate) {
    const company = findOrCreateCompany(job.company);
    if (company.created) createdCompanies++;

    const notes: Array<{ text: string; created_at: string }> = (job.notes ?? []).map((text) => ({
      text,
      created_at: nowIso(),
    }));
    const fileDups = fileReports
      .flatMap((f) => f.duplicates)
      .filter((d) => d.kept === describe(job));
    if (fileDups.length > 0) {
      notes.push({
        text: `Deduped ${fileDups.length} alternate record(s): ${fileDups
          .map((d) => `"${d.dropped}"${d.file ? ` (from ${d.file})` : ''}`)
          .join(', ')}`,
        created_at: nowIso(),
      });
    }

    const opportunity = nodes.create({
      type: 'OPPORTUNITY',
      name: `${job.company} — ${job.role}`,
      status: 'DISCOVERED',
      opportunity_type: 'JOB',
      source: 'import',
      tags: ['imported'],
      notes,
      data: {
        role: job.role,
        company: job.company,
        company_id: company.id,
        ...(job.location ? { location: job.location } : {}),
        ...(job.salary ? { salary: job.salary } : {}),
        ...(job.salary_min !== undefined ? { salary_min: job.salary_min } : {}),
        ...(job.salary_max !== undefined ? { salary_max: job.salary_max } : {}),
        ...(job.url ? { url: job.url } : {}),
        ...(job.source ? { source: job.source } : {}),
        ...(job.stack ? { stack: job.stack } : {}),
        ...(job.discovered_at ? { discovered_at: job.discovered_at } : {}),
        ...(job.contact ? { contact: job.contact } : {}),
        import_file: file,
      },
    });
    createdOpportunities++;

    edges.belongsTo(opportunity.id, company.id);
    edges.hiring(company.id, opportunity.id);
    createdEdges += 2;

    events.record({
      type: 'opportunity_imported',
      node_id: opportunity.id,
      summary: `Imported "${job.role}" at ${job.company} from ${file}`,
      data: { file, company_id: company.id },
    });
  }

  // ── Flagged records → SIGNAL nodes (queryable, fixable — never guessed) ──
  for (const report of fileReports) {
    for (const flagged of report.flagged) {
      const signal = nodes.create({
        type: 'SIGNAL',
        name: `Incomplete import record (${flagged.reason})`,
        status: 'NEW',
        source: 'import',
        tags: ['import', 'flagged', 'incomplete'],
        data: {
          signal_type: 'JOB_POSTING',
          content: JSON.stringify({ record: flagged.record, reason: flagged.reason }),
          observed_at: nowIso(),
          import_file: report.path,
          flag_reason: flagged.reason,
        },
      });
      flagged.signal_id = signal.id;
      events.record({
        type: 'signal_created',
        node_id: signal.id,
        summary: `Flagged incomplete import record: ${flagged.reason}`,
        data: { file: report.path, reason: flagged.reason },
      });
    }
  }

  // ── Report ───────────────────────────────────────────────────────────────
  const report: ImportReportData = {
    ran_at: nowIso(),
    files: fileReports,
    created: { opportunities: createdOpportunities, companies: createdCompanies, edges: createdEdges },
    totals: {
      raw_records: fileReports.reduce((n, f) => n + f.raw_records, 0),
      normalized: fileReports.reduce((n, f) => n + f.normalized, 0),
      flagged: fileReports.reduce((n, f) => n + f.flagged.length, 0),
      duplicates: fileReports.reduce((n, f) => n + f.duplicates.length, 0),
    },
  };

  events.record({
    type: 'import_run',
    summary: `Import run: ${report.totals.raw_records} raw → ${createdOpportunities} created, ${report.totals.duplicates} duplicates, ${report.totals.flagged} flagged`,
    data: report as unknown as Record<string, unknown>,
  });

  return report;
}

function parseByFormat(format: ImportFileInput['format'], content: string): RawRecord[] {
  switch (format) {
    case 'json':
      return parseJson(content);
    case 'csv':
      return parseCsv(content);
    case 'md':
      return parseMd(content);
    case 'chat':
      return parseChat(content);
  }
}

function keyOf(job: NormalizedJob): string {
  return [
    normalizeCompanyName(job.company),
    normalizeRoleTitle(job.role),
    normalizeSourceName(job.source),
  ].join('|');
}

/**
 * Normalized company+role key of an existing OPPORTUNITY node (same rules as
 * dedup.ts). Source is deliberately ignored — a role re-imported from a
 * different channel is still the same opportunity. Returns null when the node
 * lacks the fields needed for a trustworthy match.
 */
function existingKeyOf(opp: Node): { company: string; role: string } | null {
  const company = (opp.data['company'] as string | undefined) ?? opp.name?.split(' — ')[0];
  const role = opp.data['role'] as string | undefined;
  if (!company || !role) return null;
  return { company: normalizeCompanyName(company), role: normalizeRoleTitle(role) };
}

function formatOf(files: ImportFileInput[], name: string): string {
  return files.find((f) => f.name === name)?.format ?? 'unknown';
}

function richnessOf(job: NormalizedJob): number {
  let score = 0;
  for (const f of [job.location, job.salary, job.salary_min, job.salary_max, job.url, job.source, job.discovered_at, job.contact]) {
    if (f !== undefined && f !== null && f !== '') score++;
  }
  if (job.stack) score += job.stack.length;
  if (job.notes) score += job.notes.length;
  return score;
}
