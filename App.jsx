import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus,
  Trash2,
  Shuffle,
  Printer,
  X,
  Ban,
  Users,
  GripVertical,
  PencilLine,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  Wand2,
  ClipboardList,
} from "lucide-react";

// ---------- design tokens ----------
const T = {
  ink: "#22201B",
  muted: "#6F6656",
  paper: "#F7F4EC",
  card: "#FFFFFF",
  line: "#E7E1D0",
  forest: "#1B3A2F",
  forestSoft: "rgba(27,58,47,0.08)",
  gold: "#C1962F",
  goldSoft: "rgba(193,150,47,0.12)",
  wood: "#C99860",
  woodDark: "#A9754F",
  rust: "#B0472F",
  rustSoft: "rgba(176,71,47,0.10)",
};
const SERIF = "Georgia, 'Iowan Old Style', ui-serif, serif";

// ---------- generic helpers ----------
const uid = () => Math.random().toString(36).slice(2, 10);

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function cleanLine(raw) {
  return raw
    .replace(/^\s*[\d]+[.)]\s*/, "")
    .replace(/^[-•*]\s*/, "")
    .trim();
}
function normalizeGenderToken(raw) {
  const g = String(raw || "").trim().toUpperCase();
  if (g === "M" || g === "MALE" || g === "BOY") return "M";
  if (g === "F" || g === "FEMALE" || g === "GIRL") return "F";
  return "";
}
// Accepts "Last, First" or "Last, First, M/F" and outputs a "First Last" display
// name. The gender field is optional — if it's missing or not recognized as M/F,
// the name still parses fine, just without a gender. A line with no comma is
// used as-is.
function parseNameLine(raw) {
  const cleaned = cleanLine(raw);
  if (!cleaned) return null;
  const parts = cleaned
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "");
  if (parts.length === 0) return null;
  if (parts.length === 1) return { name: parts[0], gender: "" };
  const [last, first, genderRaw] = parts;
  return { name: `${first} ${last}`.trim(), gender: normalizeGenderToken(genderRaw) };
}

// ---------- desk / layout helpers ----------
function finalizeDesks(rawDesks) {
  if (rawDesks.length === 0) return { desks: [], canvasRows: 1, canvasCols: 1 };
  const minRow = Math.min(...rawDesks.map((d) => d.row));
  const minCol = Math.min(...rawDesks.map((d) => d.col));
  const desks = rawDesks.map((d) => ({ ...d, row: d.row - minRow, col: d.col - minCol }));
  const canvasRows = Math.max(...desks.map((d) => d.row)) + 1;
  const canvasCols = Math.max(...desks.map((d) => d.col)) + 1;
  return { desks, canvasRows, canvasCols };
}

function neighborsOf(deskId, desks) {
  const d = desks.find((x) => x.id === deskId);
  if (!d) return [];
  return desks
    .filter(
      (o) =>
        o.id !== deskId &&
        ((Math.abs(o.row - d.row) === 1 && o.col === d.col) || (Math.abs(o.col - d.col) === 1 && o.row === d.row))
    )
    .map((o) => o.id);
}

function withinHops(a, b, desks, maxHops) {
  if (a === b) return true;
  let frontier = [a];
  const visited = new Set([a]);
  for (let d = 0; d < maxHops; d++) {
    const next = [];
    for (const id of frontier) {
      for (const n of neighborsOf(id, desks)) {
        if (visited.has(n)) continue;
        if (n === b) return true;
        visited.add(n);
        next.push(n);
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return false;
}

function ruleExists(a, b, avoidPairs) {
  return avoidPairs.some((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
}

function countViolations(seatMap, desks, avoidPairs) {
  const seatOf = {};
  Object.keys(seatMap).forEach((deskId) => {
    seatOf[seatMap[deskId]] = deskId;
  });
  let count = 0;
  avoidPairs.forEach((rule) => {
    const deskA = seatOf[rule.a];
    const deskB = seatOf[rule.b];
    if (deskA && deskB && withinHops(deskA, deskB, desks, rule.gap)) count++;
  });
  return count;
}

// alternating-gender target: within each row, seats alternate F/M left to right
function computeGenderTargets(desks) {
  const byRow = {};
  desks.forEach((d) => {
    (byRow[d.row] = byRow[d.row] || []).push(d);
  });
  const targets = {};
  Object.values(byRow).forEach((rowDesks) => {
    rowDesks
      .slice()
      .sort((a, b) => a.col - b.col)
      .forEach((d, idx) => {
        targets[d.id] = idx % 2 === 0 ? "F" : "M";
      });
  });
  return targets;
}
function countGenderMismatches(seatMap, targets, studentsById) {
  let count = 0;
  Object.keys(seatMap).forEach((deskId) => {
    const student = studentsById[seatMap[deskId]];
    if (student?.gender && targets[deskId] && student.gender !== targets[deskId]) count++;
  });
  return count;
}

function randomizeAssign(cls, opts = {}) {
  const desks = cls.desks;
  const alternateGender = !!opts.alternateGender;
  const targets = alternateGender ? computeGenderTargets(desks) : null;
  const studentsById = {};
  cls.students.forEach((s) => {
    studentsById[s.id] = s;
  });
  const rulesByStudent = {};
  cls.avoidPairs.forEach((rule) => {
    (rulesByStudent[rule.a] = rulesByStudent[rule.a] || []).push({ partner: rule.b, gap: rule.gap });
    (rulesByStudent[rule.b] = rulesByStudent[rule.b] || []).push({ partner: rule.a, gap: rule.gap });
  });
  const ids = cls.students.map((s) => s.id);
  let best = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 50; attempt++) {
    const order = shuffle(ids);
    const deskPool = shuffle(desks.map((d) => d.id));
    const seatMap = {};
    order.forEach((sid) => {
      const myRules = rulesByStudent[sid] || [];
      const conflictAt = (deskId) =>
        myRules.some((r) => {
          const partnerDesk = Object.keys(seatMap).find((d) => seatMap[d] === r.partner);
          return partnerDesk && withinHops(deskId, partnerDesk, desks, r.gap);
        });
      let chosen = null;
      const wantGender = alternateGender ? studentsById[sid]?.gender : null;
      if (wantGender) {
        chosen = deskPool.find((d) => seatMap[d] === undefined && targets[d] === wantGender && !conflictAt(d));
      }
      if (!chosen) chosen = deskPool.find((d) => seatMap[d] === undefined && !conflictAt(d));
      if (!chosen) chosen = deskPool.find((d) => seatMap[d] === undefined);
      if (chosen) seatMap[chosen] = sid;
    });
    const violations = countViolations(seatMap, desks, cls.avoidPairs);
    const mismatches = alternateGender ? countGenderMismatches(seatMap, targets, studentsById) : 0;
    const score = violations * 100 + mismatches;
    if (score < bestScore) {
      bestScore = score;
      best = seatMap;
      if (score === 0) break;
    }
  }
  return best || {};
}

// ---------- layout generators (5 presets) ----------
function genRows(n) {
  n = Math.max(1, Math.min(60, n));
  const cols = 5;
  const rows = Math.ceil(n / cols);
  const raw = [];
  let count = 0;
  for (let r = 0; r < rows && count < n; r++)
    for (let c = 0; c < cols && count < n; c++) {
      raw.push({ id: uid(), row: r, col: c });
      count++;
    }
  return finalizeDesks(raw);
}
function genPairs(n) {
  n = Math.max(1, Math.min(60, n));
  const pairsPerRow = 3;
  const raw = [];
  let count = 0;
  let r = 0;
  while (count < n && r < 40) {
    for (let p = 0; p < pairsPerRow && count < n; p++) {
      const base = p * 3;
      raw.push({ id: uid(), row: r, col: base });
      count++;
      if (count < n) {
        raw.push({ id: uid(), row: r, col: base + 1 });
        count++;
      }
    }
    r++;
  }
  return finalizeDesks(raw);
}
function genGroupsOfFour(n) {
  n = Math.max(1, Math.min(60, n));
  const podsPerBand = 2;
  const podC = 2;
  const podR = 2;
  const gap = 1;
  const raw = [];
  let count = 0;
  let band = 0;
  while (count < n && band < 30) {
    for (let p = 0; p < podsPerBand && count < n; p++) {
      const colOff = p * (podC + gap);
      const rowOff = band * (podR + gap);
      for (let rr = 0; rr < podR && count < n; rr++)
        for (let cc = 0; cc < podC && count < n; cc++) {
          raw.push({ id: uid(), row: rowOff + rr, col: colOff + cc });
          count++;
        }
    }
    band++;
  }
  return finalizeDesks(raw);
}
function genUShape(n) {
  n = Math.max(3, Math.min(60, n));
  const width = Math.max(5, Math.min(10, Math.ceil(n / 3) + 2));
  let rows = 3;
  while (2 * (rows - 1) + width < n && rows < 30) rows++;
  let raw = [];
  for (let c = 0; c < width; c++) raw.push({ id: uid(), row: rows - 1, col: c });
  for (let r = 0; r < rows - 1; r++) raw.push({ id: uid(), row: r, col: 0 });
  for (let r = 0; r < rows - 1; r++) raw.push({ id: uid(), row: r, col: width - 1 });
  if (raw.length > n) {
    const removable = raw.filter((d) => d.row < rows - 1).sort((a, b) => a.row - b.row);
    let excess = raw.length - n;
    for (const d of removable) {
      if (excess <= 0) break;
      raw.splice(raw.indexOf(d), 1);
      excess--;
    }
  }
  return finalizeDesks(raw);
}
function genCircle(n) {
  n = Math.max(4, Math.min(60, n));
  const radius = Math.max(2, Math.round(n / (2 * Math.PI)) + 1);
  const center = radius + 2;
  const used = new Set();
  const raw = [];
  for (let i = 0; i < n; i++) {
    const theta = (2 * Math.PI * i) / n - Math.PI / 2;
    let rad = radius;
    let row, col, key;
    let tries = 0;
    do {
      row = Math.round(center + rad * Math.sin(theta));
      col = Math.round(center + rad * Math.cos(theta) * 1.6);
      key = `${row},${col}`;
      rad += 0.6;
      tries++;
    } while (used.has(key) && tries < 10);
    used.add(key);
    raw.push({ id: uid(), row, col });
  }
  return finalizeDesks(raw);
}

const PRESETS = [
  { key: "rows", name: "Rows", desc: "Straight rows facing the front — classic and easy to scan.", generate: genRows },
  { key: "pairs", name: "Pairs", desc: "Table-for-two desks with aisles between them.", generate: genPairs },
  { key: "groups", name: "Groups of 4", desc: "Pods for collaborative and group work.", generate: genGroupsOfFour },
  { key: "ushape", name: "U-Shape", desc: "Desks around the edges, open toward the front.", generate: genUShape },
  { key: "circle", name: "Circle", desc: "A ring facing the centre — good for discussion.", generate: genCircle },
];

function defaultClass(name) {
  const { desks, canvasRows, canvasCols } = genRows(20);
  return {
    id: uid(),
    name,
    desks,
    canvasRows,
    canvasCols,
    layoutName: "Rows",
    students: [],
    seatMap: {},
    avoidPairs: [],
    alternateGender: false,
  };
}

// migrates classes saved by an earlier version of this app (dense rows x cols grid,
// and avoid-pair rules stored as plain [a,b] tuples with no gap distance)
function migrateClass(c) {
  let out = c;
  if (!c.desks) {
    const rows = c.rows || 4;
    const cols = c.cols || 5;
    const desks = [];
    for (let r = 0; r < rows; r++) for (let cc = 0; cc < cols; cc++) desks.push({ id: String(r * cols + cc), row: r, col: cc });
    out = { ...c, desks, canvasRows: rows, canvasCols: cols, layoutName: "Rows" };
  }
  const avoidPairs = (out.avoidPairs || []).map((r) => (Array.isArray(r) ? { a: r[0], b: r[1], gap: 1 } : r));
  return { ...out, avoidPairs, alternateGender: !!out.alternateGender };
}

// ---------- small UI primitives ----------
function Logo({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect x="1" y="1" width="11" height="11" rx="3" stroke={T.forest} strokeWidth="2" />
      <rect x="16" y="1" width="11" height="11" rx="3" stroke={T.forest} strokeWidth="2" />
      <rect x="1" y="16" width="11" height="11" rx="3" stroke={T.forest} strokeWidth="2" />
      <rect x="16" y="16" width="11" height="11" rx="3" fill={T.gold} />
    </svg>
  );
}
function Button({ variant = "secondary", size = "md", className = "", children, ...props }) {
  const base =
    "inline-flex items-center gap-2 rounded-lg font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed";
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-3.5 py-2 text-sm" };
  const variants = {
    primary: "text-white shadow-sm hover:shadow-md hover:brightness-110 active:brightness-95",
    gold: "text-[#2A2110] shadow-sm hover:shadow-md hover:brightness-105 active:brightness-95",
    secondary: "border hover:bg-[#F1ECDD] active:bg-[#E7E1D0]",
    ghost: "hover:bg-[#F1ECDD] active:bg-[#E7E1D0]",
  };
  const style =
    variant === "primary"
      ? { backgroundColor: T.forest }
      : variant === "gold"
      ? { backgroundColor: T.gold }
      : variant === "secondary"
      ? { borderColor: T.line, color: T.ink }
      : { color: T.ink };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} style={style} {...props}>
      {children}
    </button>
  );
}
function Card({ className = "", children, ...props }) {
  return (
    <div
      className={`bg-white rounded-2xl border shadow-[0_1px_2px_rgba(34,32,27,0.04),0_8px_24px_-16px_rgba(34,32,27,0.15)] ${className}`}
      style={{ borderColor: T.line }}
      {...props}
    >
      {children}
    </div>
  );
}
function Eyebrow({ children }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: T.muted }}>
      {children}
    </div>
  );
}
function MiniPreview({ desks, canvasRows, canvasCols }) {
  const pad = 4;
  const w = 100;
  const h = 60;
  const cw = (w - pad * 2) / Math.max(canvasCols, 1);
  const ch = (h - pad * 2) / Math.max(canvasRows, 1);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16">
      <rect x="0" y="0" width={w} height={h} rx="8" fill="#FBF9F2" />
      {desks.map((d, i) => (
        <rect
          key={i}
          x={pad + d.col * cw + cw * 0.12}
          y={pad + d.row * ch + ch * 0.12}
          width={cw * 0.76}
          height={ch * 0.76}
          rx="1.5"
          fill={T.wood}
        />
      ))}
    </svg>
  );
}

// ---------- main component ----------
export default function SeatingPlanner() {
  const [loaded, setLoaded] = useState(false);
  const [classes, setClasses] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [customLayouts, setCustomLayouts] = useState([]);
  const [selection, setSelection] = useState(null);
  const [showAvoidPanel, setShowAvoidPanel] = useState(false);
  const [showLayoutPanel, setShowLayoutPanel] = useState(false);
  const [layoutCapacity, setLayoutCapacity] = useState(20);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorRows, setEditorRows] = useState(6);
  const [editorCols, setEditorCols] = useState(8);
  const [editorDesks, setEditorDesks] = useState(new Set());
  const [editorName, setEditorName] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentGender, setNewStudentGender] = useState("");
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkGenders, setBulkGenders] = useState({});
  const [pairA, setPairA] = useState("");
  const [pairB, setPairB] = useState("");
  const [pairGap, setPairGap] = useState(1);
  const [renaming, setRenaming] = useState(false);
  const [toast, setToast] = useState(null);
  const saveTimer = useRef(null);
  const toastTimer = useRef(null);
  const latestState = useRef({ classes: [], selectedId: null, customLayouts: [] });

  useEffect(() => {
    latestState.current = { classes, selectedId, customLayouts };
  }, [classes, selectedId, customLayouts]);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("seating-planner-data", false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          const migrated = (parsed.classes || []).map(migrateClass);
          setClasses(migrated);
          setSelectedId(parsed.selectedId || migrated[0]?.id || null);
          setCustomLayouts(parsed.customLayouts || []);
        }
      } catch (e) {
        // no saved data yet
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await window.storage.set("seating-planner-data", JSON.stringify(latestState.current), false);
      } catch (e) {
        console.error("Could not save seating data", e);
      }
    }, 300);
  }, []);

  const flashToast = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  const updateClasses = (updater) => {
    setClasses((prev) => (typeof updater === "function" ? updater(prev) : updater));
    scheduleSave();
  };
  const patchClass = (id, patch) => {
    updateClasses((prev) => prev.map((c) => (c.id === id ? { ...c, ...(typeof patch === "function" ? patch(c) : patch) } : c)));
  };
  const selectClass = (id) => {
    setSelectedId(id);
    setSelection(null);
    setShowAvoidPanel(false);
    setShowLayoutPanel(false);
    setShowBulkPanel(false);
    setEditorOpen(false);
    scheduleSave();
  };
  const cls = classes.find((c) => c.id === selectedId) || null;

  const addClass = () => {
    const c = defaultClass(`New Class ${classes.length + 1}`);
    setClasses((prev) => [...prev, c]);
    setSelectedId(c.id);
    scheduleSave();
  };
  const deleteClass = (id) => {
    setClasses((prev) => {
      const next = prev.filter((c) => c.id !== id);
      setSelectedId((cur) => (cur === id ? next[0]?.id || null : cur));
      return next;
    });
    scheduleSave();
  };

  const addStudent = () => {
    const raw = newStudentName.trim();
    if (!raw || !cls) return;
    const parsed = parseNameLine(raw);
    if (!parsed) return;
    const gender = newStudentGender || parsed.gender || null;
    patchClass(cls.id, (c) => ({ students: [...c.students, { id: uid(), name: parsed.name, gender }] }));
    setNewStudentName("");
    setNewStudentGender("");
  };
  const removeStudent = (studentId) => {
    if (!cls) return;
    patchClass(cls.id, (c) => {
      const seatMap = { ...c.seatMap };
      Object.keys(seatMap).forEach((k) => {
        if (seatMap[k] === studentId) delete seatMap[k];
      });
      return {
        students: c.students.filter((s) => s.id !== studentId),
        seatMap,
        avoidPairs: c.avoidPairs.filter((r) => r.a !== studentId && r.b !== studentId),
      };
    });
    if (selection?.studentId === studentId) setSelection(null);
  };

  const openBulkPanel = () => {
    if (!cls) return;
    setBulkText("");
    setBulkGenders({});
    setShowAvoidPanel(false);
    setShowLayoutPanel(false);
    setShowBulkPanel(true);
  };
  const removeBulkRow = (idx) => {
    const lines = bulkText.split("\n");
    lines.splice(idx, 1);
    setBulkText(lines.join("\n"));
    setBulkGenders((prev) => {
      const next = {};
      Object.entries(prev).forEach(([k, v]) => {
        const i = Number(k);
        if (i < idx) next[i] = v;
        else if (i > idx) next[i - 1] = v;
      });
      return next;
    });
  };
  const addBulkStudents = () => {
    const lines = bulkText.split("\n");
    const rows = lines.map((line, idx) => {
      const parsed = parseNameLine(line);
      if (!parsed) return null;
      const override = bulkGenders[idx];
      const gender = (override !== undefined ? override : parsed.gender) || null;
      return { name: parsed.name, gender };
    });
    const valid = rows.filter(Boolean);
    if (valid.length === 0 || !cls) return;
    const newStudents = valid.map((r) => ({ id: uid(), name: r.name, gender: r.gender }));
    patchClass(cls.id, (c) => ({ students: [...c.students, ...newStudents] }));
    flashToast({ type: "success", text: `Added ${newStudents.length} student${newStudents.length === 1 ? "" : "s"}.` });
    setShowBulkPanel(false);
    setBulkText("");
    setBulkGenders({});
  };

  // ----- seating -----
  const occupantOf = (deskId) => cls?.seatMap[deskId];
  const isSeated = (studentId) => cls && Object.values(cls.seatMap).includes(studentId);

  const placeAtSeat = (studentId, destDeskId, sourceDeskId) => {
    patchClass(cls.id, (c) => {
      const seatMap = { ...c.seatMap };
      const displaced = seatMap[destDeskId];
      if (sourceDeskId) {
        if (displaced !== undefined) seatMap[sourceDeskId] = displaced;
        else delete seatMap[sourceDeskId];
      }
      seatMap[destDeskId] = studentId;
      return { seatMap };
    });
  };
  const unassign = (studentId, sourceDeskId) => {
    patchClass(cls.id, (c) => {
      const seatMap = { ...c.seatMap };
      delete seatMap[sourceDeskId];
      return { seatMap };
    });
  };
  const handleSeatClick = (deskId) => {
    const occupant = occupantOf(deskId);
    if (!selection) {
      if (occupant !== undefined) setSelection({ studentId: occupant, source: deskId });
      return;
    }
    if (selection.source === deskId) {
      setSelection(null);
      return;
    }
    if (selection.source === "pool") placeAtSeat(selection.studentId, deskId, null);
    else placeAtSeat(selection.studentId, deskId, selection.source);
    setSelection(null);
  };
  const handlePoolClick = (studentId) => {
    if (selection?.studentId === studentId) {
      setSelection(null);
      return;
    }
    setSelection({ studentId, source: "pool" });
  };
  const handlePoolDrop = () => {
    if (!selection) return;
    if (selection.source !== "pool") unassign(selection.studentId, selection.source);
    setSelection(null);
  };
  const onDragStartStudent = (e, studentId, source) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ studentId, source }));
  };
  const onDropSeat = (e, deskId) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (data.source === "pool") placeAtSeat(data.studentId, deskId, null);
      else placeAtSeat(data.studentId, deskId, data.source);
    } catch (err) {}
    setSelection(null);
  };
  const onDropPool = (e) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (data.source !== "pool") unassign(data.studentId, data.source);
    } catch (err) {}
    setSelection(null);
  };

  const addAvoidPair = () => {
    if (!pairA || !pairB || pairA === pairB || !cls) return;
    if (ruleExists(pairA, pairB, cls.avoidPairs)) return;
    const gap = Math.max(1, Math.min(10, Number(pairGap) || 1));
    patchClass(cls.id, (c) => ({ avoidPairs: [...c.avoidPairs, { a: pairA, b: pairB, gap }] }));
    setPairA("");
    setPairB("");
  };
  const removeAvoidPair = (a, b) => {
    patchClass(cls.id, (c) => ({ avoidPairs: c.avoidPairs.filter((r) => !(r.a === a && r.b === b)) }));
  };
  const randomize = () => {
    if (!cls) return;
    const seatMap = randomizeAssign(cls, { alternateGender: cls.alternateGender });
    patchClass(cls.id, { seatMap });
  };
  const toggleAlternateGender = () => {
    if (!cls) return;
    patchClass(cls.id, (c) => ({ alternateGender: !c.alternateGender }));
  };
  const setStudentGender = (studentId, gender) => {
    if (!cls) return;
    patchClass(cls.id, (c) => ({ students: c.students.map((s) => (s.id === studentId ? { ...s, gender } : s)) }));
  };
  const cycleGender = (current) => (current === "M" ? "F" : current === "F" ? null : "M");

  // ----- layouts -----
  const openLayoutPanel = () => {
    if (!cls) return;
    setLayoutCapacity(Math.max(cls.students.length, cls.desks.length, 12));
    setShowLayoutPanel((v) => !v);
    setShowBulkPanel(false);
    setEditorOpen(false);
  };
  const applyLayout = (desks, canvasRows, canvasCols, layoutName) => {
    if (!cls) return;
    patchClass(cls.id, { desks, canvasRows, canvasCols, seatMap: {}, layoutName });
    flashToast({ type: "success", text: `Applied "${layoutName}" — students moved to Unassigned.` });
    setShowLayoutPanel(false);
    setEditorOpen(false);
  };
  const applyPreset = (preset) => {
    const { desks, canvasRows, canvasCols } = preset.generate(layoutCapacity);
    applyLayout(desks, canvasRows, canvasCols, preset.name);
  };
  const applyCustom = (layout) => {
    const desks = layout.desks.map((d) => ({ ...d, id: uid() }));
    applyLayout(desks, layout.canvasRows, layout.canvasCols, layout.name);
  };
  const deleteCustomLayout = (id) => {
    setCustomLayouts((prev) => prev.filter((l) => l.id !== id));
    scheduleSave();
  };

  const openEditor = () => {
    setEditorRows(6);
    setEditorCols(8);
    setEditorDesks(new Set());
    setEditorName("");
    setEditorOpen(true);
  };
  const toggleEditorCell = (r, c) => {
    setEditorDesks((prev) => {
      const key = `${r},${c}`;
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const resizeEditor = (rows, cols) => {
    setEditorRows(rows);
    setEditorCols(cols);
    setEditorDesks((prev) => {
      const next = new Set();
      prev.forEach((key) => {
        const [r, c] = key.split(",").map(Number);
        if (r < rows && c < cols) next.add(key);
      });
      return next;
    });
  };
  const saveEditorLayout = () => {
    if (editorDesks.size === 0 || !cls) return;
    const raw = Array.from(editorDesks).map((key) => {
      const [r, c] = key.split(",").map(Number);
      return { id: uid(), row: r, col: c };
    });
    const { desks, canvasRows, canvasCols } = finalizeDesks(raw);
    const name = editorName.trim() || `Custom Layout ${customLayouts.length + 1}`;
    const layout = { id: uid(), name, canvasRows, canvasCols, desks };
    setCustomLayouts((prev) => [...prev, layout]);
    scheduleSave();
    applyLayout(
      desks.map((d) => ({ ...d })),
      canvasRows,
      canvasCols,
      name
    );
  };

  const violationSeats = (() => {
    if (!cls) return new Set();
    const set = new Set();
    const seatOf = {};
    Object.keys(cls.seatMap).forEach((deskId) => {
      seatOf[cls.seatMap[deskId]] = deskId;
    });
    cls.avoidPairs.forEach((rule) => {
      const deskA = seatOf[rule.a];
      const deskB = seatOf[rule.b];
      if (deskA && deskB && withinHops(deskA, deskB, cls.desks, rule.gap)) {
        set.add(deskA);
        set.add(deskB);
      }
    });
    return set;
  })();

  const studentById = (id) => cls?.students.find((s) => s.id === id);
  const unseated = cls ? cls.students.filter((s) => !isSeated(s.id)) : [];

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2" style={{ backgroundColor: T.paper, color: T.ink }}>
        <Logo size={22} />
        <span className="text-sm" style={{ color: T.muted }}>
          Loading your classes…
        </span>
      </div>
    );
  }

  const selectClassName = "px-3 py-2 rounded-lg border bg-white text-sm outline-none focus:ring-2";

  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: T.paper, color: T.ink }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-card { box-shadow: none !important; border: none !important; }
          body { background: white !important; }
        }
        .seat-tile { transition: transform .12s ease, box-shadow .12s ease; }
        .seat-tile:hover { transform: translateY(-2px); }
        select:focus, input:focus { outline: none; box-shadow: 0 0 0 3px ${T.forestSoft}; border-color: ${T.forest}; }
      `}</style>

      <header
        className="no-print sticky top-0 z-10 backdrop-blur-sm border-b"
        style={{ borderColor: T.line, backgroundColor: "rgba(247,244,236,0.9)" }}
      >
        <div className="px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo />
            <div>
              <div style={{ fontFamily: SERIF, letterSpacing: "-0.01em" }} className="text-[17px] font-bold leading-none">
                SeatCraft
              </div>
              <div className="text-[11px] leading-none mt-1" style={{ color: T.muted }}>
                Seating charts, thoughtfully arranged
              </div>
            </div>
          </div>
          {cls && (
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer size={14} /> Print chart
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-col md:flex-row max-w-[1400px] mx-auto">
        <aside className="no-print w-full md:w-72 p-5 space-y-1">
          <Eyebrow>Your Classes</Eyebrow>
          <div className="mt-2 space-y-1.5">
            {classes.map((c) => {
              const active = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => selectClass(c.id)}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl text-sm flex items-center justify-between transition-all"
                  style={active ? { backgroundColor: T.forest, color: "#fff", boxShadow: "0 4px 10px -4px rgba(27,58,47,0.5)" } : { color: T.ink }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.backgroundColor = "#EFE9D9";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <span className="truncate font-medium">{c.name}</span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full ml-2 shrink-0"
                    style={active ? { backgroundColor: "rgba(255,255,255,0.18)" } : { backgroundColor: T.forestSoft, color: T.forest }}
                  >
                    {c.students.length}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            onClick={addClass}
            className="w-full mt-3 flex items-center gap-2 justify-center px-3.5 py-2.5 rounded-xl border border-dashed text-sm font-medium transition-colors"
            style={{ borderColor: "#C9BFA0", color: T.muted }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#EFE9D9")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <Plus size={15} /> New class
          </button>
        </aside>

        <main className="flex-1 p-5 md:pl-0">
          {!cls && (
            <Card className="max-w-md mx-auto mt-16 p-8 text-center print-card">
              <div className="mx-auto w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: T.forestSoft }}>
                <Logo size={22} />
              </div>
              <p style={{ fontFamily: SERIF }} className="text-xl font-bold">
                No class open yet
              </p>
              <p className="text-sm mt-1.5 mb-5" style={{ color: T.muted }}>
                Start a class to build its roster and lay out desks.
              </p>
              <Button variant="primary" className="mx-auto" onClick={addClass}>
                <Plus size={15} /> New class
              </Button>
            </Card>
          )}

          {cls && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {renaming ? (
                    <input
                      autoFocus
                      defaultValue={cls.name}
                      onBlur={(e) => {
                        patchClass(cls.id, { name: e.target.value.trim() || cls.name });
                        setRenaming(false);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                      style={{ fontFamily: SERIF }}
                      className="text-[26px] font-bold bg-transparent border-b-2 pb-0.5"
                    />
                  ) : (
                    <h2 style={{ fontFamily: SERIF, letterSpacing: "-0.01em" }} className="text-[26px] font-bold flex items-center gap-2.5">
                      {cls.name}
                      <button className="no-print" style={{ color: T.muted }} onClick={() => setRenaming(true)}>
                        <PencilLine size={16} />
                      </button>
                    </h2>
                  )}
                  <button
                    onClick={() => deleteClass(cls.id)}
                    className="no-print ml-1 opacity-70 hover:opacity-100 transition-opacity"
                    style={{ color: T.rust }}
                    title="Delete class"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="no-print flex items-center gap-2">
                  <label
                    className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-2 rounded-lg border cursor-pointer select-none"
                    style={{ borderColor: T.line, color: T.ink, backgroundColor: cls.alternateGender ? T.goldSoft : "transparent" }}
                  >
                    <input type="checkbox" checked={!!cls.alternateGender} onChange={toggleAlternateGender} className="accent-current" />
                    Alternate Girl / Boy
                  </label>
                  <Button variant="secondary" onClick={openLayoutPanel}>
                    <LayoutGrid size={15} /> Layouts
                  </Button>
                  <Button variant="gold" onClick={randomize}>
                    <Shuffle size={15} /> Randomize seats
                  </Button>
                </div>
              </div>

              {/* layout panel */}
              {showLayoutPanel && (
                <Card className="no-print p-4 print-card">
                  {!editorOpen ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <Eyebrow>Choose a layout</Eyebrow>
                        <div className="flex items-center gap-2 text-sm">
                          <label className="flex items-center gap-1.5" style={{ color: T.muted }}>
                            Desks
                            <input
                              type="number"
                              min={1}
                              max={60}
                              value={layoutCapacity}
                              onChange={(e) => setLayoutCapacity(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                              className="w-16 px-2 py-1.5 rounded-lg border text-sm"
                              style={{ borderColor: T.line, color: T.ink }}
                            />
                          </label>
                          <Button variant="ghost" size="sm" onClick={openEditor}>
                            <Wand2 size={14} /> Create your own
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {PRESETS.map((preset) => {
                          const preview = preset.generate(12);
                          const applied = preset.generate(layoutCapacity);
                          return (
                            <button
                              key={preset.key}
                              onClick={() => applyPreset(preset)}
                              className="text-left rounded-xl border p-3 hover:shadow-md transition-shadow"
                              style={{ borderColor: cls.layoutName === preset.name ? T.forest : T.line }}
                            >
                              <MiniPreview desks={preview.desks} canvasRows={preview.canvasRows} canvasCols={preview.canvasCols} />
                              <div className="mt-2 text-sm font-semibold">{preset.name}</div>
                              <div className="text-[11px] mt-0.5" style={{ color: T.muted }}>
                                {preset.desc}
                              </div>
                              <div className="text-[11px] mt-1 font-medium" style={{ color: T.forest }}>
                                {applied.desks.length} desks
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {customLayouts.length > 0 && (
                        <div className="mt-5 pt-4 border-t" style={{ borderColor: T.line }}>
                          <Eyebrow>Your saved layouts</Eyebrow>
                          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                            {customLayouts.map((layout) => (
                              <div
                                key={layout.id}
                                className="text-left rounded-xl border p-3 relative"
                                style={{ borderColor: cls.layoutName === layout.name ? T.forest : T.line }}
                              >
                                <button
                                  onClick={() => deleteCustomLayout(layout.id)}
                                  className="absolute top-2 right-2 opacity-60 hover:opacity-100"
                                  style={{ color: T.rust }}
                                  title="Delete layout"
                                >
                                  <Trash2 size={13} />
                                </button>
                                <button onClick={() => applyCustom(layout)} className="w-full text-left">
                                  <MiniPreview desks={layout.desks} canvasRows={layout.canvasRows} canvasCols={layout.canvasCols} />
                                  <div className="mt-2 text-sm font-semibold pr-4">{layout.name}</div>
                                  <div className="text-[11px] mt-1 font-medium" style={{ color: T.forest }}>
                                    {layout.desks.length} desks
                                  </div>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <Eyebrow>Create your own layout</Eyebrow>
                        <div className="flex items-center gap-2 text-sm" style={{ color: T.muted }}>
                          <label className="flex items-center gap-1.5">
                            Rows
                            <input
                              type="number"
                              min={2}
                              max={14}
                              value={editorRows}
                              onChange={(e) => resizeEditor(Math.max(2, Math.min(14, Number(e.target.value) || 2)), editorCols)}
                              className="w-14 px-2 py-1.5 rounded-lg border text-sm"
                              style={{ borderColor: T.line, color: T.ink }}
                            />
                          </label>
                          <label className="flex items-center gap-1.5">
                            Cols
                            <input
                              type="number"
                              min={2}
                              max={14}
                              value={editorCols}
                              onChange={(e) => resizeEditor(editorRows, Math.max(2, Math.min(14, Number(e.target.value) || 2)))}
                              className="w-14 px-2 py-1.5 rounded-lg border text-sm"
                              style={{ borderColor: T.line, color: T.ink }}
                            />
                          </label>
                        </div>
                      </div>
                      <p className="text-xs mb-3" style={{ color: T.muted }}>
                        Click a cell to place or remove a desk.
                      </p>
                      <div className="overflow-x-auto pb-2">
                        <div
                          className="inline-grid gap-1.5 p-3 rounded-lg"
                          style={{
                            gridTemplateColumns: `repeat(${editorCols}, 28px)`,
                            gridTemplateRows: `repeat(${editorRows}, 28px)`,
                            backgroundColor: "#FBF9F2",
                            border: `1px solid ${T.line}`,
                          }}
                        >
                          {Array.from({ length: editorRows }).map((_, r) =>
                            Array.from({ length: editorCols }).map((_, c) => {
                              const active = editorDesks.has(`${r},${c}`);
                              return (
                                <button
                                  key={`${r}-${c}`}
                                  onClick={() => toggleEditorCell(r, c)}
                                  className="rounded"
                                  style={
                                    active
                                      ? { background: "linear-gradient(155deg, #D6AD78, #B98A54)", border: `1px solid ${T.woodDark}` }
                                      : { backgroundColor: "rgba(255,255,255,0.6)", border: `1px dashed #C9BFA0` }
                                  }
                                />
                              );
                            })
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <input
                          value={editorName}
                          onChange={(e) => setEditorName(e.target.value)}
                          placeholder="Name this layout"
                          className="px-3 py-2 rounded-lg border text-sm w-52"
                          style={{ borderColor: T.line }}
                        />
                        <span className="text-xs" style={{ color: T.muted }}>
                          {editorDesks.size} desk{editorDesks.size === 1 ? "" : "s"}
                        </span>
                        <div className="flex-1" />
                        <Button variant="ghost" size="md" onClick={() => setEditorOpen(false)}>
                          Back
                        </Button>
                        <Button variant="primary" size="md" onClick={saveEditorLayout} disabled={editorDesks.size === 0}>
                          Save &amp; use layout
                        </Button>
                      </div>
                    </>
                  )}
                </Card>
              )}

              {/* toolbar card */}
              <Card className="no-print p-4 print-card">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={newStudentName}
                      onChange={(e) => setNewStudentName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addStudent()}
                      placeholder="Last name, First name"
                      className="px-3 py-2 rounded-lg border text-sm w-48"
                      style={{ borderColor: T.line }}
                    />
                    <select
                      value={newStudentGender}
                      onChange={(e) => setNewStudentGender(e.target.value)}
                      className="px-2 py-2 rounded-lg border text-sm"
                      style={{ borderColor: T.line, color: T.ink }}
                      title="Gender (used for Girl/Boy alternating rows)"
                    >
                      <option value="">—</option>
                      <option value="F">Girl</option>
                      <option value="M">Boy</option>
                    </select>
                    <Button variant="secondary" size="md" onClick={addStudent}>
                      <Plus size={15} />
                    </Button>
                  </div>

                  <div className="h-6 w-px hidden sm:block" style={{ backgroundColor: T.line }} />

                  <Button variant="secondary" size="md" onClick={openBulkPanel}>
                    <ClipboardList size={15} /> Paste list
                  </Button>

                  <div className="h-6 w-px hidden sm:block" style={{ backgroundColor: T.line }} />

                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => {
                      setShowAvoidPanel((v) => !v);
                      setShowBulkPanel(false);
                    }}
                  >
                    <Ban size={15} /> Avoid-pair rules {cls.avoidPairs.length > 0 && `(${cls.avoidPairs.length})`}
                    <ChevronDown size={14} className="transition-transform" style={{ transform: showAvoidPanel ? "rotate(180deg)" : "none" }} />
                  </Button>
                </div>

                {toast && (
                  <div
                    className="mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                    style={toast.type === "success" ? { backgroundColor: T.forestSoft, color: T.forest } : { backgroundColor: T.rustSoft, color: T.rust }}
                  >
                    {toast.type === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    {toast.text}
                  </div>
                )}

                {showBulkPanel && (
                  <div className="mt-4 pt-4 border-t" style={{ borderColor: T.line }}>
                    <Eyebrow>Paste a list of names</Eyebrow>
                    <p className="text-xs mt-1 mb-2" style={{ color: T.muted }}>
                      One name per line, as "Last name, First name" or "Last name, First name, M/F". Gender is optional — leave it off and we'll add the student without one.
                    </p>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <textarea
                        value={bulkText}
                        onChange={(e) => setBulkText(e.target.value)}
                        placeholder={"Knowles, Connor, M\nKnowles, Ruby, F\nSmith, Ava"}
                        rows={7}
                        className="w-full px-3 py-2 rounded-lg border text-sm font-mono"
                        style={{ borderColor: T.line }}
                      />
                      <div className="border rounded-lg p-2 max-h-52 overflow-y-auto" style={{ borderColor: T.line }}>
                        {bulkText.split("\n").every((l) => !parseNameLine(l)) && (
                          <div className="text-xs p-2" style={{ color: T.muted }}>
                            Paste names on the left to preview them here.
                          </div>
                        )}
                        {bulkText.split("\n").map((line, idx) => {
                          const parsed = parseNameLine(line);
                          if (!parsed) return null;
                          const gender = bulkGenders[idx] !== undefined ? bulkGenders[idx] : parsed.gender;
                          return (
                            <div key={idx} className="flex items-center gap-2 py-1.5 px-1.5 text-sm border-b last:border-b-0" style={{ borderColor: T.line }}>
                              <span className="flex-1 truncate">{parsed.name}</span>
                              <select
                                value={gender}
                                onChange={(e) => setBulkGenders((prev) => ({ ...prev, [idx]: e.target.value }))}
                                className="px-1.5 py-1 rounded-md border text-xs"
                                style={{ borderColor: T.line, color: T.ink }}
                              >
                                <option value="">—</option>
                                <option value="F">Girl</option>
                                <option value="M">Boy</option>
                              </select>
                              <button onClick={() => removeBulkRow(idx)} className="opacity-60 hover:opacity-100" style={{ color: T.rust }}>
                                <X size={13} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-xs" style={{ color: T.muted }}>
                        {bulkText.split("\n").filter((l) => parseNameLine(l)).length} name
                        {bulkText.split("\n").filter((l) => parseNameLine(l)).length === 1 ? "" : "s"} found
                      </span>
                      <div className="flex-1" />
                      <Button variant="ghost" size="md" onClick={() => setShowBulkPanel(false)}>
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        size="md"
                        onClick={addBulkStudents}
                        disabled={bulkText.split("\n").filter((l) => parseNameLine(l)).length === 0}
                      >
                        Add {bulkText.split("\n").filter((l) => parseNameLine(l)).length || ""} student
                        {bulkText.split("\n").filter((l) => parseNameLine(l)).length === 1 ? "" : "s"}
                      </Button>
                    </div>
                  </div>
                )}

                {showAvoidPanel && (
                  <div className="mt-4 pt-4 border-t space-y-3" style={{ borderColor: T.line }}>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <select value={pairA} onChange={(e) => setPairA(e.target.value)} className={selectClassName} style={{ borderColor: T.line }}>
                        <option value="">Student A…</option>
                        {cls.students.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <span style={{ color: T.muted }}>keep at least</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={pairGap}
                        onChange={(e) => setPairGap(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                        className="w-14 px-2 py-2 rounded-lg border text-sm"
                        style={{ borderColor: T.line, color: T.ink }}
                      />
                      <span style={{ color: T.muted }}>seat{pairGap === 1 ? "" : "s"} away from</span>
                      <select value={pairB} onChange={(e) => setPairB(e.target.value)} className={selectClassName} style={{ borderColor: T.line }}>
                        <option value="">Student B…</option>
                        {cls.students.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <Button variant="primary" size="md" onClick={addAvoidPair}>
                        Add rule
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {cls.avoidPairs.map((rule) => (
                        <span
                          key={rule.a + rule.b}
                          className="flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium"
                          style={{ backgroundColor: T.rustSoft, color: T.rust }}
                        >
                          {studentById(rule.a)?.name} ↔ {studentById(rule.b)?.name} · ≥{rule.gap} seat{rule.gap === 1 ? "" : "s"} apart
                          <button onClick={() => removeAvoidPair(rule.a, rule.b)} className="opacity-70 hover:opacity-100">
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                      {cls.avoidPairs.length === 0 && (
                        <span className="text-xs" style={{ color: T.muted }}>
                          No rules yet — seats with a conflict get a red ring after randomizing.
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </Card>

              {/* unseated pool */}
              <Card className="no-print p-4 print-card">
                <Eyebrow>Unassigned</Eyebrow>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onDropPool}
                  onClick={() => selection && selection.source !== "pool" && handlePoolDrop()}
                  className="mt-2.5 min-h-[44px] flex flex-wrap gap-2 items-start"
                >
                  {unseated.length === 0 && cls.students.length > 0 && (
                    <span className="text-xs py-1" style={{ color: T.muted }}>
                      Everyone has a seat.
                    </span>
                  )}
                  {cls.students.length === 0 && (
                    <span className="text-xs py-1" style={{ color: T.muted }}>
                      Add students above to build the roster.
                    </span>
                  )}
                  {unseated.map((s) => (
                    <span
                      key={s.id}
                      draggable
                      onDragStart={(e) => onDragStartStudent(e, s.id, "pool")}
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePoolClick(s.id);
                      }}
                      className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-lg text-sm cursor-pointer select-none shadow-sm"
                      style={{
                        background: "linear-gradient(155deg, #D6AD78, #B98A54)",
                        color: "#2E2210",
                        boxShadow: selection?.studentId === s.id ? `0 0 0 2px ${T.forest}` : undefined,
                      }}
                    >
                      <GripVertical size={13} className="opacity-50" />
                      {s.name}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setStudentGender(s.id, cycleGender(s.gender));
                        }}
                        className="text-[10px] font-semibold w-4 h-4 flex items-center justify-center rounded"
                        style={{ backgroundColor: "rgba(255,255,255,0.55)" }}
                        title="Click to set gender (used for Girl/Boy alternating rows)"
                      >
                        {s.gender || "—"}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeStudent(s.id);
                        }}
                        className="ml-1 opacity-60 hover:opacity-100"
                      >
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              </Card>

              {/* seating chart card */}
              <Card className="overflow-hidden print-card">
                <div
                  style={{ fontFamily: SERIF, backgroundColor: T.forest, color: "#F4F1E6", borderColor: "rgba(244,241,230,0.35)" }}
                  className="flex items-center justify-between gap-3 px-4 text-center text-xs tracking-[0.32em] uppercase py-2.5 border-b-[3px] border-dashed"
                >
                  <span className="opacity-0 select-none">·</span>
                  <span>Front of Room</span>
                  <span className="normal-case tracking-normal opacity-70 text-[10px]">{cls.layoutName}</span>
                </div>
                <div
                  className="p-4 sm:p-6 overflow-x-auto"
                  style={{
                    backgroundImage: `linear-gradient(${T.line} 1px, transparent 1px), linear-gradient(90deg, ${T.line} 1px, transparent 1px)`,
                    backgroundSize: "26px 26px",
                    backgroundColor: "#FBF9F2",
                  }}
                >
                  <div
                    className="grid gap-3 mx-auto"
                    style={{
                      gridTemplateColumns: `repeat(${cls.canvasCols}, minmax(52px, 1fr))`,
                      gridTemplateRows: `repeat(${cls.canvasRows}, minmax(52px, 64px))`,
                      maxWidth: `${cls.canvasCols * 90}px`,
                    }}
                  >
                    {cls.desks.map((desk) => {
                      const occupantId = occupantOf(desk.id);
                      const student = occupantId ? studentById(occupantId) : null;
                      const isViolation = violationSeats.has(desk.id);
                      const isSelected = selection?.source === desk.id;
                      return (
                        <div
                          key={desk.id}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => onDropSeat(e, desk.id)}
                          onClick={() => handleSeatClick(desk.id)}
                          draggable={!!student}
                          onDragStart={(e) => student && onDragStartStudent(e, student.id, desk.id)}
                          className="seat-tile rounded-lg flex items-center justify-center text-center px-1.5 text-xs sm:text-sm font-medium cursor-pointer border"
                          style={{
                            gridColumn: `${desk.col + 1} / span 1`,
                            gridRow: `${desk.row + 1} / span 1`,
                            ...(student
                              ? {
                                  background: "linear-gradient(155deg, #D6AD78, #B98A54)",
                                  borderColor: T.woodDark,
                                  color: "#2E2210",
                                  boxShadow: isViolation ? `0 0 0 2px ${T.rust}` : isSelected ? `0 0 0 2px ${T.forest}` : "0 1px 2px rgba(34,32,27,0.08)",
                                }
                              : {
                                  backgroundColor: "rgba(255,255,255,0.55)",
                                  borderStyle: "dashed",
                                  borderColor: "#C9BFA0",
                                  color: "#B0A582",
                                  boxShadow: isSelected ? `0 0 0 2px ${T.forest}` : undefined,
                                }),
                          }}
                        >
                          {student ? student.name : ""}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            </div>
          )}
        </main>
      </div>

      <footer className="no-print text-center text-xs py-8" style={{ color: T.muted }}>
        SeatCraft — built for classrooms.
      </footer>
    </div>
  );
}
