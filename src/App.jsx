// App.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { toJpeg, toPng } from 'html-to-image';
import PptxGenJS from 'pptxgenjs';
import './App.css';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function snapHalf(n) {
  return Math.round(n * 2) / 2;
}

function clampHalf(n, min, max) {
  return snapHalf(clamp(n, min, max));
}

function deepClone(obj) {
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

function safeUUID() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch { }
  return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function useResizeObserver(targetRef) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const w = entries?.[0]?.contentRect?.width ?? 0;
      setWidth(w);
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [targetRef]);

  return width;
}

function autoRowHeight(rowCount) {
  if (rowCount > 40) return 24;
  if (rowCount > 32) return 28;
  if (rowCount > 24) return 32;
  if (rowCount > 18) return 38;
  if (rowCount > 12) return 46;
  return 54;
}

function deriveSizing(rowHeightPx) {
  const barHeightPx = clamp(Math.round(rowHeightPx * 0.42), 10, 22);
  const headerHeightPx = clamp(Math.round(rowHeightPx * 0.85), 28, 44);
  const labelFontPx = clamp(Math.round(rowHeightPx * 0.34), 10, 16);
  const labelPadYPx = clamp(Math.round(rowHeightPx * 0.18), 5, 12);
  const milestoneFontPx = clamp(Math.round(rowHeightPx * 0.46), 14, 22);

  const phaseHeightPx = clamp(Math.round(rowHeightPx * 0.75), 28, 48);
  const phaseFontPx = clamp(Math.round(rowHeightPx * 0.36), 12, 18);

  return {
    rowHeightPx,
    barHeightPx,
    headerHeightPx,
    labelFontPx,
    labelPadYPx,
    milestoneFontPx,
    phaseHeightPx,
    phaseFontPx,
  };
}

function swapRows(arr, i, j) {
  const a = [...arr];
  const tmp = a[i];
  a[i] = a[j];
  a[j] = tmp;
  return a;
}

// 0.5 week grid helpers (2 columns per week)
function weekToTick(weekVal) {
  return Math.round((weekVal - 1) * 2) + 1;
}

function fmtWeek(n) {
  const x = Number(n);
  if (Number.isInteger(x)) return String(x);
  return String(x);
}

// -------------------- STARTER --------------------
const starterRows = [
  {
    id: safeUUID(),
    kind: 'task',
    label: 'Ramp and Discovery',
    items: [{ id: safeUUID(), type: 'discovery', start: 1, end: 2 }],
  },
  {
    id: safeUUID(),
    kind: 'task',
    label: 'Sales Cloud',
    items: [{ id: safeUUID(), type: 'bar', start: 2, end: 5 }],
  },
];

// -------------------- IMPORT SANITIZATION --------------------
function sanitizeImportedModel(raw) {
  const fallback = {
    weeksCount: 20,
    rows: deepClone(starterRows),
    rowHeightMode: 'auto',
    manualRowHeight: 42,

    // ✅ NEW (Bar Thickness)
    barHeightMode: 'auto', // auto | manual
    manualBarHeight: 18,
  };

  if (!raw || typeof raw !== 'object') return fallback;

  const weeksCount = clamp(
    Number(raw.weeksCount || fallback.weeksCount),
    1,
    200
  );

  const rowHeightMode =
    raw.rowHeightMode === 'manual' || raw.rowHeightMode === 'auto'
      ? raw.rowHeightMode
      : 'auto';

  const manualRowHeight = clamp(
    Number(raw.manualRowHeight || fallback.manualRowHeight),
    18,
    64
  );

  // ✅ NEW (Bar Thickness)
  const barHeightMode =
    raw.barHeightMode === 'manual' || raw.barHeightMode === 'auto'
      ? raw.barHeightMode
      : 'auto';

  const manualBarHeight = clamp(
    Number(raw.manualBarHeight ?? fallback.manualBarHeight),
    6,
    60
  );

  const rowsRaw = Array.isArray(raw.rows) ? raw.rows : fallback.rows;

  const rows = rowsRaw.filter(Boolean).map((r) => {
    const rowId = typeof r.id === 'string' && r.id ? r.id : safeUUID();
    const label =
      typeof r.label === 'string' && r.label.trim()
        ? r.label.trim()
        : 'Untitled';

    const kind = r.kind === 'phase' || r.kind === 'task' ? r.kind : 'task';

    if (kind === 'phase') return { id: rowId, kind: 'phase', label };

    const itemsRaw = Array.isArray(r.items) ? r.items : [];
    const items = itemsRaw.filter(Boolean).map((it) => {
      const id = typeof it.id === 'string' && it.id ? it.id : safeUUID();

      const type =
        it.type === 'bar' || it.type === 'milestone' || it.type === 'discovery'
          ? it.type
          : 'bar';

      if (type === 'milestone') {
        const week = clamp(Number(it.week || 1), 1, weeksCount);
        return { id, type, week: Math.round(week) };
      }

      const s = clampHalf(Number(it.start || 1), 1, weeksCount);
      const e = clampHalf(Number(it.end || s), 1, weeksCount);
      const start = Math.min(s, e);
      const end = Math.max(s, e);
      return { id, type, start, end };
    });

    return { id: rowId, kind: 'task', label, items };
  });

  return {
    weeksCount,
    rows: rows.length ? rows : deepClone(starterRows),
    rowHeightMode,
    manualRowHeight,

    // ✅ NEW (Bar Thickness)
    barHeightMode,
    manualBarHeight,
  };
}

// -------------------- EXPORT HELPERS --------------------
function downloadTextFile(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function downloadDataUrl(filename, dataUrl) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function timestampStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_` +
    `${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

function makeExportFilename(ext) {
  return `timeline_${timestampStamp()}.${ext}`;
}

// -------------------- NEW: PPTX SAFE WRITER (prevents corrupt downloads) --------------------
const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

function normalizeBase64(maybeBase64) {
  let s = String(maybeBase64 || '').trim();
  if (s.startsWith('data:')) {
    const commaIdx = s.indexOf(',');
    if (commaIdx >= 0) s = s.slice(commaIdx + 1);
  }
  return s.replace(/\s+/g, '');
}

function base64ToUint8Array(maybeBase64) {
  const b64 = normalizeBase64(maybeBase64);
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function looksLikeZip(u8) {
  // ZIP files start with "PK" (0x50, 0x4B)
  return u8 && u8.length >= 2 && u8[0] === 0x50 && u8[1] === 0x4b;
}

async function isBlobZip(blob) {
  try {
    const ab = await blob.slice(0, 2).arrayBuffer();
    const u8 = new Uint8Array(ab);
    return looksLikeZip(u8);
  } catch {
    return false;
  }
}

async function pptxToBlobSafe(pptx) {
  // 1) Try blob
  try {
    const out = await pptx.write('blob');
    if (out instanceof Blob && out.size > 1000 && (await isBlobZip(out))) {
      return out;
    }
  } catch {
    // ignore, fallback below
  }

  // 2) Try arraybuffer (some builds return ArrayBuffer / Uint8Array / string)
  try {
    const out = await pptx.write('arraybuffer');

    if (out instanceof ArrayBuffer) {
      const u8 = new Uint8Array(out);
      if (!looksLikeZip(u8)) throw new Error('arraybuffer not ZIP');
      return new Blob([u8], { type: PPTX_MIME });
    }

    if (out instanceof Uint8Array) {
      if (!looksLikeZip(out)) throw new Error('uint8array not ZIP');
      return new Blob([out], { type: PPTX_MIME });
    }

    if (typeof out === 'string') {
      const u8 = base64ToUint8Array(out);
      if (!looksLikeZip(u8)) throw new Error('string not ZIP');
      return new Blob([u8], { type: PPTX_MIME });
    }
  } catch {
    // ignore, fallback below
  }

  // 3) Final fallback: base64
  const b64 = await pptx.write('base64');
  const u8 = base64ToUint8Array(b64);
  if (!looksLikeZip(u8)) {
    throw new Error(
      'PPTX generation failed: output is not a valid PPTX (ZIP).'
    );
  }
  return new Blob([u8], { type: PPTX_MIME });
}

// -------------------- NEW: TOTAL COST → PPT TABLE HELPERS --------------------
function moneyToNumber(s) {
  // accepts: 28k, 28000, $28,000.00, $ 28k
  const clean = String(s || '')
    .toLowerCase()
    .replace(/[$,]/g, '')
    .replace(/\s+/g, '')
    .trim();
  if (!clean) return NaN;
  if (clean.endsWith('k')) {
    const num = Number(clean.slice(0, -1));
    return Number.isFinite(num) ? num * 1000 : NaN;
  }
  const num = Number(clean);
  return Number.isFinite(num) ? num : NaN;
}

function fmtUSD(n) {
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// function parseTotalCostLines(text) {
//   const lines = String(text || '')
//     .split('\n')
//     .map((l) => l.trim())
//     .filter(Boolean);

//   const rows = [];

//   for (const line of lines) {
//     // Common format: Label - $ 28k - (note...)
//     // We intentionally keep implementation as: label + " " + notePart (if present)
//     const parts = line.split(' - ').map((p) => p.trim());

//     // fallback: if user used "-" without spaces
//     const parts2 =
//       parts.length >= 2 ? parts : line.split('-').map((p) => p.trim());

//     if (parts2.length < 2) continue;

//     const label = parts2[0] || 'Untitled';
//     const costRaw = parts2[1] || '';
//     const note = parts2.slice(2).join(' - ').trim();

//     const costNum = moneyToNumber(costRaw);
//     const costFmt = Number.isFinite(costNum) ? fmtUSD(costNum) : costRaw;

//     const implementation = note ? `${label} ${note}` : label;

//     rows.push({
//       implementation,
//       costNum: Number.isFinite(costNum) ? costNum : 0,
//       costFmt: costFmt || '',
//     });
//   }

//   return rows;
// }

function parseTotalCostLines(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const rows = [];

  for (const line of lines) {
    // Preferred format:
    // Label - $ 28k - (note...)
    // But we also support lines WITHOUT cost: "Data migration"
    const parts = line.split(' - ').map((p) => p.trim());

    // fallback: if user used "-" without spaces
    const parts2 =
      parts.length >= 2 ? parts : line.split('-').map((p) => p.trim());

    // Case A: looks like it has a "label - cost ..." pattern
    if (parts2.length >= 2) {
      const label = parts2[0] || 'Untitled';
      const costRaw = parts2[1] || '';
      const note = parts2.slice(2).join(' - ').trim();

      const costNum = moneyToNumber(costRaw);
      const hasValidCost = Number.isFinite(costNum);

      const costFmt = hasValidCost ? fmtUSD(costNum) : (costRaw ? costRaw : '');

      // Implementation text: include note in the first column if present
      const implementation = note ? `${label} ${note}` : label;

      rows.push({
        implementation,
        costNum: hasValidCost ? costNum : 0,
        costFmt: costFmt, // blank if no cost
      });

      continue;
    }

    // Case B: plain line (no dash pattern) → still include it, cost blank
    rows.push({
      implementation: line,
      costNum: 0,
      costFmt: '',
    });
  }

  return rows;
}


async function exportTotalCostTablePptx(pastedText) {
  const items = parseTotalCostLines(pastedText);

  if (!items.length) {
    alert('Paste at least 1 line like: Service - $ 28k - (note)');
    return;
  }

  const total = items.reduce(
    (sum, r) => sum + (Number.isFinite(r.costNum) ? r.costNum : 0),
    0
  );

  // Colors similar to your reference slide
  const HEADER_BLUE = '2F60B7';
  const LINE_BLUE = '9BB7F0';
  const TITLE_BLUE = '1F3F8B';

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';

  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };

  // Title
  slide.addText('Total Project Cost and Timeline', {
    x: 0.6,
    y: 0.35,
    w: 12.2,
    h: 0.5,
    fontFace: 'Calibri',
    fontSize: 28,
    bold: true,
    color: TITLE_BLUE,
  });

  // thin line under title
  slide.addShape(pptx.ShapeType.line, {
    x: 0.6,
    y: 0.95,
    w: 1.2,
    h: 0,
    line: { color: HEADER_BLUE, width: 2 },
  });

  // Build table rows (3 columns). Timeline column intentionally blank.
  const tableRows = [];

  // Header row
  tableRows.push([
    {
      text: 'Project Implementation',
      options: {
        bold: true,
        color: 'FFFFFF',
        fill: HEADER_BLUE,
        align: 'center',
      },
    },
    {
      text: 'Cost',
      options: { bold: true, color: 'FFFFFF', fill: HEADER_BLUE, align: 'center' },
    },
    {
      text: 'Timeline',
      options: {
        bold: true,
        color: 'FFFFFF',
        fill: HEADER_BLUE,
        align: 'center',
      },
    },
  ]);

  // Body rows
  for (const r of items) {
    tableRows.push([
      { text: r.implementation, options: { align: 'left', fill: 'FFFFFF' } },
      { text: r.costFmt, options: { align: 'center', fill: 'FFFFFF' } },
      { text: '', options: { align: 'center', fill: 'FFFFFF' } }, // blank timeline
    ]);
  }

  // Total row
  tableRows.push([
    {
      text: 'Net Total Investment (Fixed Cost)',
      options: { bold: true, align: 'center', fill: 'FFFFFF' },
    },
    { text: fmtUSD(total), options: { bold: true, align: 'center', fill: 'FFFFFF' } },
    { text: '', options: { bold: true, align: 'center', fill: 'FFFFFF' } },
  ]);

  // Add as native PPT table
  slide.addTable(tableRows, {
    x: 0.6,
    y: 1.25,
    w: 12.2,
    colW: [7.4, 2.2, 2.6],
    border: { type: 'solid', color: LINE_BLUE, pt: 1 },
    fontFace: 'Calibri',
    fontSize: 14,
    color: '0F172A',
    valign: 'mid',
    rowH: 0.46,
  });

  // ✅ IMPORTANT: download ONLY a valid PPTX zip
  try {
    const blob = await pptxToBlobSafe(pptx);
    downloadBlob(
      `Total_Project_Cost_and_Timeline_${timestampStamp()}.pptx`,
      blob
    );
  } catch (e) {
    console.error(e);
    alert(
      'PPT export failed: the generated file was not a valid PPTX.\n\nFix: Update pptxgenjs and restart.\n\nRun:\n  npm i pptxgenjs@latest\n  npm run dev'
    );
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildTotalCostHtmlTable(pastedText) {
  const items = parseTotalCostLines(pastedText);

  // Build a simple HTML table that PPT usually converts to an editable table
  const header = `
    <tr>
      <th style="background:#2F60B7;color:#fff;font-weight:700;padding:8px;border:1px solid #9BB7F0;text-align:center;">
        Project Implementation
      </th>
      <th style="background:#2F60B7;color:#fff;font-weight:700;padding:8px;border:1px solid #9BB7F0;text-align:center;">
        Cost
      </th>
      <th style="background:#2F60B7;color:#fff;font-weight:700;padding:8px;border:1px solid #9BB7F0;text-align:center;">
        Timeline
      </th>
    </tr>
  `;

  const body = items
    .map(
      (r) => `
    <tr>
      <td style="padding:8px;border:1px solid #9BB7F0;text-align:left;">
        ${escapeHtml(r.implementation)}
      </td>
      <td style="padding:8px;border:1px solid #9BB7F0;text-align:center;white-space:nowrap;">
        ${escapeHtml(r.costFmt || '')}
      </td>
      <td style="padding:8px;border:1px solid #9BB7F0;text-align:center;">
        ${''}
      </td>
    </tr>
  `
    )
    .join('');

  // Optional total row (matches your PPTX)
  const total = items.reduce(
    (sum, r) => sum + (Number.isFinite(r.costNum) ? r.costNum : 0),
    0
  );

  const totalRow = `
    <tr>
      <td style="padding:8px;border:1px solid #9BB7F0;text-align:center;font-weight:700;">
        Net Total Investment (Fixed Cost)
      </td>
      <td style="padding:8px;border:1px solid #9BB7F0;text-align:center;font-weight:700;white-space:nowrap;">
        ${escapeHtml(fmtUSD(total))}
      </td>
      <td style="padding:8px;border:1px solid #9BB7F0;text-align:center;font-weight:700;">
        ${''}
      </td>
    </tr>
  `;

  // Wrap in a minimal HTML doc fragment
  const html = `
    <table cellspacing="0" cellpadding="0"
      style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:12pt;width:100%;">
      ${header}
      ${body}
      ${totalRow}
    </table>
  `;

  // Plain text fallback (tab-separated)
  const plain =
    [
      ['Project Implementation', 'Cost', 'Timeline'].join('\t'),
      ...items.map((r) => [r.implementation, r.costFmt || '', ''].join('\t')),
      ['Net Total Investment (Fixed Cost)', fmtUSD(total), ''].join('\t'),
    ].join('\n') + '\n';

  return { html, plain, count: items.length };
}

async function copyTotalCostTableToClipboard(pastedText) {
  const { html, plain, count } = buildTotalCostHtmlTable(pastedText);

  if (!count) {
    alert('Paste at least 1 line first.');
    return;
  }

  // Best: write HTML + text/plain (PowerPoint can use HTML)
  try {
    if (navigator.clipboard?.write && window.ClipboardItem) {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      alert('Copied! Now paste into PowerPoint (Ctrl+V).');
      return;
    }
  } catch (e) {
    // fall through to plain text
    console.warn('HTML clipboard write failed:', e);
  }

  // Fallback: plain text (will paste as text / may become a table depending on PPT)
  try {
    await navigator.clipboard.writeText(plain);
    alert(
      'Copied as text fallback. Paste into PowerPoint. If it doesn’t become a table, use Paste Special → Text/HTML options.'
    );
  } catch (e) {
    console.error(e);
    alert(
      'Clipboard copy blocked by browser permissions. Use the PPTX download button instead.'
    );
  }
}

function extractRowLabelFromLine(line) {
  const s = String(line || '').trim();
  if (!s) return '';

  // prefer " - " split
  const parts = s.split(' - ').map((p) => p.trim());
  if (parts.length >= 2 && parts[0]) return parts[0];

  // fallback "-" split
  const parts2 = s.split('-').map((p) => p.trim()).filter(Boolean);
  if (parts2.length >= 2 && parts2[0]) return parts2[0];

  // no dash pattern → whole line is label
  return s;
}

function extractRowLabelsFromTotalCostText(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const labels = [];
  for (const line of lines) {
    const label = extractRowLabelFromLine(line);
    if (label) labels.push(label);
  }
  return labels;
}





export default function App() {
  const [model, setModel] = useState({
    weeksCount: 20,
    rows: starterRows,
    rowHeightMode: 'auto',
    manualRowHeight: 42,

    // ✅ NEW (Bar Thickness)
    barHeightMode: 'auto', // auto | manual
    manualBarHeight: 18,
  });

  const modelRef = useRef(model);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  // Undo/redo
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);

  function pushHistory(prevSnapshot) {
    setPast((p) => [...p, prevSnapshot]);
    setFuture([]);
  }

  function commit(updaterFn) {
    const prev = deepClone(modelRef.current);
    const next = updaterFn(deepClone(modelRef.current));
    pushHistory(prev);
    setModel(next);
  }

  function undo() {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [deepClone(modelRef.current), ...f]);
      setModel(deepClone(prev));
      return p.slice(0, -1);
    });
  }

  function redo() {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast((p) => [...p, deepClone(modelRef.current)]);
      setModel(deepClone(next));
      return f.slice(1);
    });
  }

  // UI state
  const [newTaskLabel, setNewTaskLabel] = useState('');
  const [newPhaseLabel, setNewPhaseLabel] = useState('Phase-1');

  const rows = model.rows;
  const weeksCount = model.weeksCount;

  const [rowPickerOpen, setRowPickerOpen] = useState(false);

  const taskRowOptions = useMemo(() => {
    return rows
      .filter((r) => r.kind === 'task')
      .map((r) => ({ id: r.id, label: r.label }));
  }, [rows]);

  useEffect(() => {
    function onDocDown(e) {
      const el = e.target;
      if (!el) return;
      if (el.closest?.('.rowPickerWrap')) return;
      setRowPickerOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, []);


  const taskRowsOnly = useMemo(
    () => rows.filter((r) => r.kind !== 'phase'),
    [rows]
  );

  const [selectedRowId, setSelectedRowId] = useState(
    starterRows.find((r) => r.kind !== 'phase')?.id ?? ''
  );

  const [barStart, setBarStart] = useState(2);
  const [barEnd, setBarEnd] = useState(6);

  const [discoveryStart, setDiscoveryStart] = useState(1);
  const [discoveryEnd, setDiscoveryEnd] = useState(2);

  // Composer mode (Bar / Discovery)
  const [composerType, setComposerType] = useState('bar'); // bar | discovery

  // Interactive state
  const [interactiveOn, setInteractiveOn] = useState(false);
  const [interactiveMode, setInteractiveMode] = useState('edit'); // edit | swap
  const [selectedItem, setSelectedItem] = useState(null); // {rowId,itemId}
  const [swapFirstRowId, setSwapFirstRowId] = useState(null);

  // drag state
  const dragRef = useRef(null);
  const dragStartSnapshotRef = useRef(null);
  const dragChangedRef = useRef(false);

  // weeks + ticks
  const weeks = useMemo(
    () => Array.from({ length: weeksCount }, (_, i) => i + 1),
    [weeksCount]
  );
  const ticksCount = weeksCount * 2;

  function addTotalCostItemsAsTimelineRows() {
    const labels = extractRowLabelsFromTotalCostText(totalCostText);

    if (!labels.length) {
      alert('Paste at least 1 line first.');
      return;
    }

    commit((m) => {
      const existing = new Set(
        (m.rows || [])
          .filter((r) => r?.kind === 'task' && r?.label)
          .map((r) => String(r.label).trim().toLowerCase())
      );

      const newRows = [];
      for (const label of labels) {
        const key = label.trim().toLowerCase();
        if (!key || existing.has(key)) continue;
        existing.add(key);

        newRows.push({
          id: safeUUID(),
          kind: 'task',
          label: label.trim(),
          items: [],
        });
      }

      if (newRows.length === 0) return m;

      m.rows = [...m.rows, ...newRows];
      return m;
    });
  }


  // timeline wrap ref (for sizing + export)
  const timelineWrapElRef = useRef(null);
  const containerWidth = useResizeObserver(timelineWrapElRef);

  const leftColPx = 280;
  const availablePx = Math.max(0, containerWidth - leftColPx);
  const weekColPx = weeksCount > 0 ? availablePx / weeksCount : 0;
  const halfColPx = weekColPx / 2 || 1;

  const autoH = useMemo(() => autoRowHeight(rows.length), [rows.length]);
  const rowHeightPx =
    model.rowHeightMode === 'manual' ? model.manualRowHeight : autoH;

  const sizing = useMemo(() => deriveSizing(rowHeightPx), [rowHeightPx]);

  // ✅ NEW: effective bar thickness (independent from row height)
  const maxBar = Math.max(6, Math.round(rowHeightPx * 0.9)); // keep within row
  const effectiveBarHeight =
    model.barHeightMode === 'manual'
      ? clamp(Number(model.manualBarHeight || 0), 6, maxBar)
      : sizing.barHeightPx;

  // keep selectedRow task
  useEffect(() => {
    if (!selectedRowId) {
      setSelectedRowId(taskRowsOnly[0]?.id ?? '');
      return;
    }
    const found = taskRowsOnly.some((r) => r.id === selectedRowId);
    if (!found) setSelectedRowId(taskRowsOnly[0]?.id ?? '');
  }, [selectedRowId, taskRowsOnly]);

  const selectedRow = useMemo(
    () => rows.find((r) => r.id === selectedRowId),
    [rows, selectedRowId]
  );

  function addTaskRow() {
    const label = newTaskLabel.trim();
    if (!label) return;

    commit((m) => {
      const id = safeUUID();
      m.rows = [...m.rows, { id, kind: 'task', label, items: [] }];
      return m;
    });

    setNewTaskLabel('');
  }

  function addPhaseRow() {
    const label = newPhaseLabel.trim();
    if (!label) return;

    commit((m) => {
      const id = safeUUID();
      m.rows = [...m.rows, { id, kind: 'phase', label }];
      return m;
    });

    const match = newPhaseLabel.trim().match(/^phase[-\s]*(\d+)$/i);
    if (match) {
      const n = Number(match[1] || 0);
      if (!Number.isNaN(n) && n >= 1) setNewPhaseLabel(`Phase-${n + 1}`);
    }
  }

  function deleteRow(id) {
    commit((m) => {
      m.rows = m.rows.filter((r) => r.id !== id);
      return m;
    });

    if (selectedRowId === id) {
      const next = taskRowsOnly.find((r) => r.id !== id)?.id ?? '';
      setSelectedRowId(next);
    }
    if (swapFirstRowId === id) setSwapFirstRowId(null);
  }

  function addBar() {
    if (!selectedRowId) return;
    const row = rows.find((r) => r.id === selectedRowId);
    if (!row || row.kind === 'phase') return;

    commit((m) => {
      const s = clampHalf(Number(barStart), 1, m.weeksCount);
      const e = clampHalf(Number(barEnd), 1, m.weeksCount);
      const start = Math.min(s, e);
      const end = Math.max(s, e);

      const item = { id: safeUUID(), type: 'bar', start, end };

      m.rows = m.rows.map((r) =>
        r.id === selectedRowId ? { ...r, items: [...(r.items || []), item] } : r
      );
      return m;
    });
  }

  function addDiscoveryRange() {
    if (!selectedRowId) return;
    const row = rows.find((r) => r.id === selectedRowId);
    if (!row || row.kind === 'phase') return;

    commit((m) => {
      const s = clampHalf(Number(discoveryStart), 1, m.weeksCount);
      const e = clampHalf(Number(discoveryEnd), 1, m.weeksCount);
      const start = Math.min(s, e);
      const end = Math.max(s, e);

      const item = { id: safeUUID(), type: 'discovery', start, end };

      m.rows = m.rows.map((r) =>
        r.id === selectedRowId ? { ...r, items: [...(r.items || []), item] } : r
      );
      return m;
    });
  }

  function removeItem(rowId, itemId) {
    commit((m) => {
      m.rows = m.rows.map((r) =>
        r.id === rowId
          ? { ...r, items: (r.items || []).filter((it) => it.id !== itemId) }
          : r
      );
      return m;
    });
    if (selectedItem?.rowId === rowId && selectedItem?.itemId === itemId) {
      setSelectedItem(null);
    }
  }

  // ---------- Swap mode ----------
  function handleRowClickForSwap(rowId) {
    if (!interactiveOn || interactiveMode !== 'swap') return;

    if (!swapFirstRowId) {
      setSwapFirstRowId(rowId);
      return;
    }

    if (swapFirstRowId === rowId) {
      setSwapFirstRowId(null);
      return;
    }

    const firstIdx = rows.findIndex((r) => r.id === swapFirstRowId);
    const secondIdx = rows.findIndex((r) => r.id === rowId);
    if (firstIdx < 0 || secondIdx < 0) {
      setSwapFirstRowId(null);
      return;
    }

    commit((m) => {
      m.rows = swapRows(m.rows, firstIdx, secondIdx);
      return m;
    });

    setSwapFirstRowId(null);
  }

  // -------- Interactive: Dragging (Edit mode) --------
  function startItemDrag(e, rowId, item, action) {
    if (!interactiveOn || interactiveMode !== 'edit') return;

    e.preventDefault();
    e.stopPropagation();

    setSelectedItem({ rowId, itemId: item.id });

    dragStartSnapshotRef.current = deepClone(modelRef.current);
    dragChangedRef.current = false;

    dragRef.current = {
      type: item.type, // bar | milestone | discovery
      action,
      rowId,
      itemId: item.id,
      startX: e.clientX,
      orig: deepClone(item),
      halfColPx: halfColPx || 1,
    };

    window.addEventListener('pointermove', onGlobalPointerMove);
    window.addEventListener('pointerup', onGlobalPointerUp, { once: true });
  }

  function onGlobalPointerMove(e) {
    const d = dragRef.current;
    if (!d) return;

    const dx = e.clientX - d.startX;
    const deltaHalfSteps = Math.round(dx / d.halfColPx); // 1 = 0.5 week
    const deltaWeeks = deltaHalfSteps * 0.5;

    if (deltaHalfSteps === 0 && !dragChangedRef.current) return;
    dragChangedRef.current = true;

    setModel((prev) => {
      const m = deepClone(prev);
      const row = m.rows.find((r) => r.id === d.rowId);
      if (!row || row.kind === 'phase') return prev;

      const idx = (row.items || []).findIndex((it) => it.id === d.itemId);
      if (idx < 0) return prev;

      const it = row.items[idx];

      if (d.type === 'milestone') {
        const newWeek = clamp(
          Math.round(d.orig.week + deltaWeeks),
          1,
          m.weeksCount
        );
        row.items[idx] = { ...it, week: newWeek };
        return m;
      }

      const origStart = d.orig.start;
      const origEnd = d.orig.end;
      const length = origEnd - origStart;

      if (d.action === 'move') {
        const maxStart = m.weeksCount - length;
        const newStart = clampHalf(origStart + deltaWeeks, 1, maxStart);
        row.items[idx] = {
          ...it,
          start: newStart,
          end: snapHalf(newStart + length),
        };
        return m;
      }

      if (d.action === 'resize-left') {
        const newStart = clampHalf(origStart + deltaWeeks, 1, origEnd);
        row.items[idx] = { ...it, start: newStart };
        return m;
      }

      if (d.action === 'resize-right') {
        const newEnd = clampHalf(origEnd + deltaWeeks, origStart, m.weeksCount);
        row.items[idx] = { ...it, end: newEnd };
        return m;
      }

      return m;
    });
  }

  function onGlobalPointerUp() {
    window.removeEventListener('pointermove', onGlobalPointerMove);

    if (!dragChangedRef.current) {
      dragRef.current = null;
      dragStartSnapshotRef.current = null;
      return;
    }

    const startSnap = dragStartSnapshotRef.current;
    if (startSnap) {
      setPast((p) => [...p, startSnap]);
      setFuture([]);
    }

    dragRef.current = null;
    dragStartSnapshotRef.current = null;
    dragChangedRef.current = false;
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e) {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

      if (ctrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
      }

      if (ctrlOrCmd && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (ctrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        redo();
        return;
      }

      if (e.key === 'Escape') {
        setSwapFirstRowId(null);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------
  // Export / Import JSON
  // ---------------------------
  const importFileRef = useRef(null);

  function exportJson() {
    const payload = {
      app: 'LRT Timeline Generator',
      formatVersion: 4,
      exportedAt: new Date().toISOString(),
      model: modelRef.current,
    };
    const text = JSON.stringify(payload, null, 2);
    downloadTextFile(makeExportFilename('json'), text, 'application/json');
  }

  function importJsonText(text) {
    try {
      const parsed = JSON.parse(text);
      const maybeModel = parsed?.model ? parsed.model : parsed;
      const sanitized = sanitizeImportedModel(maybeModel);

      setPast([]);
      setFuture([]);
      setInteractiveOn(false);
      setInteractiveMode('edit');
      setSwapFirstRowId(null);
      setSelectedItem(null);

      setModel(sanitized);

      const firstTask = sanitized.rows.find((r) => r.kind !== 'phase');
      setSelectedRowId(firstTask?.id ?? '');
      setBarStart(2);
      setBarEnd(6);
      setDiscoveryStart(1);
      setDiscoveryEnd(2);
      setComposerType('bar');
    } catch {
      alert('Invalid JSON file. Please export from the app and try again.');
    }
  }

  function handleImportFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      importJsonText(String(reader.result || ''));
      e.target.value = '';
    };
    reader.onerror = () => {
      alert('Could not read the file. Please try again.');
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  // ---------------------------
  // Export PNG / JPG
  // ---------------------------
  const [exporting, setExporting] = useState(false);

  async function exportImage(type) {
    const el = timelineWrapElRef.current;
    if (!el) return;

    try {
      setExporting(true);
      await new Promise((r) => setTimeout(r, 50));

      const opts = {
        cacheBust: true,
        backgroundColor: '#ffffff',
        pixelRatio: 2,
      };

      if (type === 'png') {
        const dataUrl = await toPng(el, opts);
        downloadDataUrl(makeExportFilename('png'), dataUrl);
      } else {
        const dataUrl = await toJpeg(el, { ...opts, quality: 0.95 });
        downloadDataUrl(makeExportFilename('jpg'), dataUrl);
      }
    } catch (err) {
      console.error(err);
      alert('Could not export image. Try again or use browser screenshot.');
    } finally {
      setExporting(false);
    }
  }

  // Derived values for the composer inputs
  const composerStart = composerType === 'bar' ? barStart : discoveryStart;
  const composerEnd = composerType === 'bar' ? barEnd : discoveryEnd;

  function setComposerStart(v) {
    if (composerType === 'bar') setBarStart(v);
    else setDiscoveryStart(v);
  }

  function setComposerEnd(v) {
    if (composerType === 'bar') setBarEnd(v);
    else setDiscoveryEnd(v);
  }

  function addComposerItem() {
    if (composerType === 'bar') addBar();
    else addDiscoveryRange();
  }

  // ✅ NEW: Total Cost paste box state (does not affect any existing features)
  const [totalCostText, setTotalCostText] = useState(
    `Service - $ 28k - (including DS-160 process creation)
Experience cloud - $ 42k
Shield - $ 9k
myUSCIS via MuleSoft - $ 25k
iManage via AppExchange + APIs - $ 30k
Outlook via MuleSoft - $ 7k
FLAG via MuleSoft - $ 34k`
  );

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="title">Timeline Generator (MVP)</div>
          <div className="subtitle">
            Now supports <b>0.5-week</b> movement in Interactive Edit mode.
          </div>
        </div>
      </div>

{/* Controls */}
<div className="controls">
  {/* ✅ Card#1: Total Cost → PPT Table */}
  <div className="card">
    <div className="cardTitle">1) Total Cost → PPT Table</div>

    <div className="hint" style={{ marginBottom: 8 }}>
      Paste lines like: <b>Service - $ 28k - (note)</b>. Timeline column will be
      blank.
    </div>

    <textarea
      className="costTextarea"
      rows={9}
      value={totalCostText}
      onChange={(e) => setTotalCostText(e.target.value)}
      spellCheck={false}
    />

    <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
      <button
        className="btn btnSmall btnSmallWide"
        onClick={() => exportTotalCostTablePptx(totalCostText)}
        type="button"
        title="Downloads a PPTX with a native PowerPoint table (editable)"
      >
        Download PPT Slide
      </button>

      <button
        className="btnSecondary btnSmall btnSmallWide"
        onClick={() => copyTotalCostTableToClipboard(totalCostText)}
        type="button"
        title="Copies an HTML table so you can paste into PowerPoint as an editable table"
      >
        Copy Table to Clipboard
      </button>

      <button
        className="btnSecondary btnSmall btnSmallWide"
        onClick={addTotalCostItemsAsTimelineRows}
        type="button"
        title="Adds each pasted implementation as a timeline row (skips duplicates)"
      >
        Add These as Timeline Rows
      </button>

      <div className="hint" style={{ alignSelf: 'center' }}>
        Open PPTX → copy the table → paste into your proposal deck.
      </div>
    </div>
  </div>

  {/* ✅ Card#2: Weeks */}
  <div className="card">
    <div className="cardTitle">2) Weeks</div>
    <div className="row">
      <label className="label">Number of weeks</label>
      <input
        className="input"
        type="number"
        min={1}
        max={200}
        value={model.weeksCount}
        onChange={(e) =>
          commit((m) => {
            m.weeksCount = clamp(Number(e.target.value || 1), 1, 200);
            // clamp items
            m.rows = m.rows.map((r) => {
              if (r.kind === 'phase') return r;
              const items = (r.items || []).map((it) => {
                if (it.type === 'milestone') {
                  return { ...it, week: clamp(it.week, 1, m.weeksCount) };
                }
                return {
                  ...it,
                  start: clampHalf(it.start, 1, m.weeksCount),
                  end: clampHalf(it.end, 1, m.weeksCount),
                };
              });
              return { ...r, items };
            });
            return m;
          })
        }
      />
      <div className="hint">(Columns squeeze to fit width)</div>
    </div>

    <div className="hint">
      Column width ≈ <b>{weekColPx.toFixed(1)}px</b> per week. (Half-step ≈{' '}
      <b>{halfColPx.toFixed(1)}px</b>)
    </div>
  </div>

  {/* ✅ Card#3: Rows & Phases */}
  <div className="card">
    <div className="cardTitle">3) Rows & Phases</div>

    <div className="row">
      <label className="label">Add row label</label>

      <div className="rowPickerWrap">
        <input
          className="input"
          value={newTaskLabel}
          placeholder="Type to add, or click to pick…"
          onChange={(e) => {
            setNewTaskLabel(e.target.value);
            setRowPickerOpen(true);
          }}
          onFocus={() => setRowPickerOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addTaskRow();
            if (e.key === 'Escape') setRowPickerOpen(false);
          }}
          onClick={() => setRowPickerOpen(true)}
        />

        {rowPickerOpen && (
          <div className="rowPickerMenu">
            {taskRowOptions.length === 0 ? (
              <div className="rowPickerEmpty">No rows yet.</div>
            ) : (
              taskRowOptions
                .filter((opt) =>
                  newTaskLabel.trim()
                    ? opt.label
                        .toLowerCase()
                        .includes(newTaskLabel.trim().toLowerCase())
                    : true
                )
                .map((opt) => (
                  <div
                    key={opt.id}
                    className="rowPickerItem"
                    onClick={() => {
                      setNewTaskLabel(opt.label);
                      setRowPickerOpen(false);
                    }}
                    title="Click to load this label"
                  >
                    <span className="rowPickerLabel">{opt.label}</span>

                    <button
                      className="rowPickerDel"
                      type="button"
                      title="Delete this row"
                      onClick={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        deleteRow(opt.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))
            )}
          </div>
        )}
      </div>

      <button className="btn" onClick={addTaskRow}>
        Add Row
      </button>
    </div>

    <div className="row">
      <label className="label">Add phase</label>
      <input
        className="input"
        value={newPhaseLabel}
        placeholder="Phase-1"
        onChange={(e) => setNewPhaseLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') addPhaseRow();
        }}
      />
      <button className="btnSecondary" onClick={addPhaseRow}>
        Add Phase
      </button>
    </div>

    <div className="hint" style={{ marginTop: 8 }}>
      Total rows (including phases): <b>{rows.length}</b>
    </div>
  </div>

  {/* ✅ Card#4: Add Bars / Discovery */}
  <div className="card">
    <div className="cardTitle">4) Add Bars / Discovery</div>

    <div className="lineItemComposer">
      <select
        className="lineItemSelect"
        value={selectedRowId}
        onChange={(e) => setSelectedRowId(e.target.value)}
        disabled={taskRowsOnly.length === 0}
        title="Row"
      >
        {taskRowsOnly.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>

      <div className="pillGroup" title="Type">
        <button
          className={composerType === 'bar' ? 'pillBtn pillBtnOn' : 'pillBtn'}
          onClick={() => setComposerType('bar')}
          type="button"
        >
          Bar
        </button>
        <button
          className={
            composerType === 'discovery' ? 'pillBtn pillBtnOn' : 'pillBtn'
          }
          onClick={() => setComposerType('discovery')}
          type="button"
        >
          Discovery
        </button>
      </div>

      <div className="inlineField">
        <span className="inlineFieldLabel">Start Week</span>
        <input
          className="inlineInput"
          type="number"
          min={1}
          max={weeksCount}
          step={0.5}
          value={composerStart}
          onChange={(e) => setComposerStart(e.target.value)}
        />
      </div>

      <div className="inlineField">
        <span className="inlineFieldLabel">End Week</span>
        <input
          className="inlineInput"
          type="number"
          min={1}
          max={weeksCount}
          step={0.5}
          value={composerEnd}
          onChange={(e) => setComposerEnd(e.target.value)}
        />
      </div>

      <button
        className="btn"
        onClick={addComposerItem}
        disabled={taskRowsOnly.length === 0}
        type="button"
        title={composerType === 'bar' ? 'Add Bar' : 'Add Discovery'}
      >
        {composerType === 'bar' ? 'Add Bar' : 'Add Discovery'}
      </button>
    </div>
  </div>
</div>


      {/* Timeline Tools */}
      <div className="timelineTools">
        <div className="toolTitleRow">
          <div className="toolTitle">Timeline Controls</div>

          <div className="toolActions">
            <button
              className="toolBtn"
              onClick={exportJson}
              title="Download .json"
            >
              Export JSON
            </button>

            <button
              className="toolBtn"
              onClick={() => importFileRef.current?.click()}
              title="Load a previously exported .json"
            >
              Import JSON
            </button>

            <input
              ref={importFileRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={handleImportFileChange}
            />

            <button
              className="toolBtn"
              onClick={() => exportImage('png')}
              disabled={exporting}
              title="Download PNG"
            >
              {exporting ? 'Exporting…' : 'Export PNG'}
            </button>

            <button
              className="toolBtn"
              onClick={() => exportImage('jpg')}
              disabled={exporting}
              title="Download JPG"
            >
              {exporting ? 'Exporting…' : 'Export JPG'}
            </button>

            <button
              className="toolBtn"
              onClick={undo}
              disabled={past.length === 0}
              title="Undo (Ctrl/Cmd+Z)"
            >
              Undo
            </button>

            <button
              className="toolBtn"
              onClick={redo}
              disabled={future.length === 0}
              title="Redo (Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z)"
            >
              Redo
            </button>

            <button
              className={interactiveOn ? 'toolBtn toolBtnOn' : 'toolBtn'}
              onClick={() => {
                setInteractiveOn((v) => !v);
                setSelectedItem(null);
                setSwapFirstRowId(null);
                setInteractiveMode('edit');
              }}
              title="Enable bar edit + row swap"
            >
              {interactiveOn ? 'Interactive: ON' : 'Make it Interactive'}
            </button>
          </div>
        </div>

        <div className="toolGrid2">
          {/* LEFT: Row Height */}
          <div className="toolGroup">
            <div className="toolRow">
              <label className="toolLabel">Row Height</label>
              <select
                className="toolSelect"
                value={model.rowHeightMode}
                onChange={(e) =>
                  commit((m) => {
                    m.rowHeightMode = e.target.value;
                    if (m.rowHeightMode === 'manual' && !m.manualRowHeight) {
                      m.manualRowHeight = autoH;
                    }
                    return m;
                  })
                }
              >
                <option value="auto">Auto</option>
                <option value="manual">Manual</option>
              </select>

              <button
                className="toolBtn"
                onClick={() =>
                  commit((m) => {
                    m.rowHeightMode = 'auto';
                    return m;
                  })
                }
                title="Switch back to auto sizing"
              >
                Reset to Auto
              </button>

              <div className="toolHint">
                Current: <b>{sizing.rowHeightPx}px</b> (Auto suggestion: {autoH}
                px)
              </div>
            </div>

            <div className="toolRow">
              <label className="toolLabel">Adjust</label>
              <input
                className="toolSlider"
                type="range"
                min={18}
                max={64}
                value={model.manualRowHeight}
                onChange={(e) =>
                  commit((m) => {
                    m.rowHeightMode = 'manual';
                    m.manualRowHeight = Number(e.target.value);
                    return m;
                  })
                }
              />
              <div className="toolValue">{model.manualRowHeight}px</div>
            </div>
          </div>

          {/* RIGHT: Bar Size */}
          <div className="toolGroup">
            <div className="toolRow">
              <label className="toolLabel">Bar Size</label>
              <select
                className="toolSelect"
                value={model.barHeightMode}
                onChange={(e) =>
                  commit((m) => {
                    m.barHeightMode = e.target.value;
                    return m;
                  })
                }
              >
                <option value="auto">Auto</option>
                <option value="manual">Manual</option>
              </select>

              <button
                className="toolBtn"
                onClick={() =>
                  commit((m) => {
                    m.barHeightMode = 'auto';
                    return m;
                  })
                }
                title="Switch bar sizing back to auto"
              >
                Reset to Auto
              </button>

              <div className="toolHint">
                Current: <b>{effectiveBarHeight}px</b>
                {model.barHeightMode === 'auto' ? ' (Auto)' : ' (Manual)'}
              </div>
            </div>

            <div className="toolRow">
              <label className="toolLabel">Adjust</label>
              <input
                className="toolSlider"
                type="range"
                min={6}
                max={maxBar}
                value={model.manualBarHeight}
                onChange={(e) =>
                  commit((m) => {
                    m.barHeightMode = 'manual';
                    m.manualBarHeight = Number(e.target.value);
                    return m;
                  })
                }
                disabled={model.barHeightMode !== 'manual'}
              />
              <div className="toolValue">{model.manualBarHeight}px</div>
            </div>
          </div>
        </div>

        {interactiveOn && (
          <div className="interactiveModeRow">
            <div className="hint">
              Mode:{' '}
              <b>
                {interactiveMode === 'edit'
                  ? 'Edit Bars (0.5 steps)'
                  : 'Swap Rows'}
              </b>
              {interactiveMode === 'swap' && (
                <>
                  {' '}
                  —{' '}
                  {swapFirstRowId
                    ? `Selected row: ${rows.find((r) => r.id === swapFirstRowId)?.label ?? '—'
                    }. Click another row to swap. (Esc to cancel)`
                    : 'Click a row, then click another row to swap.'}
                </>
              )}
            </div>

            <div className="segmented">
              <button
                className={
                  interactiveMode === 'edit' ? 'segBtn segBtnOn' : 'segBtn'
                }
                onClick={() => {
                  setInteractiveMode('edit');
                  setSwapFirstRowId(null);
                }}
              >
                Edit Bars
              </button>
              <button
                className={
                  interactiveMode === 'swap' ? 'segBtn segBtnOn' : 'segBtn'
                }
                onClick={() => {
                  setInteractiveMode('swap');
                  setSelectedItem(null);
                }}
              >
                Swap Rows
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Timeline (exports as PNG/JPG) */}
      <div className="timelineWrap" ref={timelineWrapElRef}>
        <div
          className="timeline"
          style={{
            ['--leftColPx']: `${leftColPx}px`,
            ['--ticksCount']: ticksCount,
            ['--weekColPx']: `${weekColPx}px`,
            ['--rowHeightPx']: `${sizing.rowHeightPx}px`,
            // ✅ NEW: use effective bar height
            ['--barHeightPx']: `${effectiveBarHeight}px`,
            ['--headerHeightPx']: `${sizing.headerHeightPx}px`,
            ['--labelFontPx']: `${sizing.labelFontPx}px`,
            ['--labelPadYPx']: `${sizing.labelPadYPx}px`,
            ['--milestoneFontPx']: `${sizing.milestoneFontPx}px`,
            ['--phaseHeightPx']: `${sizing.phaseHeightPx}px`,
            ['--phaseFontPx']: `${sizing.phaseFontPx}px`,
          }}
        >
          {/* Header */}
          <div className="cell cellHeader cellLeft stickyLeft stickyTop">
            Weeks
          </div>

          <div className="weeksHeader stickyTop">
            {weeks.map((w) => {
              const startTick = (w - 1) * 2 + 1;
              const endTick = startTick + 2;
              return (
                <div
                  key={w}
                  className="weekHeaderSpan"
                  style={{ gridColumn: `${startTick} / ${endTick}` }}
                  title={`Week ${w}`}
                >
                  {w}
                </div>
              );
            })}
          </div>

          {/* Rows + Phase Bands */}
          {rows.map((row) => {
            if (row.kind === 'phase') {
              const isSwapSelected = swapFirstRowId === row.id;
              return (
                <div
                  key={row.id}
                  className={[
                    'phaseBand',
                    interactiveOn && interactiveMode === 'swap'
                      ? 'rowClickable'
                      : '',
                    isSwapSelected ? 'rowSwapSelected' : '',
                  ].join(' ')}
                  onClick={() => handleRowClickForSwap(row.id)}
                >
                  {row.label}
                </div>
              );
            }

            const swapSelected = swapFirstRowId === row.id;

            return (
              <div key={row.id} className="rowGroup">
                <div
                  className={[
                    'cell',
                    'cellLeft',
                    'stickyLeft',
                    'rowLabel',
                    interactiveOn && interactiveMode === 'swap'
                      ? 'rowClickable'
                      : '',
                    swapSelected ? 'rowSwapSelected' : '',
                  ].join(' ')}
                  onClick={() => handleRowClickForSwap(row.id)}
                >
                  <span className="rowLabelText">{row.label}</span>
                </div>

                <div className="rowGrid">
                  {Array.from({ length: ticksCount }, (_, i) => {
                    const tick = i + 1;
                    const boundary = tick % 2 === 0;
                    return (
                      <div
                        key={tick}
                        className={
                          boundary ? 'gridCell gridCellBoundary' : 'gridCell'
                        }
                      />
                    );
                  })}

                  <div className="itemsLayer">
                    {(row.items || []).map((it) => {
                      const isSelected =
                        selectedItem?.rowId === row.id &&
                        selectedItem?.itemId === it.id;

                      if (it.type === 'discovery') {
                        const s = weekToTick(it.start);
                        const e = weekToTick(it.end);
                        return (
                          <div
                            key={it.id}
                            className={
                              isSelected
                                ? 'discoverySpan discoverySelected'
                                : 'discoverySpan'
                            }
                            style={{ gridColumn: `${s} / ${e + 2}` }}
                            title={
                              interactiveOn && interactiveMode === 'edit'
                                ? `Discovery: drag to move, edges to resize (${fmtWeek(
                                  it.start
                                )}-${fmtWeek(it.end)})`
                                : `Discovery: Weeks ${fmtWeek(
                                  it.start
                                )}-${fmtWeek(it.end)} (click to remove)`
                            }
                            onClick={() => {
                              if (!interactiveOn) removeItem(row.id, it.id);
                              else if (interactiveMode === 'edit')
                                setSelectedItem({
                                  rowId: row.id,
                                  itemId: it.id,
                                });
                            }}
                            onPointerDown={(e2) => {
                              if (!interactiveOn || interactiveMode !== 'edit')
                                return;
                              startItemDrag(e2, row.id, it, 'move');
                            }}
                          >
                            <div className="discoveryStar">★</div>

                            {interactiveOn && interactiveMode === 'edit' && (
                              <>
                                <div
                                  className="barHandle left"
                                  onPointerDown={(e2) =>
                                    startItemDrag(e2, row.id, it, 'resize-left')
                                  }
                                />
                                <div
                                  className="barHandle right"
                                  onPointerDown={(e2) =>
                                    startItemDrag(
                                      e2,
                                      row.id,
                                      it,
                                      'resize-right'
                                    )
                                  }
                                />
                              </>
                            )}
                          </div>
                        );
                      }

                      if (it.type === 'bar') {
                        const s = weekToTick(it.start);
                        const e = weekToTick(it.end);
                        return (
                          <div
                            key={it.id}
                            className={isSelected ? 'bar barSelected' : 'bar'}
                            style={{ gridColumn: `${s} / ${e + 2}` }}
                            title={
                              interactiveOn && interactiveMode === 'edit'
                                ? `Drag (0.5 steps). Resize edges. (${fmtWeek(
                                  it.start
                                )}-${fmtWeek(it.end)})`
                                : `Bar: Weeks ${fmtWeek(it.start)}-${fmtWeek(
                                  it.end
                                )} (click to remove)`
                            }
                            onClick={() => {
                              if (!interactiveOn) removeItem(row.id, it.id);
                              else if (interactiveMode === 'edit')
                                setSelectedItem({
                                  rowId: row.id,
                                  itemId: it.id,
                                });
                            }}
                            onPointerDown={(e2) => {
                              if (!interactiveOn || interactiveMode !== 'edit')
                                return;
                              startItemDrag(e2, row.id, it, 'move');
                            }}
                          >
                            {interactiveOn && interactiveMode === 'edit' && (
                              <>
                                <div
                                  className="barHandle left"
                                  onPointerDown={(e2) =>
                                    startItemDrag(e2, row.id, it, 'resize-left')
                                  }
                                />
                                <div
                                  className="barHandle right"
                                  onPointerDown={(e2) =>
                                    startItemDrag(
                                      e2,
                                      row.id,
                                      it,
                                      'resize-right'
                                    )
                                  }
                                />
                              </>
                            )}
                          </div>
                        );
                      }

                      if (it.type === 'milestone') {
                        const startTick = (it.week - 1) * 2 + 1;
                        const endTick = startTick + 2;
                        return (
                          <div
                            key={it.id}
                            className={
                              isSelected
                                ? 'milestone milestoneSelected'
                                : 'milestone'
                            }
                            style={{ gridColumn: `${startTick} / ${endTick}` }}
                            title={
                              interactiveOn && interactiveMode === 'edit'
                                ? `Drag to move milestone (Week ${it.week})`
                                : `Milestone: Week ${it.week} (click to remove)`
                            }
                            onClick={() => {
                              if (!interactiveOn) removeItem(row.id, it.id);
                              else if (interactiveMode === 'edit')
                                setSelectedItem({
                                  rowId: row.id,
                                  itemId: it.id,
                                });
                            }}
                            onPointerDown={(e2) => {
                              if (!interactiveOn || interactiveMode !== 'edit')
                                return;
                              startItemDrag(e2, row.id, it, 'move');
                            }}
                          >
                            ★
                          </div>
                        );
                      }

                      return null;
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="footerHint">
        Tip: For proposal screenshots, adjust row height slider + browser zoom
        (80%/67%).
      </div>
    </div>
  );
}
