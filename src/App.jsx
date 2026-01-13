import { useEffect, useMemo, useRef, useState } from 'react';
import { toJpeg, toPng } from 'html-to-image';
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
  } catch {}
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

export default function App() {
  const [model, setModel] = useState({
    weeksCount: 20,
    rows: starterRows,
    rowHeightMode: 'auto',
    manualRowHeight: 42,
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
        <div className="card">
          <div className="cardTitle">1) Weeks</div>
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
            Column width ≈ <b>{weekColPx.toFixed(1)}px</b> per week. (Half-step
            ≈ <b>{halfColPx.toFixed(1)}px</b>)
          </div>
        </div>

        <div className="card">
          <div className="cardTitle">2) Rows & Phases</div>

          <div className="row">
            <label className="label">Add row label</label>
            <input
              className="input"
              value={newTaskLabel}
              placeholder='e.g., "Service Cloud"'
              onChange={(e) => setNewTaskLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addTaskRow();
              }}
            />
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

          <div className="rowList">
            {rows.map((r) => (
              <div
                key={r.id}
                className={
                  r.kind === 'phase' ? 'rowPill rowPillPhase' : 'rowPill'
                }
                title={r.kind === 'phase' ? 'Phase separator row' : 'Task row'}
              >
                <span className="rowPillText">
                  {r.kind === 'phase' ? `⎯⎯ ${r.label}` : r.label}
                </span>
                <button
                  className="rowPillX"
                  onClick={() => deleteRow(r.id)}
                  title="Delete row"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="hint" style={{ marginTop: 8 }}>
            Total rows (including phases): <b>{rows.length}</b>
          </div>
        </div>

        {/* UPDATED UI: Card #3 -> ONLY the minimal row */}
        <div className="card">
          <div className="cardTitle">3) Add Bars / Discovery</div>

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
                className={
                  composerType === 'bar' ? 'pillBtn pillBtnOn' : 'pillBtn'
                }
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
            Current: <b>{sizing.rowHeightPx}px</b> (Auto suggestion: {autoH}px)
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
                    ? `Selected row: ${
                        rows.find((r) => r.id === swapFirstRowId)?.label ?? '—'
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
            ['--barHeightPx']: `${sizing.barHeightPx}px`,
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
