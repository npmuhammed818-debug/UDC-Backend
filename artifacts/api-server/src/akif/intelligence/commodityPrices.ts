// Commodity reference prices from the World Bank Commodity Price Data ("Pink
// Sheet"), a free public monthly XLSX. No API key, no spend. The answers are
// monthly world reference prices only - never an executable deal quote, and
// the limitations always say so. The file is fetched whole, parsed with a
// minimal ZIP/XLSX reader (no new dependency), and cached for 24 hours.
import { inflateRawSync } from "node:zlib";

const PINKSHEET_PAGE = "https://www.worldbank.org/en/research/commodity-markets";
// Pinned fallback when the page HTML changes shape. Refreshed editions keep
// the same layout; the row "Updated on" tells the customer how fresh it is.
const PINKSHEET_FALLBACK_XLSX =
  "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx";
const MAX_PAGE_BYTES = 3_000_000;
const MAX_XLSX_BYTES = 8_000_000;
const CACHE_TTL_MS = 24 * 60 * 60_000;

type CachedBytes = { expires: number; bytes: Buffer; retrievedAt: string };
const byteCache = new Map<string, CachedBytes>();

async function readLimitedBody(response: Response, maxBytes: number, prefix: string): Promise<Buffer> {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw new Error(`${prefix}_response_too_large`);
  }
  if (!response.body) throw new Error(`${prefix}_invalid_response`);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error(`${prefix}_response_too_large`);
      }
      chunks.push(Buffer.from(chunk.value));
    }
    return Buffer.concat(chunks);
  } finally {
    reader.releaseLock();
  }
}

async function getBytes(url: string, maxBytes: number, prefix: string) {
  const hit = byteCache.get(url);
  if (hit && hit.expires > Date.now()) return { bytes: hit.bytes, retrievedAt: hit.retrievedAt };
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000), redirect: "error" });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`${prefix}_http_${response.status}`);
  }
  const bytes = await readLimitedBody(response, maxBytes, prefix);
  const entry = { expires: Date.now() + CACHE_TTL_MS, bytes, retrievedAt: new Date().toISOString() };
  byteCache.set(url, entry);
  if (byteCache.size > 4) byteCache.delete(byteCache.keys().next().value!);
  return { bytes: entry.bytes, retrievedAt: entry.retrievedAt };
}

// ---- Minimal XLSX reader (ZIP central directory + sheet XML) ----

type ZipEntry = { name: string; method: number; compressed: number; offset: number };

function readZipEntries(buf: Buffer): ZipEntry[] {
  // End of central directory: signature PK\x05\x06, scanned from the tail.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_536); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("xlsx_invalid_zip");
  const count = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error("xlsx_invalid_zip");
    const method = buf.readUInt16LE(pos + 10);
    const compressed = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const offset = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");
    entries.push({ name, method, compressed, offset });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readZipEntry(buf: Buffer, entry: ZipEntry): Buffer {
  const at = entry.offset;
  if (buf.readUInt32LE(at) !== 0x04034b50) throw new Error("xlsx_invalid_zip");
  const nameLen = buf.readUInt16LE(at + 26);
  const extraLen = buf.readUInt16LE(at + 28);
  const data = buf.subarray(at + 30 + nameLen + extraLen, at + 30 + nameLen + extraLen + entry.compressed);
  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) return inflateRawSync(data);
  throw new Error("xlsx_unsupported_compression");
}

function loadEntryText(buf: Buffer, name: string): string {
  const entry = readZipEntries(buf).find((e) => e.name === name);
  if (!entry) throw new Error("xlsx_entry_missing");
  return readZipEntry(buf, entry).toString("utf8");
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function sharedStrings(xml: string): string[] {
  const out: string[] = [];
  const si = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = si.exec(xml))) {
    const parts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((p) => decodeXml(p[1]));
    out.push(parts.join(""));
  }
  return out;
}

const COL_RE = /^([A-Z]+)(\d+)$/;
function colNumber(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

type SheetRow = Map<number, string>; // column number -> raw value (shared strings resolved)

function sheetRows(xml: string, strings: string[]): SheetRow[] {
  const rows: SheetRow[] = [];
  const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const cells: SheetRow = new Map();
    const cellRe = /<c r="([A-Z]+\d+)"([^>]*)>(?:<v>([^<]*)<\/v>)?/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rm[2]))) {
      const ref = COL_RE.exec(cm[1]);
      if (!ref || cm[3] === undefined) continue;
      const isShared = /\bt="s"/.test(cm[2]);
      const value = isShared ? strings[Number(cm[3])] ?? "" : cm[3];
      cells.set(colNumber(ref[1]), value);
    }
    rows[Number(rm[1])] = cells;
  }
  return rows;
}

export type PinkSheetTable = {
  updatedOn: string;
  // column number -> { name, unit }
  columns: Map<number, { name: string; unit: string }>;
  // newest-first rows of [yyyymm, Map<colNumber, number>]
  dataRows: { period: string; values: Map<number, number> }[];
};

export function parsePinkSheet(xlsx: Buffer): PinkSheetTable {
  const workbook = loadEntryText(xlsx, "xl/workbook.xml");
  const rels = loadEntryText(xlsx, "xl/_rels/workbook.xml.rels");
  const sheetMatch = /<sheet name="Monthly Prices"[^>]*r:id="(rId\d+)"/.exec(workbook);
  if (!sheetMatch) throw new Error("xlsx_sheet_missing");
  const relMatch = new RegExp(`Id="${sheetMatch[1]}"[^>]*Target="([^"]+)"`).exec(rels)
    ?? new RegExp(`Target="([^"]+)"[^>]*Id="${sheetMatch[1]}"`).exec(rels);
  if (!relMatch) throw new Error("xlsx_sheet_missing");
  const target = relMatch[1].startsWith("xl/") ? relMatch[1] : `xl/${relMatch[1]}`;
  const strings = sharedStrings(loadEntryText(xlsx, "xl/sharedStrings.xml"));
  const rows = sheetRows(loadEntryText(xlsx, target), strings);

  const updatedOn = /Updated on (.+)/.exec(rows[4]?.get(1) ?? "")?.[1]?.trim() ?? "unknown";
  const names = rows[5];
  const units = rows[6];
  if (!names || !units) throw new Error("xlsx_header_missing");
  const columns = new Map<number, { name: string; unit: string }>();
  for (const [col, name] of names) {
    if (col === 1 || !name.trim()) continue;
    columns.set(col, { name: name.trim(), unit: (units.get(col) ?? "").replace(/[()]/g, "").trim() });
  }
  const dataRows: PinkSheetTable["dataRows"] = [];
  for (let r = 7; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const period = row.get(1) ?? "";
    if (!/^\d{4}M\d{2}$/.test(period)) continue;
    const values = new Map<number, number>();
    for (const [col, raw] of row) {
      if (col === 1) continue;
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) values.set(col, n);
    }
    dataRows.push({ period, values });
  }
  dataRows.reverse(); // newest first
  if (!columns.size || !dataRows.length) throw new Error("xlsx_empty");
  return { updatedOn, columns, dataRows };
}

// ---- Commodity aliases -> Pink Sheet column names (exact, trimmed) ----

const SERIES: Record<string, string> = {
  sugar: "Sugar, world",
  "world sugar": "Sugar, world",
  rice: "Rice, Thai 5%",
  "thai rice": "Rice, Thai 5%",
  "vietnam rice": "Rice, Viet Namese 5%",
  wheat: "Wheat, US SRW",
  coffee: "Coffee, Arabica",
  "arabica coffee": "Coffee, Arabica",
  "robusta coffee": "Coffee, Robusta",
  robusta: "Coffee, Robusta",
  tea: "Tea, avg 3 auctions",
  cocoa: "Cocoa",
  "palm oil": "Palm oil",
  "coconut oil": "Coconut oil",
  "soybean oil": "Soybean oil",
  "sunflower oil": "Sunflower oil",
  "rapeseed oil": "Rapeseed oil",
  "groundnut oil": "Groundnut oil **",
  groundnuts: "Groundnuts",
  soybeans: "Soybeans",
  "soybean meal": "Soybean meal",
  maize: "Maize",
  corn: "Maize",
  barley: "Barley",
  sorghum: "Sorghum",
  cotton: "Cotton, A Index",
  rubber: "Rubber, TSR20 **",
  "natural rubber": "Rubber, TSR20 **",
  banana: "Banana, US",
  orange: "Orange",
  beef: "Beef **",
  chicken: "Chicken **",
  shrimp: "Shrimps, Mexican",
  shrimps: "Shrimps, Mexican",
  urea: "Urea",
  dap: "DAP",
  tsp: "TSP",
  "potassium chloride": "Potassium chloride **",
  "phosphate rock": "Phosphate rock",
  aluminum: "Aluminum",
  aluminium: "Aluminum",
  copper: "Copper",
  lead: "Lead",
  tin: "Tin",
  nickel: "Nickel",
  zinc: "Zinc",
  "iron ore": "Iron ore, cfr spot",
  gold: "Gold",
  silver: "Silver",
  platinum: "Platinum",
  "crude oil": "Crude oil, average",
  "brent crude": "Crude oil, Brent",
  brent: "Crude oil, Brent",
  "natural gas": "Natural gas, US",
  coal: "Coal, Australian",
  plywood: "Plywood",
  "fish meal": "Fish meal",
  logs: "Logs, Malaysian",
  sawnwood: "Sawnwood, Malaysian",
  tobacco: "Tobacco, US import u.v.",
};

export function resolveCommoditySeries(text: string): string | null {
  const lowered = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ")} `;
  // Longest alias first so "palm oil" wins over a bare "oil" never matching.
  const aliases = Object.keys(SERIES).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    if (lowered.includes(` ${alias} `)) return SERIES[alias];
  }
  return null;
}

const PRICE_QUESTION = /\b(price|prices|rate|rates|cost|market value|how much)\b/i;

export function commodityReferenceQuery(text: string): string | null {
  if (text.length > 400 || !PRICE_QUESTION.test(text)) return null;
  return resolveCommoditySeries(text);
}

export type CommodityReference = {
  provider: "world_bank_pink_sheet";
  sourceUrl: string;
  retrievedAt: string;
  updatedOn: string;
  series: string;
  unit: string;
  period: string;
  price: number;
  previousPeriod: string | null;
  previousPrice: number | null;
  yearAgoPeriod: string | null;
  yearAgoPrice: number | null;
  limitations: string[];
};

export async function getCommodityReference(seriesName: string): Promise<CommodityReference> {
  let sourceUrl = PINKSHEET_FALLBACK_XLSX;
  try {
    const page = await getBytes(PINKSHEET_PAGE, MAX_PAGE_BYTES, "pinkpage");
    const href = /https:\/\/thedocs\.worldbank\.org\/[^"'\s]*CMO-Historical-Data-Monthly\.xlsx/
      .exec(page.bytes.toString("utf8"))?.[0];
    if (href) sourceUrl = href;
  } catch { /* Pinned fallback URL keeps the feature alive. */ }
  const file = await getBytes(sourceUrl, MAX_XLSX_BYTES, "pinkxlsx");
  const table = parsePinkSheet(file.bytes);
  const column = [...table.columns.entries()].find(([, c]) => c.name === seriesName)?.[0];
  if (column === undefined) throw new Error("pink_series_missing");
  const latest = table.dataRows.find((row) => row.values.has(column));
  if (!latest) throw new Error("pink_series_empty");
  const idx = table.dataRows.indexOf(latest);
  const previous = table.dataRows.slice(idx + 1).find((row) => row.values.has(column)) ?? null;
  const yearAgo = table.dataRows.slice(idx + 1).find((row) => {
    if (!row.values.has(column)) return false;
    const [y, m] = [Number(latest.period.slice(0, 4)), Number(latest.period.slice(5))];
    const [ry, rm] = [Number(row.period.slice(0, 4)), Number(row.period.slice(5))];
    return (y - ry) * 12 + (m - rm) >= 11; // closest to a full year back
  }) ?? null;
  const meta = table.columns.get(column)!;
  return {
    provider: "world_bank_pink_sheet",
    sourceUrl,
    retrievedAt: file.retrievedAt,
    updatedOn: table.updatedOn,
    series: meta.name,
    unit: meta.unit,
    period: latest.period,
    price: latest.values.get(column)!,
    previousPeriod: previous?.period ?? null,
    previousPrice: previous?.values.get(column) ?? null,
    yearAgoPeriod: yearAgo?.period ?? null,
    yearAgoPrice: yearAgo?.values.get(column) ?? null,
    limitations: [
      "Monthly world reference price from the World Bank Pink Sheet; not a live or executable deal quote.",
      "Actual contract prices differ by grade, quantity, port, Incoterm and timing.",
    ],
  };
}

function fmtPeriod(period: string): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const m = Number(period.slice(5)) - 1;
  return `${months[m] ?? period.slice(5)} ${period.slice(0, 4)}`;
}

function fmtPrice(value: number): string {
  return value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
}

/** Short, deterministic customer answer. Numbers never pass through a model. */
export function commodityReferenceAnswer(ref: CommodityReference): string {
  const unit = ref.unit.replace(/^\$\//, "USD per ").replace("mt", "metric ton").replace("kg", "kg");
  const trend = ref.previousPrice !== null
    ? ref.price > ref.previousPrice ? "up" : ref.price < ref.previousPrice ? "down" : "flat"
    : null;
  const trendText = trend && trend !== "flat"
    ? ` It was ${fmtPrice(ref.previousPrice!)} in ${fmtPeriod(ref.previousPeriod!)}, so it moved ${trend}.`
    : "";
  return (
    `World Bank reference: ${ref.series} averaged about ${fmtPrice(ref.price)} ${unit} in ${fmtPeriod(ref.period)}.${trendText} ` +
    `This is a monthly world reference price (updated ${ref.updatedOn}), not a live deal quote - real contract prices differ by grade, quantity, port and Incoterm.`
  );
}
