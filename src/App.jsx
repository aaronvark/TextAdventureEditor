import { useState } from "react";

const DIRS = ["north", "east", "south", "west"];
const DIR_ARROWS = { north: "↑", east: "→", south: "↓", west: "←" };
function xyToGridId(x, y, w) { return y * w + x + 1; }

// ── INI ───────────────────────────────────────────────────────────────────────
function parseIni(text) {
  const r = {}; let sec = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(";")) continue;
    const m = line.match(/^\[(.+)]$/);
    if (m) { sec = m[1]; r[sec] = r[sec] || {}; continue; }
    if (sec) { const eq = line.indexOf("="); if (eq !== -1) r[sec][line.slice(0,eq).trim()] = line.slice(eq+1).trim(); }
  }
  return r;
}
function serializeIni(data) {
  return Object.entries(data).map(([sec, fields]) =>
      [`[${sec}]`, ...Object.entries(fields).map(([k,v]) => `${k} = ${v}`)].join("\n")
  ).join("\n\n");
}

function defaultState() {
  return {
    mapWidth: 5, mapHeight: 5, startingLocation: 2,
    introduction: "Welcome to your adventure!__Press enter to begin!",
    ending: { requiredEvents: "", targetLocation: "", output: "You win!__Press any key to quit." },
    events: {}, locations: {}, objects: {},
  };
}

function loadFromInis(mapText, objectsText, eventsText) {
  const mi = parseIni(mapText), oi = parseIni(objectsText), ei = parseIni(eventsText);
  const s = defaultState();
  if (ei.mapdata) { s.mapWidth = parseInt(ei.mapdata.width)||5; s.mapHeight = parseInt(ei.mapdata.height)||5; s.startingLocation = parseInt(ei.mapdata.startinglocation)||1; }
  if (ei.introduction) s.introduction = ei.introduction.output || "";
  if (ei.ending) s.ending = { requiredEvents: ei.ending.requiredEvents||"", targetLocation: ei.ending.targetLocation||"", output: ei.ending.output||"" };
  Object.entries(ei).forEach(([k,v]) => { if (!["mapdata","introduction","ending"].includes(k) && /^\d+$/.test(k)) s.events[k] = { name: v.name||k, actions: v.actions||"" }; });
  Object.entries(mi).forEach(([k,v]) => { if (/^\d+$/.test(k)) s.locations[k] = { description: v.description||"", directions: v.directions ? v.directions.split(" ").filter(Boolean):[], objects: v.objects ? v.objects.split(" ").filter(Boolean):[], requireditem: v.requireditem||"", actions: v.actions||"" }; });
  Object.entries(oi).forEach(([k,v]) => { if (/^\d+$/.test(k)||k==="0") s.objects[k] = { name: v.name||"", examine: v.examine||"", pickup: v.pickup||"false", pickupdescr: v.pickupdescr||"", locationdescr: v.locationdescr||"", pickupactions: v.pickupactions||"", actions: v.actions||"" }; });
  return s;
}

function exportToInis(state) {
  const md = {};
  Object.entries(state.locations).sort(([a],[b])=>+a-+b).forEach(([id,loc]) => {
    const o = {};
    if (loc.directions.length) o.directions = loc.directions.join(" ");
    if (loc.description) o.description = loc.description;
    if (loc.requireditem) o.requireditem = loc.requireditem;
    if (loc.actions) o.actions = loc.actions;
    if (loc.objects.length) o.objects = loc.objects.join(" ");
    md[id] = o;
  });
  const od = {};
  Object.entries(state.objects).sort(([a],[b])=>+a-+b).forEach(([id,o]) => {
    const r = {}; if (o.name) r.name=o.name; if (o.examine) r.examine=o.examine; r.pickup=o.pickup||"false";
    if (o.pickupdescr) r.pickupdescr=o.pickupdescr; if (o.locationdescr) r.locationdescr=o.locationdescr;
    if (o.pickupactions) r.pickupactions=o.pickupactions; if (o.actions) r.actions=o.actions; od[id]=r;
  });
  const ed = { mapdata: { width: state.mapWidth, height: state.mapHeight, startinglocation: state.startingLocation, startinginventory: "" }, introduction: { output: state.introduction } };
  Object.entries(state.events).sort(([a],[b])=>+a-+b).forEach(([id,ev]) => { ed[id] = { name: ev.name, actions: ev.actions }; });
  ed.ending = { requiredEvents: state.ending.requiredEvents, targetLocation: state.ending.targetLocation, output: state.ending.output };
  return { "map.ini": serializeIni(md), "objects.ini": serializeIni(od), "events.ini": serializeIni(ed) };
}

// ── Design tokens — explicit values, no CSS variables ─────────────────────────
const C = {
  bg0:      "#f5f4f2",   // page / deepest surface
  bg1:      "#eeecea",   // raised surface / input bg
  bg2:      "#ffffff",   // card / panel
  border:   "rgba(0,0,0,0.10)",
  border2:  "rgba(0,0,0,0.18)",
  text:     "#1a1917",
  muted:    "#6b6963",
  faint:    "#a09c97",
  accent:   "#185fa5",
  accentBg: "#e6f1fb",
  accentBd: "#85b7eb",
  danger:   "#a32d2d",
  dangerBg: "#fcebeb",
  dangerBd: "#f09595",
  success:  "#3b6d11",
  successBg:"#eaf3de",
  mono:     "'Courier New', Courier, monospace",
  sans:     "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  radSm:    "6px",
  radMd:    "8px",
  radLg:    "12px",
};

// ── Clipboard helper (works without navigator.clipboard permission) ────────────
function copyToClipboard(text) {
  // Try modern API first
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).catch(() => fallback(text));
  }
  return fallback(text);
}
function fallback(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  // eslint-disable-next-line no-unused-vars
  try { document.execCommand("copy"); } catch(e) { /* empty */ }
  document.body.removeChild(ta);
  return Promise.resolve();
}

// ── Primitives ────────────────────────────────────────────────────────────────
const inputStyle = {
  background: C.bg1, border: `1px solid ${C.border2}`, borderRadius: C.radMd,
  padding: "6px 10px", color: C.text, outline: "none",
  fontFamily: C.sans, fontSize: 13, boxSizing: "border-box",
};
const monoInputStyle = { ...inputStyle, fontFamily: C.mono, fontSize: 12 };

function Label({ children, mono }) {
  return <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5, fontFamily: mono ? C.mono : C.sans }}>{children}</div>;
}
function FieldGroup({ label, mono, children }) {
  return <div style={{ marginBottom: 14 }}><Label mono={mono}>{label}</Label>{children}</div>;
}
function TInput({ value, onChange, placeholder, mono, small, type = "text" }) {
  const s = mono ? monoInputStyle : inputStyle;
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                style={{ ...s, width: "100%", fontSize: small ? 12 : 13 }} />;
}
function TArea({ value, onChange, rows = 3, mono, placeholder }) {
  return <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder}
                   style={{ ...(mono ? monoInputStyle : inputStyle), width: "100%", resize: "vertical", lineHeight: 1.5 }} />;
}

const btnBase = { border: `1px solid ${C.border2}`, borderRadius: C.radMd, cursor: "pointer", fontFamily: C.sans, whiteSpace: "nowrap", lineHeight: 1 };
function Btn({ children, onClick, variant = "default", small, full }) {
  const vs = {
    default: { background: C.bg1, color: C.text, borderColor: C.border2 },
    accent:  { background: C.accentBg, color: C.accent, borderColor: C.accentBd },
    danger:  { background: C.dangerBg, color: C.danger, borderColor: C.dangerBd },
  };
  const v = vs[variant] || vs.default;
  return <button onClick={onClick} style={{ ...btnBase, ...v, fontSize: small ? 11 : 13, padding: small ? "3px 9px" : "6px 14px", width: full ? "100%" : undefined }}>{children}</button>;
}

function CopyBtn({ content, small }) {
  const [state, setState] = useState("idle"); // idle | ok | err
  function doCopy() {
    copyToClipboard(content)
        .then(() => { setState("ok"); setTimeout(() => setState("idle"), 1800); })
        .catch(() => { setState("err"); setTimeout(() => setState("idle"), 2500); });
  }
  const label = state === "ok" ? "Copied!" : state === "err" ? "Select all & copy manually" : "Copy";
  const variant = state === "ok" ? "accent" : state === "err" ? "danger" : "default";
  return <Btn small={small} variant={variant} onClick={doCopy}>{label}</Btn>;
}

function Tag({ children, onRemove }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, background: C.bg1, border: `1px solid ${C.border}`, borderRadius: C.radSm, padding: "2px 8px", marginRight: 4, marginBottom: 4, color: C.text, fontFamily: C.mono }}>
    {children}{onRemove && <span onClick={onRemove} style={{ cursor: "pointer", color: C.muted, fontSize: 14, lineHeight: 1 }}>×</span>}
  </span>;
}
function SectionHead({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", paddingBottom: 8, marginBottom: 14, borderBottom: `1px solid ${C.border}` }}>{children}</div>;
}
function Card({ children, style }) {
  return <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: C.radLg, padding: "1.1rem 1.25rem", ...style }}>{children}</div>;
}
function Pill({ children, color = "gray" }) {
  const cs = {
    green: { bg: C.successBg, color: C.success, bd: "#c0dd97" },
    blue:  { bg: C.accentBg,  color: C.accent,  bd: C.accentBd },
    red:   { bg: C.dangerBg,  color: C.danger,   bd: C.dangerBd },
    gray:  { bg: C.bg1,       color: C.muted,    bd: C.border2 },
  };
  const c = cs[color] || cs.gray;
  return <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: c.bg, color: c.color, border: `1px solid ${c.bd}`, letterSpacing: "0.04em", textTransform: "uppercase" }}>{children}</span>;
}
function Divider() { return <div style={{ borderTop: `1px solid ${C.border}`, margin: "14px 0" }} />; }
function MonoBadge({ children }) {
  return <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, background: C.bg0, border: `1px solid ${C.border2}`, borderRadius: C.radSm, padding: "2px 8px" }}>{children}</span>;
}
function StatChip({ label, value }) {
  return <div style={{ display: "flex", alignItems: "baseline", gap: 5, padding: "4px 12px", background: C.bg1, border: `1px solid ${C.border}`, borderRadius: C.radMd }}>
    <span style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 700, color: C.text }}>{value}</span>
    <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
  </div>;
}

// ── Map Grid ──────────────────────────────────────────────────────────────────
function MapGrid({ state, selectedId, onSelect, onToggleLocation }) {
  const { mapWidth, mapHeight, locations, startingLocation, ending } = state;
  const cells = [];
  for (let row = mapHeight - 1; row >= 0; row--) {
    for (let col = 0; col < mapWidth; col++) {
      const id = String(xyToGridId(col, row, mapWidth));
      const loc = locations[id];
      const isSel = selectedId === id;
      const isStart = +id === +startingLocation;
      const isEnd = +id === +ending.targetLocation;
      cells.push(
          <div key={id} onClick={() => onSelect(id)} onDoubleClick={() => onToggleLocation(id)}
               title={`Cell ${id}${loc ? ": " + loc.description?.slice(0,50) : " (empty — double-click to create)"}`}
               style={{
                 width: 54, height: 54, boxSizing: "border-box", cursor: "pointer", position: "relative",
                 border: isSel ? `2px solid ${C.accentBd}` : `1px solid ${loc ? C.border2 : C.border}`,
                 borderRadius: C.radMd,
                 background: isSel ? C.accentBg : loc ? C.bg1 : "transparent",
                 display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
               }}>
            <span style={{ fontSize: 10, color: isSel ? C.accent : loc ? C.muted : C.faint, fontFamily: C.mono, lineHeight: 1 }}>{id}</span>
            {loc && <div style={{ display: "flex", gap: 2, marginTop: 3, flexWrap: "wrap", justifyContent: "center" }}>
              {DIRS.map(d => loc.directions.includes(d) && <span key={d} style={{ fontSize: 9, color: isSel ? C.accent : C.muted }}>{DIR_ARROWS[d]}</span>)}
            </div>}
            {isStart && <span style={{ position: "absolute", top: 2, right: 3, fontSize: 8, color: C.success, fontWeight: 700, fontFamily: C.mono }}>S</span>}
            {isEnd   && <span style={{ position: "absolute", bottom: 2, right: 3, fontSize: 8, color: C.danger, fontWeight: 700, fontFamily: C.mono }}>E</span>}
            {loc?.requireditem && <span style={{ position: "absolute", top: 1, left: 3, fontSize: 9 }}>🔒</span>}
            {loc?.objects?.length > 0 && <span style={{ position: "absolute", bottom: 2, left: 3, fontSize: 8, color: C.faint, fontFamily: C.mono }}>×{loc.objects.length}</span>}
          </div>
      );
    }
  }
  return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${mapWidth}, 54px)`, gap: 3 }}>{cells}</div>
        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 10, color: C.faint }}>
          <span style={{ color: C.success, fontFamily: C.mono }}>S</span><span>start</span>
          <span style={{ color: C.danger, fontFamily: C.mono }}>E</span><span>end</span>
          <span style={{ fontFamily: C.mono }}>×n</span><span>objects</span>
          <span>↑→↓← exits</span>
          <span style={{ marginLeft: 4 }}>double-click to create / remove</span>
        </div>
      </div>
  );
}

// ── Location Editor ───────────────────────────────────────────────────────────
function LocationEditor({ locId, loc, state, onChange, onDelete }) {
  const [newObj, setNewObj] = useState("");
  if (!loc) return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, gap: 8, color: C.faint, fontSize: 13, fontFamily: C.sans }}>
        <div style={{ fontSize: 32, opacity: 0.15 }}>⬚</div>
        <div>Select a cell to edit it</div>
        <div style={{ fontSize: 11 }}>double-click an empty cell to create a location</div>
      </div>
  );
  const update = (k, v) => onChange({ ...loc, [k]: v });
  const toggleDir = d => update("directions", loc.directions.includes(d) ? loc.directions.filter(x=>x!==d) : [...loc.directions, d]);
  const addObj = () => { const t = newObj.trim(); if (t && !loc.objects.includes(t)) { update("objects", [...loc.objects, t]); setNewObj(""); } };
  const objectNames = Object.values(state.objects).map(o => o.name).filter(Boolean);

  return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MonoBadge>loc:{locId}</MonoBadge>
            {+locId === +state.startingLocation && <Pill color="green">Start</Pill>}
            {+locId === +state.ending.targetLocation && <Pill color="red">End</Pill>}
          </div>
          <Btn variant="danger" small onClick={onDelete}>Remove</Btn>
        </div>

        <FieldGroup label="Description">
          <TArea value={loc.description} onChange={v => update("description", v)} rows={3} placeholder="Describe what the player sees. Use _ for line breaks." />
        </FieldGroup>

        <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 14 }}>
          <FieldGroup label="Exits">
            <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "10px 12px", background: C.bg0, border: `1px solid ${C.border}`, borderRadius: C.radMd }}>
              {DIRS.map(d => (
                  <label key={d} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", color: loc.directions.includes(d) ? C.text : C.muted, fontFamily: C.sans }}>
                    <input type="checkbox" checked={loc.directions.includes(d)} onChange={() => toggleDir(d)} />
                    <span style={{ fontFamily: C.mono, width: 16, textAlign: "center" }}>{DIR_ARROWS[d]}</span>
                    <span>{d}</span>
                  </label>
              ))}
            </div>
          </FieldGroup>

          <FieldGroup label="Objects in this room">
            <div style={{ minHeight: 80, padding: "8px 10px", background: C.bg0, border: `1px solid ${C.border}`, borderRadius: C.radMd, marginBottom: 6 }}>
              {loc.objects.length === 0
                  ? <span style={{ fontSize: 12, color: C.faint }}>none</span>
                  : loc.objects.map(o => <Tag key={o} onRemove={() => update("objects", loc.objects.filter(x=>x!==o))}>{o}</Tag>)}
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              <input value={newObj} onChange={e => setNewObj(e.target.value)} placeholder="add object…"
                     onKeyDown={e => e.key === "Enter" && addObj()} list="obj-names"
                     style={{ ...monoInputStyle, flex: 1, fontSize: 12 }} />
              <datalist id="obj-names">{objectNames.map(n => <option key={n} value={n} />)}</datalist>
              <Btn small onClick={addObj}>+</Btn>
            </div>
          </FieldGroup>
        </div>

        <Divider />
        <SectionHead>Interaction — required item</SectionHead>
        <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 14 }}>
          <FieldGroup label="Required item">
            <TInput value={loc.requireditem} onChange={v => update("requireditem", v)} placeholder="e.g. key" mono small />
          </FieldGroup>
          <FieldGroup label="Actions on use" mono>
            <TArea value={loc.actions} onChange={v => update("actions", v)} rows={2} mono placeholder="output:You use the key...;exit:east;editlocation:description:..." />
          </FieldGroup>
        </div>
      </div>
  );
}

// ── Object Editor ─────────────────────────────────────────────────────────────
function ObjectEditor({ objects, onChange }) {
  const [selectedId, setSelectedId] = useState(null);
  const [newName, setNewName] = useState("");
  const ids = Object.keys(objects).map(Number).sort((a,b)=>a-b).map(String);
  const obj = selectedId ? objects[selectedId] : null;
  const update = (k, v) => onChange({ ...objects, [selectedId]: { ...objects[selectedId], [k]: v } });

  function addObject() {
    const t = newName.trim(); if (!t) return;
    const newId = String(ids.length ? Math.max(...ids.map(Number)) + 1 : 1);
    onChange({ ...objects, [newId]: { name: t, examine: "", pickup: "false", pickupdescr: "", locationdescr: "", pickupactions: "", actions: "" } });
    setSelectedId(newId); setNewName("");
  }
  function deleteObject(id) {
    const next = { ...objects }; delete next[id]; onChange(next); if (selectedId === id) setSelectedId(null);
  }

  return (
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 0, minHeight: 400 }}>
        <div style={{ borderRight: `1px solid ${C.border}`, paddingRight: 14, marginRight: 16 }}>
          <SectionHead>Objects ({ids.length})</SectionHead>
          <div style={{ maxHeight: 380, overflowY: "auto", marginBottom: 10 }}>
            {ids.map(id => (
                <div key={id} onClick={() => setSelectedId(id)} style={{
                  padding: "6px 10px", borderRadius: C.radMd, cursor: "pointer", marginBottom: 2,
                  background: selectedId === id ? C.accentBg : "transparent",
                  border: `1px solid ${selectedId === id ? C.accentBd : "transparent"}`,
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{ fontSize: 10, color: C.faint, fontFamily: C.mono, minWidth: 18 }}>{id}</span>
                  <span style={{ fontSize: 13, color: selectedId === id ? C.accent : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, fontFamily: C.sans }}>
                {objects[id].name || <em style={{ opacity: 0.4 }}>unnamed</em>}
              </span>
                  {objects[id].pickup === "true" && <span style={{ fontSize: 9, color: C.success }}>◆</span>}
                </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="name…"
                   onKeyDown={e => e.key === "Enter" && addObject()}
                   style={{ ...inputStyle, flex: 1, fontSize: 12 }} />
            <Btn small variant="accent" onClick={addObject}>+</Btn>
          </div>
        </div>

        {obj ? (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <MonoBadge>obj:{selectedId}</MonoBadge>
                  {obj.pickup === "true" && <Pill color="blue">pickable</Pill>}
                </div>
                <Btn variant="danger" small onClick={() => deleteObject(selectedId)}>Delete</Btn>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 12 }}>
                <FieldGroup label="Name"><TInput value={obj.name} onChange={v => update("name", v)} /></FieldGroup>
                <FieldGroup label="Can pick up">
                  <select value={obj.pickup} onChange={e => update("pickup", e.target.value)}
                          style={{ ...inputStyle, width: "100%" }}>
                    <option value="true">Yes</option><option value="false">No</option>
                  </select>
                </FieldGroup>
              </div>
              <FieldGroup label="Examine text">
                <TArea value={obj.examine} onChange={v => update("examine", v)} rows={2} placeholder="What the player reads when they examine this object." />
              </FieldGroup>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <FieldGroup label="Pickup fail text">
                  <TArea value={obj.pickupdescr} onChange={v => update("pickupdescr", v)} rows={2} placeholder="Why can't they pick it up?" />
                </FieldGroup>
                <FieldGroup label="Location description">
                  <TArea value={obj.locationdescr} onChange={v => update("locationdescr", v)} rows={2} placeholder="There's a key on the floor." />
                </FieldGroup>
              </div>
              <Divider />
              <SectionHead>Actions</SectionHead>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <FieldGroup label="On pickup" mono>
                  <TArea value={obj.pickupactions} onChange={v => update("pickupactions", v)} rows={2} mono placeholder="output:It crumbles.;destroy:letter" />
                </FieldGroup>
                <FieldGroup label="On examine" mono>
                  <TArea value={obj.actions} onChange={v => update("actions", v)} rows={2} mono placeholder="exit:north;editlocation:..." />
                </FieldGroup>
              </div>
            </div>
        ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: C.faint, fontSize: 13, gap: 6, fontFamily: C.sans }}>
              <div style={{ fontSize: 28, opacity: 0.15 }}>◇</div>
              <div>Select an object or add one</div>
            </div>
        )}
      </div>
  );
}

// ── Meta editor ───────────────────────────────────────────────────────────────
function MetaEditor({ state, onChange }) {
  const [newEvName, setNewEvName] = useState("");
  const update = (k, v) => onChange({ ...state, [k]: v });
  const updateEnding = (k, v) => onChange({ ...state, ending: { ...state.ending, [k]: v } });
  const addEvent = () => {
    const t = newEvName.trim(); if (!t) return;
    const maxId = Object.keys(state.events).map(Number).reduce((a,b)=>Math.max(a,b), 0);
    onChange({ ...state, events: { ...state.events, [String(maxId+1)]: { name: t, actions: "" } } });
    setNewEvName("");
  };
  const removeEvent = id => { const e = { ...state.events }; delete e[id]; onChange({ ...state, events: e }); };
  const updateEvent = (id, k, v) => onChange({ ...state, events: { ...state.events, [id]: { ...state.events[id], [k]: v } } });

  return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
        <div>
          <SectionHead>Map settings</SectionHead>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
            {[["Width","mapWidth"],["Height","mapHeight"],["Start ID","startingLocation"]].map(([label, key]) => (
                <FieldGroup key={key} label={label}>
                  <input type="number" value={state[key]} min={1} max={20}
                         onChange={e => update(key, +e.target.value)}
                         style={{ ...inputStyle, width: "100%" }} />
                </FieldGroup>
            ))}
          </div>
          <SectionHead>Introduction</SectionHead>
          <TArea value={state.introduction} onChange={v => update("introduction", v)} rows={5} placeholder="Text shown at game start. Use _ for line breaks." />
          <div style={{ marginTop: 20 }}>
            <SectionHead>Ending</SectionHead>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 10, marginBottom: 10 }}>
              <FieldGroup label="Required events (space-separated)">
                <TInput value={state.ending.requiredEvents} onChange={v => updateEnding("requiredEvents", v)} placeholder="plankused opendoor" mono small />
              </FieldGroup>
              <FieldGroup label="Target loc">
                <TInput value={state.ending.targetLocation} onChange={v => updateEnding("targetLocation", v)} placeholder="10" mono small />
              </FieldGroup>
            </div>
            <TArea value={state.ending.output} onChange={v => updateEnding("output", v)} rows={4} placeholder="Text shown when the player wins." />
          </div>
        </div>

        <div>
          <SectionHead>Event flags ({Object.keys(state.events).length})</SectionHead>
          <div style={{ background: C.bg0, border: `1px solid ${C.border}`, borderRadius: C.radMd, padding: "10px 12px", marginBottom: 12, minHeight: 64 }}>
            {Object.entries(state.events).sort(([a],[b])=>+a-+b).map(([id, ev]) => (
                <div key={id} style={{ display: "grid", gridTemplateColumns: "24px 1fr 1fr 26px", gap: 6, marginBottom: 7, alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: C.faint, fontFamily: C.mono, textAlign: "right" }}>{id}</span>
                  <input value={ev.name} onChange={e => updateEvent(id,"name",e.target.value)} placeholder="event name"
                         style={{ ...monoInputStyle, fontSize: 12 }} />
                  <input value={ev.actions} onChange={e => updateEvent(id,"actions",e.target.value)} placeholder="actions (optional)"
                         style={{ ...monoInputStyle, fontSize: 12 }} />
                  <button onClick={() => removeEvent(id)} style={{ fontSize: 13, background: C.dangerBg, color: C.danger, border: `1px solid ${C.dangerBd}`, borderRadius: C.radSm, cursor: "pointer", padding: "2px 0", lineHeight: 1 }}>×</button>
                </div>
            ))}
            {Object.keys(state.events).length === 0 && <span style={{ fontSize: 12, color: C.faint, fontFamily: C.sans }}>No event flags defined</span>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={newEvName} onChange={e => setNewEvName(e.target.value)} placeholder="new event name…"
                   onKeyDown={e => e.key === "Enter" && addEvent()}
                   style={{ ...inputStyle, flex: 1, fontSize: 13 }} />
            <Btn variant="accent" small onClick={addEvent}>Add event</Btn>
          </div>
        </div>
      </div>
  );
}

// ── Import modal ──────────────────────────────────────────────────────────────
function ImportModal({ onImport, onClose }) {
  const [mapText, setMapText] = useState(""), [objText, setObjText] = useState(""), [evtText, setEvtText] = useState(""), [error, setError] = useState("");
  function readFile(setFn) {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".ini,.txt";
    inp.onchange = e => { const r = new FileReader(); r.onload = ev => setFn(ev.target.result); r.readAsText(e.target.files[0]); };
    inp.click();
  }
  function doImport() {
    try {
      onImport(loadFromInis(mapText||"[1]\ndescription=empty", objText||"[0]\nname=default\nexamine=nothing", evtText||"[mapdata]\nwidth=5\nheight=5\nstartinglocation=1"));
      onClose();
    } catch(e) { setError(String(e)); }
  }
  return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
           onClick={e => e.target === e.currentTarget && onClose()}>
        <div style={{ background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: C.radLg, padding: "1.5rem", width: 520, maxWidth: "95vw", fontFamily: C.sans }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 3, color: C.text }}>Import .ini files</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Paste content or browse for each file. All three are optional.</div>
          {[["map.ini", mapText, setMapText], ["objects.ini", objText, setObjText], ["events.ini", evtText, setEvtText]].map(([name, val, set]) => (
              <div key={name} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <span style={{ fontSize: 11, fontFamily: C.mono, color: C.muted }}>{name}</span>
                  <Btn small onClick={() => readFile(set)}>Browse…</Btn>
                </div>
                <TArea value={val} onChange={set} rows={2} mono placeholder={`Paste ${name} here…`} />
              </div>
          ))}
          {error && <div style={{ color: C.danger, fontSize: 12, marginBottom: 10, fontFamily: C.mono }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn variant="accent" onClick={doImport}>Import</Btn>
          </div>
        </div>
      </div>
  );
}

// ── Export panel ──────────────────────────────────────────────────────────────
function ExportPanel({ state, onClose }) {
  const files = exportToInis(state);
  return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
           onClick={e => e.target === e.currentTarget && onClose()}>
        <div style={{ background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: C.radLg, padding: "1.5rem", width: 580, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", fontFamily: C.sans }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 3, color: C.text }}>Export .ini files</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Use Copy to copy each file's content, then paste into the corresponding .ini file. Clicking the text area selects all.</div>
          {Object.entries(files).map(([name, content]) => (
              <div key={name} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <span style={{ fontSize: 11, fontFamily: C.mono, color: C.muted }}>{name}</span>
                  <CopyBtn content={content} small />
                </div>
                <textarea readOnly value={content} rows={6} onClick={e => e.target.select()}
                          style={{ width: "100%", boxSizing: "border-box", fontFamily: C.mono, fontSize: 11, background: C.bg0, border: `1px solid ${C.border}`, borderRadius: C.radMd, padding: "8px 10px", color: C.muted, resize: "vertical", cursor: "text", outline: "none" }} />
              </div>
          ))}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Btn onClick={onClose}>Close</Btn>
          </div>
        </div>
      </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [state, setState] = useState(defaultState);
  const [tab, setTab] = useState("map");
  const [selectedCellId, setSelectedCellId] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);

  function toggleLocation(id) {
    if (state.locations[id]) {
      const next = { ...state.locations }; delete next[id];
      setState(s => ({ ...s, locations: next }));
      if (selectedCellId === id) setSelectedCellId(null);
    } else {
      setState(s => ({ ...s, locations: { ...s.locations, [id]: { description: "", directions: [], objects: [], requireditem: "", actions: "" } } }));
      setSelectedCellId(id);
    }
  }

  const locCount = Object.keys(state.locations).length;
  const objCount = Object.keys(state.objects).length;
  const evtCount = Object.keys(state.events).length;

  return (
      <div style={{ fontFamily: C.sans, color: C.text, background: C.bg0, minHeight: "100vh", padding: "1.25rem 1.5rem" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 2, color: C.text }}>Text adventure editor</div>
              <div style={{ fontSize: 12, color: C.faint, fontFamily: C.mono }}>ini-based world editor</div>
            </div>
            <div style={{ display: "flex", gap: 8, paddingTop: 3 }}>
              <Btn onClick={() => setShowImport(true)}>Import .ini</Btn>
              <Btn variant="accent" onClick={() => setShowExport(true)}>Export .ini</Btn>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            <StatChip value={`${state.mapWidth}×${state.mapHeight}`} label="grid" />
            <StatChip value={locCount} label={locCount === 1 ? "location" : "locations"} />
            <StatChip value={objCount} label={objCount === 1 ? "object" : "objects"} />
            <StatChip value={evtCount} label={evtCount === 1 ? "event flag" : "event flags"} />
          </div>

          {/* Tab bar */}
          <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 16, background: C.bg2, borderRadius: `${C.radLg} ${C.radLg} 0 0`, padding: "0 4px" }}>
            {[["map","Map"], ["objects","Objects"], ["meta","Story & Events"]].map(([key, label]) => {
              const active = tab === key;
              return <button key={key} onClick={() => setTab(key)} style={{ padding: "10px 18px", fontSize: 13, cursor: "pointer", background: "none", border: "none", borderBottom: active ? `2px solid ${C.accentBd}` : "2px solid transparent", color: active ? C.accent : C.muted, fontWeight: active ? 600 : 400, fontFamily: C.sans, transition: "color 0.1s" }}>{label}</button>;
            })}
          </div>

          {/* Map tab */}
          {tab === "map" && (
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 14, alignItems: "start" }}>
                <Card style={{ padding: "1rem 1rem 0.85rem" }}>
                  <MapGrid state={state} selectedId={selectedCellId} onSelect={id => setSelectedCellId(id)} onToggleLocation={toggleLocation} />
                  <Divider />
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.muted, fontFamily: C.sans }}>
                    Starting location
                    <input type="number" value={state.startingLocation} min={1}
                           onChange={e => setState(s => ({ ...s, startingLocation: +e.target.value }))}
                           style={{ ...monoInputStyle, width: 52, fontSize: 12 }} />
                  </label>
                </Card>
                <Card style={{ minHeight: 340 }}>
                  <LocationEditor
                      locId={selectedCellId}
                      loc={selectedCellId ? state.locations[selectedCellId] : null}
                      state={state}
                      onChange={val => setState(s => ({ ...s, locations: { ...s.locations, [selectedCellId]: val } }))}
                      onDelete={() => toggleLocation(selectedCellId)}
                  />
                </Card>
              </div>
          )}

          {tab === "objects" && <Card><ObjectEditor objects={state.objects} onChange={objs => setState(s => ({ ...s, objects: objs }))} /></Card>}
          {tab === "meta" && <Card><MetaEditor state={state} onChange={setState} /></Card>}

          {showImport && <ImportModal onImport={s => setState(s)} onClose={() => setShowImport(false)} />}
          {showExport && <ExportPanel state={state} onClose={() => setShowExport(false)} />}
        </div>
      </div>
  );
}