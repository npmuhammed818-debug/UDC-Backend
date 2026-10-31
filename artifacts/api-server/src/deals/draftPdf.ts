import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { UDC_DRAFT_WARNING_BOTTOM, UDC_DRAFT_WARNING_TOP } from "./draftWarning.ts";
import type { Block, DraftModel } from "./draftModel.ts";

const W = 595.28, H = 841.89, M = 51, CW = W - 2 * M;
const NAVY = rgb(0.07, 0.19, 0.35), RED = rgb(0.61, 0.11, 0.11), GREY = rgb(0.945, 0.953, 0.965), LINE = rgb(0.72, 0.75, 0.8);
// Standard PDF fonts cannot draw every Unicode character. Replace anything outside Latin-1 (plus a few punctuation marks) so a stray character can never fail the draft.
const SAFE_EXTRA = new Map<string, string>([["\u2014", "-"], ["\u2013", "-"], ["\u2018", "'"], ["\u2019", "'"], ["\u201c", '"'], ["\u201d", '"'], ["\u2022", "-"], ["\u2026", "..."], ["\u00b7", "-"]]);
const safe = (s: string) => Array.from(s.replace(/\t/g, " ")).map(c => SAFE_EXTRA.get(c) ?? (c.charCodeAt(0) <= 255 && (c.charCodeAt(0) >= 32 || c === "\n") ? c : "?")).join("");

export async function renderDraftPdf(m: DraftModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(safe(`${m.title} - ${m.ref}`)); pdf.setProducer("UDC"); pdf.setCreator("UDC");
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page!: PDFPage, y = 0;
  const pages: PDFPage[] = [];
  const newPage = () => {
    page = pdf.addPage([W, H]); pages.push(page);
    page.drawRectangle({ x: 0, y: H - 62, width: W, height: 62, color: NAVY });
    page.drawText("UDC", { x: M, y: H - 40, size: 18, font: bold, color: rgb(1, 1, 1) });
    page.drawText("Trade documentation workspace", { x: M + 50, y: H - 38, size: 8, font: reg, color: rgb(1, 1, 1) });
    const ref = safe(`Ref: ${m.ref}`); page.drawText(ref, { x: W - M - reg.widthOfTextAtSize(ref, 8), y: H - 38, size: 8, font: reg, color: rgb(1, 1, 1) });
    page.drawLine({ start: { x: M, y: 40 }, end: { x: W - M, y: 40 }, thickness: 0.5, color: LINE });
    page.drawText("UDC template - not legal advice - not executed - review with your own lawyer", { x: M, y: 28, size: 7, font: reg, color: rgb(0.33, 0.33, 0.33) });
    y = H - 82;
  };
  const wrap = (text: string, font: PDFFont, size: number, width: number) => {
    const out: string[] = [];
    for (const para of safe(text).split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) <= width) line = test;
        else { if (line) out.push(line); line = word; }
      }
      out.push(line);
    }
    return out;
  };
  const need = (h: number) => { if (y - h < 56) newPage(); };
  const text = (t: string, o: { x?: number; width?: number; font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; lead?: number; gap?: number } = {}) => {
    const font = o.font ?? reg, size = o.size ?? 8.8, lead = o.lead ?? size * 1.4, x = o.x ?? M;
    const lines = wrap(t, font, size, o.width ?? CW);
    for (const l of lines) { need(lead); y -= lead; page.drawText(l, { x, y: y + 2, size, font, color: o.color ?? rgb(0, 0, 0) }); }
    y -= o.gap ?? 2;
  };
  const warnBox = (t: string) => {
    const lines = wrap(t, bold, 8.2, CW - 14), h = lines.length * 11.5 + 10;
    need(h + 4);
    page.drawRectangle({ x: M, y: y - h, width: CW, height: h, color: rgb(0.99, 0.945, 0.945), borderColor: RED, borderWidth: 0.8 });
    let ty = y - 5; for (const l of lines) { ty -= 11.5; page.drawText(l, { x: M + 7, y: ty + 3, size: 8.2, font: bold, color: RED }); }
    y -= h + 6;
  };
  const kv = (rows: Array<[string, string]>) => {
    const LW = 135, VW = CW - LW - 12;
    for (const [label, value] of rows) {
      const vl = wrap(value, reg, 8.4, VW), ll = wrap(label, bold, 8.4, LW - 12), n = Math.max(vl.length, ll.length), h = n * 11.4 + 5;
      need(h);
      page.drawRectangle({ x: M, y: y - h, width: LW, height: h, color: GREY, borderColor: LINE, borderWidth: 0.4 });
      page.drawRectangle({ x: M + LW, y: y - h, width: CW - LW, height: h, borderColor: LINE, borderWidth: 0.4 });
      ll.forEach((l, i) => page.drawText(l, { x: M + 6, y: y - 11.2 - i * 11.4, size: 8.4, font: bold }));
      vl.forEach((l, i) => page.drawText(l, { x: M + LW + 6, y: y - 11.2 - i * 11.4, size: 8.4, font: reg }));
      y -= h;
    }
    y -= 6;
  };
  const sig = (parties: string[]) => {
    y -= 8; const h = 92; need(h + 70);
    const w = CW / parties.length;
    parties.forEach((p, i) => {
      const x = M + i * w;
      page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: LINE, borderWidth: 0.4 });
      page.drawText(safe(p), { x: x + 7, y: y - 14, size: 8.8, font: bold });
      page.drawText("Signature: ______________________________", { x: x + 7, y: y - 40, size: 8.2, font: reg });
      page.drawText("Name: [AUTHORIZED SIGNATORY]", { x: x + 7, y: y - 56, size: 8.2, font: reg });
      page.drawText("Title: [TITLE]", { x: x + 7, y: y - 68, size: 8.2, font: reg });
      page.drawText("Date: ______________________", { x: x + 7, y: y - 80, size: 8.2, font: reg });
    });
    y -= h + 8;
  };
  newPage();
  text(m.title, { font: bold, size: 15, color: NAVY, gap: 1 });
  text(m.subtitle, { size: 8.5, color: rgb(0.33, 0.33, 0.33), gap: 6 });
  warnBox(UDC_DRAFT_WARNING_TOP);
  for (const b of m.blocks as Block[]) {
    if (b.k === "h") { need(40); y -= 4; text(b.t, { font: bold, size: 9.4, color: NAVY, gap: 2 }); }
    else if (b.k === "p") text(b.t, { gap: 3 });
    else if (b.k === "kv") kv(b.rows);
    else if (b.k === "cl") {
      const lines = wrap(b.t, reg, 8.6, CW - 30), lead = 12;
      need(lead * Math.min(lines.length, 2));
      lines.forEach((l, i) => { need(lead); y -= lead; if (i === 0) page.drawText(safe(b.n), { x: M, y: y + 2, size: 8.6, font: reg }); page.drawText(l, { x: M + 30, y: y + 2, size: 8.6, font: reg }); });
      y -= 3;
    } else sig(b.parties);
  }
  warnBox(UDC_DRAFT_WARNING_BOTTOM);
  pages.forEach((p, i) => { const t = `Page ${i + 1} of ${pages.length}`; p.drawText(t, { x: W - M - reg.widthOfTextAtSize(t, 7), y: 28, size: 7, font: reg, color: rgb(0.33, 0.33, 0.33) }); });
  return pdf.save();
}
