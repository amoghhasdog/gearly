/**
 * Offline replay harness: feed real OCR traces (from Tesla dashcam footage,
 * see scratchpad ocr3.py) through the app's actual SpeedFilter and
 * EngineSimulator, exactly as MainScreen wires them at runtime.
 *
 * Usage: npx tsx scripts/replay.ts <ocr_results.jsonl> <out_trace.json>
 */
import * as fs from 'fs';
import { EngineSimulator } from '../src/modules/EngineSimulator';
import { SpeedFilter } from '../src/modules/SpeedFilter';
import { parseSpeedFromText } from '../src/modules/SpeedParsing';
import { EngineState } from '../src/types/engine';
import { SpeedReading } from '../src/types/speed';

interface OcrRow {
  clip: string;
  frame: number;
  t: number;
  text: string;
  found: boolean;
}

interface TracePoint {
  t: number;
  raw: string;
  parsed: number | null;
  accepted: boolean;
  reason: string | null;
  filtered: number | null;
  stale: boolean;
  gear: number;
  rpm: number;
  shift: boolean;
}

const [, , inPath, outPath] = process.argv;
const rows: OcrRow[] = fs
  .readFileSync(inPath, 'utf-8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const clips = [...new Set(rows.map((r) => r.clip))].sort();
const traces: Record<string, TracePoint[]> = {};
const rejectionCounts: Record<string, number> = {};

for (const clip of clips) {
  const filter = new SpeedFilter();
  const sim = new EngineSimulator();
  const trace: TracePoint[] = [];
  let lastRejected = 0;

  for (const row of rows.filter((r) => r.clip === clip)) {
    const now = Math.round(row.t * 1000);
    const prevDisplayed = filter.getCurrentSpeed(now).speedMph;
    const parsed = row.text ? parseSpeedFromText(row.text, prevDisplayed) : null;
    const reading: SpeedReading = {
      rawText: row.text,
      parsedSpeed: parsed,
      timestamp: now,
      status: row.text.length === 0 ? 'no_text' : parsed == null ? 'invalid' : 'valid',
    };
    const snap = filter.update(reading, 'mph', now);
    const accepted = snap.rejectedCount === lastRejected && reading.status === 'valid';
    lastRejected = snap.rejectedCount;
    if (!accepted && snap.lastRejectionReason) {
      const key = snap.lastRejectionReason.replace(/[0-9().→/]+/g, '#').trim();
      rejectionCounts[key] = (rejectionCounts[key] ?? 0) + 1;
    }

    // Engine loop runs at 2x the OCR cadence in the app (250 ms vs 500 ms).
    let state: EngineState | null = null;
    let shift = false;
    for (const dt of [0, 250]) {
      const cur = filter.getCurrentSpeed(now + dt);
      state = sim.update({ speed: cur.speedMph, unit: 'mph', timestamp: now + dt });
      shift = shift || state.shouldTriggerShift;
    }

    trace.push({
      t: row.t,
      raw: row.text,
      parsed,
      accepted,
      reason: accepted ? null : snap.lastRejectionReason,
      filtered: snap.filteredSpeedMph == null ? null : Math.round(snap.filteredSpeedMph * 10) / 10,
      stale: snap.isStale,
      gear: state!.virtualGear,
      rpm: state!.virtualRPM,
      shift,
    });
  }
  traces[clip] = trace;
}

fs.writeFileSync(outPath, JSON.stringify(traces, null, 1));

// ---- console summary ----
for (const clip of clips) {
  const tr = traces[clip];
  const accepted = tr.filter((p) => p.accepted).length;
  const shifts = tr.filter((p) => p.shift).length;
  const maxFiltered = Math.max(...tr.map((p) => p.filtered ?? 0));
  const staleFrac = tr.filter((p) => p.stale).length / tr.length;
  console.log(
    `${clip}: ${tr.length} frames, ${accepted} accepted, max ${maxFiltered.toFixed(0)} mph, ` +
      `${shifts} shifts, stale ${(staleFrac * 100).toFixed(0)}%`
  );
  const line = tr
    .map((p) => (p.accepted ? String(Math.round(p.filtered!)) : p.raw ? 'x' : '.'))
    .join(' ');
  console.log(`  ${line}`);
}
console.log('\nRejection reasons:', rejectionCounts);
