// ─────────────────────────────────────────────────────────────────────────────
// exportDocs — generates real .docx/.xlsx files client-side and saves/shares
// them. No Microsoft Graph / OneDrive integration — this is a direct-download
// export, which needs no extra Microsoft consent screen beyond the sign-in
// already in place, and works for every user regardless of which provider
// they signed in with.
//
// Native (Capacitor): writes the generated file to the app's cache dir, then
// opens the native share sheet — same pattern already used for achievement
// cards in AchievementCardModal.tsx.
// Web: triggers a normal browser download.
// ─────────────────────────────────────────────────────────────────────────────

// docx and exceljs are both heavy (the combined chunk hit 1.28MB) — imported
// dynamically inside each export function so visiting Notes/Settings/Reports
// doesn't pull either library until a user actually clicks Export.
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const EXPORT_ENABLED_KEY = 'edora_export_enabled';

export function isExportEnabled(): boolean {
  try { return localStorage.getItem(EXPORT_ENABLED_KEY) === 'true'; } catch { return false; }
}

export function setExportEnabled(enabled: boolean): void {
  try { localStorage.setItem(EXPORT_ENABLED_KEY, enabled ? 'true' : 'false'); } catch { /* ignore */ }
}

// ── Shared save/share step ───────────────────────────────────────────────────
async function saveAndShare(blob: Blob, fileName: string, shareTitle: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const base64 = await blobToBase64(blob);
    const result = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
    await Share.share({ title: shareTitle, url: result.uri, dialogTitle: 'Save or share' });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function safeFileSlug(text: string): string {
  return text.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'edora_export';
}

// ── Word export — study notes ────────────────────────────────────────────────
export interface ExportableNote {
  title: string;
  content: string;
  subject?: string | null;
  created_at: string;
}

export async function exportNoteAsWord(note: ExportableNote): Promise<void> {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import('docx');
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: note.title, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({
          children: [
            new TextRun({
              text: [note.subject, new Date(note.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })]
                .filter(Boolean).join(' · '),
              italics: true,
              color: '888888',
            }),
          ],
        }),
        new Paragraph({ text: '' }),
        ...note.content.split('\n').map(line => new Paragraph({ text: line })),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [new TextRun({ text: 'Exported from Edora', italics: true, size: 16, color: 'AAAAAA' })],
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  await saveAndShare(blob, `${safeFileSlug(note.title)}.docx`, note.title);
}

// ── Excel export — teacher progress report ───────────────────────────────────
export interface ExportableReportData {
  mastery_by_subject: Record<string, {
    mastered: number; total: number; avg_ef: number;
    weak_topics: string[]; strong_topics: string[];
  }>;
  error_patterns: { subject: string; pattern: string; frequency: number }[];
  trajectory: { direction: string; weekly_xp: number[]; trend: string };
  prediction: { predicted_score: number; predicted_grade: string } | null;
}

export async function exportReportAsExcel(data: ExportableReportData, studentName = 'Student'): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Edora';
  wb.created = new Date();

  // ── Mastery by Subject ──
  const masterySheet = wb.addWorksheet('Mastery by Subject');
  masterySheet.columns = [
    { header: 'Subject', key: 'subject', width: 20 },
    { header: 'Mastered', key: 'mastered', width: 12 },
    { header: 'Total Topics', key: 'total', width: 14 },
    { header: 'Avg Ease Factor', key: 'avg_ef', width: 16 },
    { header: 'Weak Topics', key: 'weak', width: 40 },
    { header: 'Strong Topics', key: 'strong', width: 40 },
  ];
  masterySheet.getRow(1).font = { bold: true };
  for (const [subject, m] of Object.entries(data.mastery_by_subject)) {
    masterySheet.addRow({
      subject, mastered: m.mastered, total: m.total,
      avg_ef: Math.round(m.avg_ef * 100) / 100,
      weak: m.weak_topics.join(', '),
      strong: m.strong_topics.join(', '),
    });
  }

  // ── Error Patterns ──
  const errorSheet = wb.addWorksheet('Error Patterns');
  errorSheet.columns = [
    { header: 'Subject', key: 'subject', width: 20 },
    { header: 'Pattern', key: 'pattern', width: 50 },
    { header: 'Frequency', key: 'frequency', width: 12 },
  ];
  errorSheet.getRow(1).font = { bold: true };
  for (const e of data.error_patterns) errorSheet.addRow(e);

  // ── Trajectory + prediction ──
  const summarySheet = wb.addWorksheet('Summary');
  summarySheet.columns = [{ header: '', key: 'label', width: 26 }, { header: '', key: 'value', width: 40 }];
  summarySheet.addRow({ label: 'Student', value: studentName });
  summarySheet.addRow({ label: 'Trend Direction', value: data.trajectory.direction });
  summarySheet.addRow({ label: 'Trend Summary', value: data.trajectory.trend });
  summarySheet.addRow({ label: 'Weekly XP', value: data.trajectory.weekly_xp.join(', ') });
  if (data.prediction) {
    summarySheet.addRow({ label: 'Predicted Score', value: data.prediction.predicted_score });
    summarySheet.addRow({ label: 'Predicted Grade', value: data.prediction.predicted_grade });
  }
  summarySheet.getColumn('label').font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  await saveAndShare(blob, `edora_report_${safeFileSlug(studentName)}.xlsx`, `${studentName}'s Progress Report`);
}
