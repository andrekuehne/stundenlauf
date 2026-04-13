/**
 * Manual inspection: parse every .xlsx under tests/data/xlsx/ (recursive) and print a plaintext report.
 *
 * Run from package root:
 *   npm run inspect:excel-fixtures
 *   npm run inspect:excel-fixtures > excel-dump.txt
 *
 * See README.md ("Manual Excel parse dump") and F-TS02 Test Plan for details.
 *
 * Uses vite-node so `@/` imports match the app. Requires Node (global Web Crypto for SHA-256).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ExcelParseError } from "@/ingestion/errors";
import { detectSourceType } from "@/ingestion/helpers";
import { parseWorkbook } from "@/ingestion/parse-workbook";
import type { ImportRowCouples, ImportRowSingles } from "@/ingestion/types";

import {
  LOCAL_XLSX_FIXTURE_ROOT,
  fixtureBasename,
  listLocalXlsxRelativePaths,
} from "../tests/ingestion/local-xlsx-fixture-discovery.ts";

const MAX_ROWS_PER_SECTION = 25;
const TRUNC = 28;
/** ASCII only so redirected logs (e.g. `> dump.txt`) stay readable if opened as Latin-1/ANSI. */
const BAR = "=".repeat(84);

function bufferFromPath(filePath: string): ArrayBuffer {
  return new Uint8Array(readFileSync(filePath)).buffer;
}

function ellipsize(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}...`;
}

function expectedKindLabel(fileName: string): string {
  return detectSourceType(fileName) === "couples" ? "Paare (Couples)" : "Einzellauf (Singles)";
}

function printSinglesRows(rows: readonly ImportRowSingles[]): void {
  const header =
    `${"Nr".padStart(4)}  ${"Start".padEnd(6)}  ${"Name".padEnd(TRUNC)}  ${"Jahrg".padEnd(5)}  ${"Verein".padEnd(TRUNC)}  ${"km".padStart(5)}  ${"Pkt".padStart(5)}`;
  console.log(header);
  console.log("-".repeat(Math.min(120, header.length + 6)));
  const show = rows.slice(0, MAX_ROWS_PER_SECTION);
  let i = 0;
  for (const r of show) {
    i += 1;
    const club = r.club ?? "-";
    console.log(
      `${String(i).padStart(4)}  ${ellipsize(r.startnr, 6).padEnd(6)}  ${ellipsize(r.name, TRUNC).padEnd(TRUNC)}  ${String(r.yob).padEnd(5)}  ${ellipsize(club, TRUNC).padEnd(TRUNC)}  ${String(r.distance_km).padStart(5)}  ${String(r.points).padStart(5)}`,
    );
  }
  if (rows.length > show.length) {
    console.log(`   ... und ${rows.length - show.length} weitere Zeilen (nicht angezeigt)`);
  }
}

function printCouplesRows(rows: readonly ImportRowCouples[]): void {
  const show = rows.slice(0, MAX_ROWS_PER_SECTION);
  let i = 0;
  for (const r of show) {
    i += 1;
    const ca = r.club_a != null ? `  Verein: ${ellipsize(r.club_a, 36)}` : "";
    const cb = r.club_b != null ? `  Verein: ${ellipsize(r.club_b, 36)}` : "";
    console.log(`   ${String(i).padStart(3)}.  Startnr. ${ellipsize(r.startnr, 10)}   ${r.distance_km} km   ${r.points} Punkte`);
    console.log(`        Läufer A: ${ellipsize(r.name_a, 44)}  (JG ${r.yob_a})${ca}`);
    console.log(`        Läufer B: ${ellipsize(r.name_b, 44)}  (JG ${r.yob_b})${cb}`);
    console.log("");
  }
  if (rows.length > show.length) {
    console.log(`   ... und ${rows.length - show.length} weitere Zeilen (nicht angezeigt)`);
  }
}

async function main(): Promise<void> {
  const files = listLocalXlsxRelativePaths();
  console.log("");
  console.log(BAR);
  console.log("  Stundenlauf - Excel-Fixtures (nur lesen, tests/data/xlsx/, rekursiv)");
  console.log(BAR);
  console.log(`  Ordner: ${LOCAL_XLSX_FIXTURE_ROOT}`);
  console.log("");

  if (files.length === 0) {
    console.log("  Keine .xlsx-Dateien gefunden.");
    console.log("  Lege Arbeitsmappen unter tests/data/xlsx/ ab (beliebige Unterordner).");
    console.log("  Hinweis: *.xlsx ist im Repo-Root .gitignore - bleibt lokal.");
    console.log("");
    process.exitCode = 0;
    return;
  }

  console.log(`  ${files.length} Datei(en) gefunden.\n`);

  let ok = 0;
  let failed = 0;

  for (const relPath of files) {
    const base = fixtureBasename(relPath);
    const absPath = join(LOCAL_XLSX_FIXTURE_ROOT, relPath);
    console.log(BAR);
    console.log(`  Datei (relativ):  ${relPath}`);
    console.log(`  Dateiname:        ${base}`);
    console.log(`  Erwartung (Name): ${expectedKindLabel(base)}`);
    console.log(BAR);
    console.log("");

    try {
      const buffer = bufferFromPath(absPath);
      const result = await parseWorkbook(buffer, relPath);
      const { meta } = result;

      const singlesRows = result.singles_sections.reduce((n, s) => n + s.rows.length, 0);
      const couplesRows = result.couples_sections.reduce((n, s) => n + s.rows.length, 0);

      console.log("  STATUS: OK");
      console.log("");
      console.log("  Zusammenfassung");
      console.log(`    - Einzel-Sektionen:    ${result.singles_sections.length}  (${singlesRows} Zeilen)`);
      console.log(`    - Paar-Sektionen:      ${result.couples_sections.length}  (${couplesRows} Zeilen)`);
      console.log(`    - Parser-Version:      ${meta.parser_version}`);
      console.log(`    - SHA-256:             ${meta.source_sha256.slice(0, 20)}...`);
      console.log(`    - importiert (UTC):    ${meta.imported_at}`);
      console.log("");

      let secIdx = 0;
      for (const sec of result.singles_sections) {
        secIdx += 1;
        const { context, rows } = sec;
        console.log(`  --- Einzel-Sektion ${secIdx} ---`);
        console.log(
          `     Lauf-Nr. ${context.race_no}   |   Dauer: ${context.duration}   |   Wertung: ${context.division}`,
        );
        console.log(`     Ergebniszeilen: ${rows.length}`);
        console.log("");
        printSinglesRows(rows);
        console.log("");
      }
      for (const sec of result.couples_sections) {
        secIdx += 1;
        const { context, rows } = sec;
        console.log(`  --- Paar-Sektion ${secIdx} ---`);
        console.log(
          `     Lauf-Nr. ${context.race_no}   |   Dauer: ${context.duration}   |   Wertung: ${context.division}`,
        );
        console.log(`     Ergebniszeilen: ${rows.length}`);
        console.log("");
        printCouplesRows(rows);
      }

      ok += 1;
    } catch (err) {
      failed += 1;
      console.log("  STATUS: FEHLER");
      console.log("");
      if (err instanceof ExcelParseError) {
        console.log("  Parser-Meldungen:");
        for (const issue of err.issues) {
          const loc = issue.location;
          console.log(
            `    [${issue.code}] Blatt "${loc.sheet}", Zeile ${loc.row}, Spalte ${loc.column} (${issue.severity})`,
          );
          console.log(`      ${issue.message_de}`);
        }
      } else {
        console.log("  Unerwarteter Fehler:", err);
      }
      console.log("");
    }
  }

  console.log(BAR);
  console.log(`  Ende - ${files.length} Datei(en), ${ok} OK, ${failed} Fehler`);
  console.log(BAR);
  console.log("");
}

await main();
