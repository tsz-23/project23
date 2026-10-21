/* Project 23 core: Firebase auth + Firestore sync, themes, header, settings, notifications, ICS + recurrence engine */
(function(){
"use strict";
const DEFAULT_PAGES = [
  { id:"calendar",  name:"Calendar",   href:"calendar.html",  icon:"cal",   desc:"Bring in your iPhone calendar and make every event your own." },
  { id:"todo",      name:"To-do list", short:"To-do", href:"todo.html", icon:"todo", desc:"Reminders with dates, categories and tags." },
  { id:"focus",     name:"Focus",      href:"focus.html",     icon:"plane", desc:"Pick a seat, board, and stay focused until you land." },
  { id:"notes",     name:"Notes",      href:"notes.html",     icon:"note",  desc:"Write, format and keep everything in one place." },
  { id:"countdown", name:"Time Until", href:"countdown.html", icon:"timer", desc:"Count down to the dates that matter." },
  { id:"weather",   name:"Weather",    href:"weather.html",   icon:"cloud", desc:"Forecasts, air quality, sun and moon for your places." },
  { id:"pico", name:"PICO AI", href:"pico.html", icon:"sparkle", desc:"Your AI chat operator powered by Gemini." },
  { id:"project", name:"Project Library", href:"library.html", icon:"folder", desc:"All previous projects leading up to Project 23" },
  { id: "so-thats-how", name: "So That's How", href: "so-thats-how.html", icon: "lightbulb", desc: "Everyday tech and household science explained visually" }
];
const CFG = Object.assign({ name:"Project 23", code:"PW0226", version:"v1.0", shortcutUrl:"", creator:"" }, window.P23||{});
const APP = CFG.name;
const DB = window.DB = { APP, cfg:CFG };
DB.pages = (Array.isArray(CFG.pages)&&CFG.pages.length?CFG.pages:DEFAULT_PAGES).map(p=>Object.assign({icon:"note",desc:""},p,{short:p.short||p.name}));
const DEBUG = (()=>{ try{ return localStorage.getItem("p23.debug")==="1"; }catch{ return false; } })();
const dbg = (...a)=>{ if(DEBUG) console.warn("[P23]",...a); };   // silent unless a developer turns it on
const $ = (s,r=document)=>r.querySelector(s);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* =====================================================================
   1. STORAGE: cloud keys live in Firestore (cached in memory), the rest in localStorage
   ===================================================================== */
const CLOUD = {
  "p23.events":       { kind:"col", name:"events"  },
  "p23.todos":        { kind:"col", name:"todos"   },
  "p23.flightLog":    { kind:"col", name:"flights" },
  "p23.activeFlight": { kind:"doc", name:"activeFlight" },
  "p23.notes":        { kind:"col", name:"notes" },
  "p23.countdowns":   { kind:"col", name:"countdowns" },
  "p23.weather":      { kind:"doc", name:"weather" },
  "p23.home":         { kind:"doc", name:"home" }
};
const mem = {};
DB.get = (k,d)=>{
  if(CLOUD[k]){ const v = mem[k]; return v===undefined ? d : v; }
  try{ const v = localStorage.getItem(k); return v==null ? d : JSON.parse(v); }catch{ return d; }
};
DB.set = (k,v)=>{
  if(CLOUD[k]){ mem[k] = v; queue(k); return; }
  try{ localStorage.setItem(k, JSON.stringify(v)); }catch{}
};
DB.del = k=>DB.set(k, CLOUD[k] && CLOUD[k].kind==="col" ? [] : null);
DB.uid = ()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
DB.esc = s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* ---------- settings + theme (local copy applied instantly, cloud copy wins after sign-in) ---------- */
const DEFAULTS = { theme:"space", notifyOn:false, notifyEvents:true, notifyTodos:true, notifyFlight:true, sound:true, notifSound:true, volume:.6, lite:false, pinD:null, pinP:null };
DB.settings = Object.assign({}, DEFAULTS, DB.get("p23.settings", {}));
let settingsTimer = null;
DB.saveSettings = ()=>{
  DB.set("p23.settings", DB.settings);
  if(!baseRef) return;
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(()=>baseRef.set({settings:DB.settings},{merge:true}).catch(()=>{}), 600);
};
function applyTheme(t){
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name="theme-color"]');
  if(m) m.content = ({light:"#f3f0ff",dark:"#0b0d19",space:"#05030f"})[t];
  document.querySelectorAll(".theme").forEach(b=>b.setAttribute("aria-pressed", b.dataset.pick===t));
}
DB.setTheme = t=>{ DB.settings.theme = t; DB.saveSettings(); applyTheme(t); document.dispatchEvent(new CustomEvent("themechange",{detail:t})); };
applyTheme(DB.settings.theme);
const applyLite = ()=>document.documentElement.classList.toggle("lite", !!DB.settings.lite);
applyLite();

/* ---------- constants + helpers ---------- */
DB.palette = ["#6c5ce7","#ff5c9d","#00b8c8","#12b886","#ffb020","#f03e5f","#4c8dff","#8d93b8"];
DB.fonts = [
  ["Default",""],["Rounded",'Fredoka,"Arial Rounded MT Bold",sans-serif'],["Serif",'"Playfair Display",Georgia,serif'],
  ["Handwritten",'Caveat,"Bradley Hand",cursive'],["Mono",'"Space Mono",Menlo,monospace'],["Bold display",'"Bricolage Grotesque",sans-serif']
];
DB.ALERTS = [[-1,"No notification"],[0,"At the time"],[5,"5 minutes before"],[10,"10 minutes before"],[15,"15 minutes before"],[30,"30 minutes before"],[60,"1 hour before"],[1440,"1 day before"]];
DB.dayKey = d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
DB.startOfDay = d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
DB.toInputDate = ms=>DB.dayKey(new Date(ms));
DB.toInputTime = ms=>{ const d=new Date(ms); return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); };
DB.fromInputs = (date,time)=>{ const [y,m,d]=date.split("-").map(Number); const [h,mi]=(time||"00:00").split(":").map(Number); return new Date(y,m-1,d,h,mi).getTime(); };
DB.fmtTime = ms=>new Date(ms).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});

/* ---------- ICS parsing ---------- */
const unfold = t=>t.replace(/\r\n/g,"\n").replace(/\n[ \t]/g,"");
DB.unescapeText = s=>s.replace(/\\n/gi,"\n").replace(/\\,/g,",").replace(/\\;/g,";").replace(/\\\\/g,"\\");
function parseICSDate(value, params){
  const allDay = /VALUE=DATE(?!-)/.test(params) || /^\d{8}$/.test(value);
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if(!m) return null;
  let d;
  if(allDay) d = new Date(+m[1],+m[2]-1,+m[3]);
  else if(m[7]) d = new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0)));
  else d = new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0));
  return { ms:d.getTime(), allDay };
}
DB.parseICSDate = parseICSDate;
function triggerMinutes(body){
  const m = body.match(/^TRIGGER[^:\n]*:(.*)$/mi); if(!m) return null;
  const t = m[1].trim().match(/^(-?)P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if(!t) return null;
  const mins = (+(t[2]||0))*10080+(+(t[3]||0))*1440+(+(t[4]||0))*60+(+(t[5]||0));
  return t[1]==="-" ? mins : 0;
}
DB.parseICSEvents = function(text){
  const out = [], overrides = [];
  for(const b of unfold(text).split("BEGIN:VEVENT").slice(1)){
    const body = b.split("END:VEVENT")[0];
    const ev = { id:DB.uid(), title:"(No title)", rrule:null, exdates:[], location:"", notes:"", color:DB.palette[2], font:"", uid:"" };
    for(const line of body.split("\n")){
      const i = line.indexOf(":"); if(i<0) continue;
      const left = line.slice(0,i), val = line.slice(i+1).trim();
      const name = left.split(";")[0].toUpperCase(), params = left.slice(name.length).toUpperCase();
      if(name==="SUMMARY") ev.title = DB.unescapeText(val);
      else if(name==="LOCATION") ev.location = DB.unescapeText(val).replace(/\n/g,", ");
      else if(name==="DESCRIPTION" && !ev.notes) ev.notes = DB.unescapeText(val);
      else if(name==="UID") ev.uid = val;
      else if(name==="DTSTART"){ const p=parseICSDate(val,params); if(p){ ev.start=p.ms; ev.allDay=p.allDay; } }
      else if(name==="DTEND"){ const p=parseICSDate(val,params); if(p) ev.end=p.ms; }
      else if(name==="RRULE") ev.rrule = val;
      else if(name==="EXDATE") val.split(",").forEach(v=>{ const p=parseICSDate(v,params); if(p) ev.exdates.push(DB.dayKey(new Date(p.ms))); });
      else if(name==="RECURRENCE-ID"){ const p=parseICSDate(val,params); if(p) ev.recurrenceId = DB.dayKey(new Date(p.ms)); }
    }
    if(ev.start==null) continue;
    ev.dur = ev.end!=null ? Math.max(0,ev.end-ev.start) : (ev.allDay?86400000:0);
    delete ev.end;
    const trig = triggerMinutes(body);
    ev.alert = trig!=null ? trig : (ev.allDay ? -1 : 0);
    (ev.recurrenceId ? overrides : out).push(ev);
  }
  overrides.forEach(o=>{ const parent = out.find(e=>e.uid && e.uid===o.uid); if(parent) parent.exdates.push(o.recurrenceId); out.push(o); });
  return out;
};

/* ---------- recurrence engine (weeks start on Monday) ---------- */
const DAYS = ["SU","MO","TU","WE","TH","FR","SA"];
DB.occurrences = function(ev, rangeStart, rangeEnd){
  const starts = [], s = new Date(ev.start);
  if(!ev.rrule) starts.push(ev.start);
  else {
    const r = Object.fromEntries(ev.rrule.split(";").map(p=>p.split("=")));
    const interval = +(r.INTERVAL||1), count = r.COUNT ? +r.COUNT : Infinity;
    let until = Infinity;
    if(r.UNTIL){ const p = parseICSDate(r.UNTIL.replace(/Z$/,""),""); if(p) until = p.ms+86400000; }
    const limit = Math.min(until, rangeEnd.getTime());
    let n = 0, guard = 0;
    const push = t=>{ if(t>=ev.start && t<limit && n<count){ starts.push(t); n++; } };
    if(r.FREQ==="WEEKLY" && r.BYDAY){
      const want = r.BYDAY.split(",").map(x=>DAYS.indexOf(x.slice(-2)));
      const base = DB.startOfDay(s); base.setDate(base.getDate()-((base.getDay()+6)%7));   // Monday of the start week
      for(let d=DB.startOfDay(s); d.getTime()<limit && n<count && guard++<20000; d.setDate(d.getDate()+1)){
        const wk = Math.floor(Math.round((DB.startOfDay(d)-base)/86400000)/7);
        if(wk%interval===0 && want.includes(d.getDay())) push(new Date(d.getFullYear(),d.getMonth(),d.getDate(),s.getHours(),s.getMinutes()).getTime());
      }
    } else {
      for(let i=0; guard++<20000; i++){
        const d = new Date(s);
        if(r.FREQ==="DAILY") d.setDate(s.getDate()+i*interval);
        else if(r.FREQ==="WEEKLY") d.setDate(s.getDate()+i*7*interval);
        else if(r.FREQ==="MONTHLY") d.setMonth(s.getMonth()+i*interval);
        else if(r.FREQ==="YEARLY") d.setFullYear(s.getFullYear()+i*interval);
        else break;
        if(d.getTime()>=limit || n>=count) break;
        push(d.getTime());
      }
    }
  }
  const ex = ev.exdates||[], out = [];
  for(const t of starts){
    const end = t+(ev.dur||0);
    if(end<rangeStart.getTime() && t<rangeStart.getTime()) continue;
    if(t>=rangeEnd.getTime()) continue;
    if(ex.includes(DB.dayKey(new Date(t)))) continue;
    out.push({ev, start:t, end});
  }
  return out;
};
DB.loadEvents = ()=>{
  const list = DB.get("p23.events",[]);
  list.forEach(e=>{
    if(!e.id) e.id=DB.uid();
    if(e.color==null) e.color=DB.palette[2];
    if(e.font==null) e.font="";
    if(e.notes==null) e.notes="";
    if(e.alert==null) e.alert = e.allDay?-1:0;
    if(!e.exdates) e.exdates=[];
  });
  return list;
};

/* ---------- icons ---------- */
const IC = {
  bell:'<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  pin:'<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  repeat:'<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  cal:'<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  todo:'<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>',
  check:'<path d="M20 6L9 17l-5-5"/>',
  plane:'<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  trash:'<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  flag:'<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  volume:'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  tag:'<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  chevron:'<path d="M6 9l6 6 6-6"/>',
  code:'<path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/>',
  sparkle:'<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  db:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  type:'<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  more:'<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  alert:'<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'
};
DB.icon = (n,cls="ic")=>`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]||""}</svg>`;
Object.assign(IC,{
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  note:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>',
  timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
  cloud:'<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 0 1 0 9z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
  edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  x:'<path d="M18 6L6 18M6 6l12 12"/>',
  grip:'<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
  up:'<path d="M18 15l-6-6-6 6"/>', down:'<path d="M6 9l6 6 6-6"/>', left:'<path d="M15 18l-6-6 6-6"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  locate:'<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>',
  wind:'<path d="M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2"/>',
  drop:'<path d="M12 2.7s7 7.2 7 12a7 7 0 0 1-14 0c0-4.8 7-12 7-12z"/>',
  thermo:'<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/>',
  eye:'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  gauge:'<path d="M12 14l4-4"/><path d="M3.3 17a10 10 0 1 1 17.4 0"/>',
  sunrise:'<path d="M17 18a5 5 0 0 0-10 0M12 2v7M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M8 6l4-4 4 4"/>',
  sunset:'<path d="M17 18a5 5 0 0 0-10 0M12 9V2M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M16 5l-4 4-4-4"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  refresh:'<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
  quote:'<path d="M3 21c3 0 7-1 7-8V5c0-1.2-.8-2-2-2H4c-1.2 0-2 .8-2 2v6c0 1.2.8 2 2 2h4M15 21c3 0 7-1 7-8V5c0-1.2-.8-2-2-2h-4c-1.2 0-2 .8-2 2v6c0 1.2.8 2 2 2h4"/>',
  book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  lock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  indent:'<path d="M3 4h18M11 9h10M11 14h10M3 19h18M3 8l4 3-4 3z"/>',
  outdent:'<path d="M3 4h18M11 9h10M11 14h10M3 19h18M7 8l-4 3 4 3z"/>',
  hr:'<path d="M3 12h18"/><path d="M8 6l4-3 4 3M8 18l4 3 4-3"/>',
  highlight:'<path d="M9 11l-6 6v3h9l3-3"/><path d="M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  undo:'<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  redo:'<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 15-6.7L21 13"/>',
  pin2:'<path d="M12 17v5M9 3h6l-1 6 3 3H7l3-3z"/>',
  user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  library: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H9v20H6.5A2.5 2.5 0 0 1 4 19.5z"/><path d="M9 2h4v20H9z"/><path d="M13 2h2.5A2.5 2.5 0 0 1 18 4.5v15a2.5 2.5 0 0 1-2.5 2.5H13z"/><path d="M18 6l2.8-1.4a1 1 0 0 1 1.4.9v13a1 1 0 0 1-.5.9l-3.7 1.6"/>',
  lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1.3.5 2.6 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>'
});
/* "Project 23" as text in the normal font: letters ripple on hover, the digits roll in when the page loads */
DB.wordmark = ()=>{
  const L=w=>[...w].map((c,i)=>`<span class="l" style="--i:${i}">${c}</span>`).join("");
  const dg=(to,j)=>`<span class="dg" style="--j:${j}"><i style="--to:${to}">${[0,1,2,3,4,5,6,7,8,9].map(n=>`<b>${n}</b>`).join("")}</i></span>`;
  return `<span class="wm" role="img" aria-label="Project 23"><span class="wm-w" aria-hidden="true">${L("Project")}</span><span class="wm-d" aria-hidden="true">${dg(2,0)}${dg(3,1)}</span></span>`;
};

/* ---------- arriving through the page-transition wipe: start covered, reveal when ready ---------- */
let arrivalWipe=null; const arrivalAt=Date.now();
try{
  if(sessionStorage.getItem("p23.wipe")){
    sessionStorage.removeItem("p23.wipe");
    if(!reduceMotion && !DB.settings.lite){ arrivalWipe=wipeEl(true); document.documentElement.appendChild(arrivalWipe); setTimeout(()=>revealArrival(),3500); }
  }
}catch{}
function revealArrival(){
  if(!arrivalWipe) return; const w=arrivalWipe; arrivalWipe=null;
  setTimeout(()=>{
    const slab=w.querySelector(".pw-slab"), logo=w.querySelector(".pw-logo");
    logo.animate([{opacity:1,transform:"translate(-50%,-50%) scale(1)"},{opacity:0,transform:"translate(-50%,-50%) scale(1.3)"}],{duration:220,fill:"forwards"});
    slab.animate([{transform:"none"},{transform:"translateX(130vw)"}],{duration:540,delay:90,easing:"cubic-bezier(.65,0,.3,1)",fill:"forwards"}).onfinish=()=>w.remove();
  },Math.max(0,420-(Date.now()-arrivalAt)));
}

/* ---------- toast + modal ---------- */
const toastIcon = t=>t==null?"check":/^ev\|/.test(t)?"cal":/^todo\|/.test(t)?"todo":t==="landing"?"plane":"bell";
DB.toast = function(title, body, ms=6000, tag){
  let box = $("#toasts"); if(!box){ box=document.createElement("div"); box.id="toasts"; box.setAttribute("aria-live","polite"); document.body.appendChild(box); }
  const t = document.createElement("div"); t.className="toast"; t.style.setProperty("--dur",ms+"ms");
  t.innerHTML = `<span class="ti">${DB.icon(toastIcon(tag))}</span><div><b>${DB.esc(title)}</b>${body?`<span class="muted">${DB.esc(body)}</span>`:""}</div><i class="tbar"></i>`;
  box.appendChild(t);
  const kill = ()=>{ t.classList.add("out"); setTimeout(()=>t.remove(),300); };
  t.onclick = kill; setTimeout(kill, ms);
};
DB.modal = function(node, onClose){
  const ov = document.createElement("div"); ov.className="overlay";
  const box = document.createElement("div"); box.className="modal"; box.setAttribute("role","dialog"); box.setAttribute("aria-modal","true");
  box.appendChild(node); ov.appendChild(box); document.body.appendChild(ov);
  let done=false;
  const close = ()=>{ if(done) return; done=true; ov.remove(); document.removeEventListener("keydown",esc); if(onClose) onClose(); };
  const esc = e=>{ if(e.key==="Escape") close(); };
  document.addEventListener("keydown",esc);
  ov.addEventListener("mousedown",e=>{ if(e.target===ov) close(); });
  const f = box.querySelector("input,select,textarea,button"); if(f && !f.classList.contains("cs-native")) f.focus();
  return close;
};

/* Ask what to do when imported items already exist. Resolves "merge", "both" or "cancel". */
DB.confirmMerge = function(kind, dupes, total){
  return new Promise(res=>{
    const n=document.createElement("div"); let answer="cancel";
    n.innerHTML=`<h2>Some ${kind} already exist</h2>
      <p>${dupes} of the ${total} ${kind} you're importing are identical to ones you already have.</p>
      <div class="hint"><b>Merge</b> skips the duplicates and adds only the new ones.<br><b>Keep both</b> adds everything, including the duplicates.</div>
      <div class="actions"><button class="left ghost" id="mgNo">Cancel import</button><button id="mgBoth">Keep both</button><button class="primary" id="mgYes">Merge</button></div>`;
    const close=DB.modal(n,()=>res(answer));
    n.querySelector("#mgYes").onclick=()=>{ answer="merge"; close(); };
    n.querySelector("#mgBoth").onclick=()=>{ answer="both"; close(); };
    n.querySelector("#mgNo").onclick=()=>{ answer="cancel"; close(); };
  });
};

/* ---------- custom dropdown: replaces the browser's <select> ---------- */
DB.enhanceSelect = function(sel){
  if(sel._cs){ sel._cs.refresh(); return sel._cs; }
  const wrap=document.createElement("div"); wrap.className="cs";
  if(sel.style.width) wrap.style.width=sel.style.width;
  const btn=document.createElement("button"); btn.type="button"; btn.className="cs-btn"; btn.setAttribute("aria-haspopup","listbox"); btn.setAttribute("aria-expanded","false");
  btn.innerHTML=`<span class="lab"></span>${DB.icon("chevron")}`;
  sel.classList.add("cs-native"); sel.parentNode.insertBefore(wrap,sel); wrap.append(btn,sel);
  let list=null, idx=-1;
  const opts=()=>[...sel.options];
  const refresh=()=>{ const o=sel.options[sel.selectedIndex]; btn.querySelector(".lab").textContent=o?o.textContent:""; btn.disabled=sel.disabled; if(sel.id) btn.setAttribute("aria-label",sel.getAttribute("aria-label")||btn.textContent); };
  const close=()=>{ if(!list) return; list.remove(); list=null; wrap.classList.remove("open"); btn.setAttribute("aria-expanded","false"); document.removeEventListener("pointerdown",outside,true); removeEventListener("resize",close); document.removeEventListener("scroll",onScroll,true); };
  const outside=e=>{ if(list && !list.contains(e.target) && !wrap.contains(e.target)) close(); };
  const onScroll=e=>{ if(list && !list.contains(e.target)) close(); };
  const choose=i=>{ const o=opts()[i]; if(!o) return; sel.value=o.value; close(); refresh(); sel.dispatchEvent(new Event("input",{bubbles:true})); sel.dispatchEvent(new Event("change",{bubbles:true})); btn.focus(); };
  const mark=()=>{ [...list.children].forEach((li,i)=>li.classList.toggle("act",i===idx)); const a=list.children[idx]; if(a) a.scrollIntoView({block:"nearest"}); };
  const open=()=>{
    if(list||sel.disabled) return;
    list=document.createElement("ul"); list.className="cs-list"; list.setAttribute("role","listbox");
    opts().forEach((o,i)=>{ const li=document.createElement("li"); li.setAttribute("role","option"); li.innerHTML=`<span>${DB.esc(o.textContent)}</span>${o.selected?DB.icon("check"):""}`; if(o.selected){ li.classList.add("sel"); idx=i; } li.onclick=()=>choose(i); list.appendChild(li); });
    document.body.appendChild(list);
    const r=btn.getBoundingClientRect(), below=innerHeight-r.bottom-12, above=r.top-12, h=Math.min(list.scrollHeight+8,280);
    list.style.minWidth=r.width+"px"; list.style.left=Math.max(8,Math.min(r.left,innerWidth-Math.max(r.width,list.offsetWidth)-8))+"px";
    if(below>=h||below>=above){ list.style.top=(r.bottom+4)+"px"; list.style.maxHeight=Math.max(120,below)+"px"; } else { list.style.bottom=(innerHeight-r.top+4)+"px"; list.style.maxHeight=Math.max(120,above)+"px"; }
    wrap.classList.add("open"); btn.setAttribute("aria-expanded","true");
    document.addEventListener("pointerdown",outside,true); addEventListener("resize",close); document.addEventListener("scroll",onScroll,true); mark();
  };
  btn.onclick=()=>list?close():open();
  btn.addEventListener("keydown",e=>{
    const n=opts().length;
    if(e.key==="Escape"&&list){ e.preventDefault(); e.stopPropagation(); close(); return; }
    if(["ArrowDown","ArrowUp","Enter"," "].includes(e.key)){
      e.preventDefault(); if(!list){ open(); return; }
      if(e.key==="ArrowDown") idx=Math.min(n-1,idx+1); else if(e.key==="ArrowUp") idx=Math.max(0,idx-1); else { choose(idx); return; }
      mark();
    } else if(e.key.length===1 && !e.ctrlKey && !e.metaKey){
      const q=e.key.toLowerCase(), i=opts().findIndex((o,j)=>j>idx&&o.textContent.toLowerCase().startsWith(q)); const k=i>=0?i:opts().findIndex(o=>o.textContent.toLowerCase().startsWith(q));
      if(k>=0){ idx=k; if(list) mark(); else choose(k); }
    }
  });
  sel._cs={refresh,close}; refresh(); return sel._cs;
};

/* =====================================================================
   FIREBASE: Google sign-in + Firestore
   users/{uid}                    profile (username, email, photo, settings, timestamps)
   users/{uid}/events/{id}        one doc per calendar event
   users/{uid}/todos/{id}         one doc per reminder
   users/{uid}/flights/{id}       one doc per completed focus flight
   users/{uid}/state/activeFlight the flight in progress (resumes on any device)
   ===================================================================== */
let fdb=null, auth=null, baseRef=null, uid=null;
DB.user = null; DB.profile = null; DB.syncState = "off";
let resolveReady; DB.ready = new Promise(r=>resolveReady=r);
DB.whenReady = fn=>DB.ready.then(fn);
const sleep = ms=>new Promise(r=>setTimeout(r,ms));

const shadow = {}, pending = new Set(), chain = {};
let flushTimer=null, inflight=0, errored=false;
function setSync(s){
  DB.syncState = s;
  const chip = $("#syncChip"); if(!chip) return;
  chip.className = "sync "+s;
  $(".txt",chip).textContent = ({saved:"Synced",saving:"Saving…",error:"Retrying…",off:"Offline"})[s]||"";
}
function queue(k){ if(!uid) return; pending.add(k); setSync("saving"); clearTimeout(flushTimer); flushTimer=setTimeout(flush,450); }
async function flush(){
  clearTimeout(flushTimer);
  const keys=[...pending]; pending.clear();
  await Promise.all(keys.map(k=>chain[k]=(chain[k]||Promise.resolve()).then(()=>push(k))));
  if(!pending.size && !inflight) setSync(errored?"error":"saved");
}
let slowWarned=false;
async function push(k){
  const spec = CLOUD[k]; inflight++;
  const slowT=setTimeout(()=>{ if(!slowWarned){ slowWarned=true; DB.toast("Still saving…","Your changes are kept on this device and will sync when the connection recovers.",7000); } },15000);
  try{
    if(spec.kind==="doc"){
      const ref = baseRef.collection("state").doc(spec.name), v = mem[k], j = v?JSON.stringify(v):null;
      if(shadow[k]===j) return;
      if(v) await ref.set(JSON.parse(j)); else await ref.delete();
      shadow[k]=j;
    } else {
      const arr = mem[k]||[], prev = shadow[k]||new Map(), next = new Map(), ops = [];
      for(const it of arr){ if(!it.id) it.id=DB.uid(); const j=JSON.stringify(it); next.set(it.id,j); if(prev.get(it.id)!==j) ops.push(["s",it.id,j]); }
      prev.forEach((j,id)=>{ if(!next.has(id)) ops.push(["d",id]); });
      if(ops.length){
        const col = baseRef.collection(spec.name);
        for(let i=0;i<ops.length;i+=400){
          const b = fdb.batch();
          ops.slice(i,i+400).forEach(([t,id,j])=> t==="s" ? b.set(col.doc(id),JSON.parse(j)) : b.delete(col.doc(id)));
          await b.commit();
        }
      }
      shadow[k]=next;
    }
    errored=false; slowWarned=false;
  }catch(e){
    errored=true; dbg("sync failed",e);
    DB.toast("Couldn't save your changes","We'll keep trying. Check your connection.",4000);
    pending.add(k); clearTimeout(flushTimer); flushTimer=setTimeout(flush,8000);
  }finally{ clearTimeout(slowT); inflight--; }
}
DB.flush = flush;
addEventListener("pagehide",()=>{ if(pending.size) flush(); });
document.addEventListener("visibilitychange",()=>{ if(document.hidden && pending.size) flush(); });

/* ---- guests, loader, sign-in prompt ---- */
let readyDone=false, pendingCode=null, gateEl=null, gateState="", gateDismiss=null, loaderEl=null, authBusy=false;
const authWaiters=[], loginHooks=[];
DB.isGuest = ()=>!uid;
DB.onLogin = fn=>{ loginHooks.push(fn); };
const GENERIC_ERR = "Something went wrong on our end. Please try again later.";

function showLoader(){
  if(loaderEl) return; loaderEl=document.createElement("div"); loaderEl.className="p23loader"; loaderEl.setAttribute("aria-label","Loading");
  loaderEl.innerHTML='<div class="ll"><img class="base" src="logo.png" alt=""><img class="fill" src="logo.png" alt=""></div>'; document.body.appendChild(loaderEl);
}
function hideLoader(){ if(!loaderEl) return; const e=loaderEl; loaderEl=null; e.classList.add("out"); setTimeout(()=>e.remove(),500); }
function finishReady(){ hideLoader(); revealArrival(); if(!readyDone){ readyDone=true; resolveReady(); } }

const GOOGLE_G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
function closeGate(){ if(gateEl) gateEl.classList.add("hide"); gateDismiss=null; gateState=""; }
function cancelAuth(){ closeGate(); authWaiters.splice(0).forEach(r=>r(false)); }
function gate(state,o={}){
  if(!gateEl){
    gateEl=document.createElement("div"); gateEl.className="authgate"; document.body.appendChild(gateEl);
    gateEl.addEventListener("mousedown",e=>{ if(e.target===gateEl && gateDismiss) gateDismiss(); });
    document.addEventListener("keydown",e=>{ if(e.key==="Escape" && gateDismiss && gateEl && !gateEl.classList.contains("hide")) gateDismiss(); });
  }
  gateEl.classList.remove("hide"); gateState=state; gateDismiss=o.dismiss||null;
  const head=`<h1>${DB.wordmark()}</h1>`, err=o.error?`<div class="gate-err">${DB.esc(o.error)}</div>`:"";
  const x=gateDismiss?`<button class="gate-x ghost iconbtn" id="gClose" aria-label="Close">${DB.icon("x")}</button>`:"";
  if(state==="loading") gateEl.innerHTML=`<div class="gate-card">${head}<div class="ll" style="margin:1.2rem auto"><img class="base" src="logo.png" alt=""><img class="fill" src="logo.png" alt=""></div><p style="margin:0">${DB.esc(o.text||"Loading…")}</p></div>`;
  else if(state==="signin") gateEl.innerHTML=`<div class="gate-card">${x}${head}<p>${DB.esc(o.text||"Sign in with Google to continue. Your calendar, reminders, notes and focus flights are saved to your account.")}</p>
      <button class="gbtn" id="gSign">${GOOGLE_G}Continue with Google</button>${err}
      <p class="gate-alt">New here? <a href="#" id="gNew">Create an account</a></p>
      <p style="margin:.6rem 0 0;font-size:.85rem"><a href="about.html" style="color:var(--accent)">About Project 23</a></p></div>`;
  else if(state==="create") gateEl.innerHTML=`<div class="gate-card">${x}${head}<p>Creating an account needs the access password. If you don't have it, ask the person who invited you.</p>
      <label for="gPass" style="text-align:left">Access password</label>
      <input type="password" id="gPass" class="gate-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Enter the password">
      <button class="gbtn" id="gGo" style="margin-top:.9rem">${GOOGLE_G}Continue with Google</button>${err}
      <p class="gate-alt"><a href="#" id="gBack">Back</a></p></div>`;
  else if(state==="password") gateEl.innerHTML=`<div class="gate-card">${head}<p>Welcome! To finish creating your account, enter the access password.</p>
      <input type="password" id="gPass" class="gate-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Access password">${err}
      <div class="row" style="justify-content:center;margin-top:1rem"><button id="gCancel">Cancel</button><button class="primary" id="gOk">Create account</button></div></div>`;
  else gateEl.innerHTML=`<div class="gate-card">${x}${head}<div class="gate-err" style="text-align:center">${DB.esc(o.error||GENERIC_ERR)}</div><p style="margin-top:1rem"><button id="gClose2">Close</button></p></div>`;
  const q=id=>gateEl.querySelector("#"+id), on=(id,fn)=>{ const e=q(id); if(e) e.onclick=fn; };
  on("gClose",()=>gateDismiss&&gateDismiss()); on("gClose2",()=>cancelAuth());
  on("gSign",()=>startGoogle(null));
  on("gNew",e=>{ e.preventDefault(); gate("create",{dismiss:cancelAuth}); });
  on("gBack",e=>{ e.preventDefault(); gate("signin",{dismiss:cancelAuth}); });
  const pass=q("gPass");
  if(pass){ setTimeout(()=>pass.focus(),50); pass.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); (q("gGo")||q("gOk")).click(); } }); }
  on("gGo",()=>{ const v=pass.value; if(!v){ pass.focus(); return; } startGoogle(v); });
  on("gOk",()=>{ const v=pass.value; if(!v){ pass.focus(); return; } if(passResolve) passResolve(v); });
  on("gCancel",()=>{ if(passResolve) passResolve(null); });
}
let passResolve=null;
function askPassword(error){ return new Promise(res=>{ passResolve=v=>{ passResolve=null; res(v); }; gate("password",{error}); }); }

DB.requireAuth = ()=>{
  if(uid) return Promise.resolve(true);
  return new Promise(res=>{ authWaiters.push(res); if(!auth){ gate("error",{dismiss:cancelAuth}); return; } gate("signin",{dismiss:cancelAuth}); });
};

async function startGoogle(code){
  if(!auth){ gate("error",{dismiss:cancelAuth}); return; }
  pendingCode=code||null;
  const prov=new firebase.auth.GoogleAuthProvider(); prov.setCustomParameters({prompt:"select_account"});
  gate("loading",{text:"Opening Google…"});
  const standalone=window.navigator.standalone===true || matchMedia("(display-mode: standalone)").matches;
  try{
    if(standalone && /iPhone|iPad|iPod/.test(navigator.userAgent)){ await auth.signInWithRedirect(prov); return; }
    await auth.signInWithPopup(prov);
  }catch(e){
    dbg("sign-in",e);
    if(["auth/popup-blocked","auth/operation-not-supported-in-this-environment"].includes(e.code)){ try{ await auth.signInWithRedirect(prov); return; }catch(e2){ e=e2; dbg(e2); } }
    const back=code?"create":"signin";
    if(["auth/popup-closed-by-user","auth/cancelled-popup-request"].includes(e.code)) gate(back,{dismiss:cancelAuth});
    else if(e.code==="auth/network-request-failed") gate(back,{dismiss:cancelAuth,error:"We couldn't reach Google. Check your connection and try again."});
    else gate(back,{dismiss:cancelAuth,error:GENERIC_ERR});
  }
}
DB.signOut = async()=>{ try{ await flush(); await auth.signOut(); }catch{} location.reload(); };

/* ---- account creation: the access password is checked by Firestore's security rules, not by this page ---- */
async function createAccount(user,base){
  const prof={...base, username:user.displayName || (user.email||"traveller").split("@")[0], createdAt:base.lastLoginAt};
  let code=pendingCode, err="", tries=0; pendingCode=null;
  for(;;){
    if(code==null){ code=await askPassword(err); if(code===null) throw {code:"cancelled"}; }
    gate("loading",{text:"Creating your account…"});
    try{ await baseRef.set({...prof, inviteCode:code}); break; }
    catch(e){
      if(e&&e.code==="permission-denied"){
        if(++tries>=5){ DB.toast("Too many attempts","Please try again later.",5000); throw {code:"cancelled"}; }
        err="That password isn't right. Please try again."; code=null; continue;
      }
      throw e;
    }
  }
  baseRef.update({inviteCode:firebase.firestore.FieldValue.delete()}).catch(()=>{});   // the password is not kept on the account
  return prof;
}

async function loadAll(user){
  uid=user.uid; DB.user=user;
  baseRef=fdb.collection("users").doc(uid);
  const snap=await baseRef.get();
  const now=firebase.firestore.FieldValue.serverTimestamp();
  const base={ uid, email:user.email||"", photoURL:user.photoURL||"", lastLoginAt:now };
  let prof;
  if(!snap.exists){ prof=await createAccount(user,base); }
  else { prof=snap.data(); await baseRef.set(base,{merge:true}); }
  DB.profile={ uid, email:base.email, photoURL:base.photoURL, username:prof.username || user.displayName || "Traveller" };
  if(prof.settings){ DB.settings=Object.assign({},DEFAULTS,prof.settings); DB.set("p23.settings",DB.settings); applyTheme(DB.settings.theme); applyLite(); }
  const [ev,td,fl,af,nt,cd,wx,hm]=await Promise.all([
    baseRef.collection("events").get(), baseRef.collection("todos").get(), baseRef.collection("flights").get(),
    baseRef.collection("state").doc("activeFlight").get(), baseRef.collection("notes").get(), baseRef.collection("countdowns").get(),
    baseRef.collection("state").doc("weather").get(), baseRef.collection("state").doc("home").get()
  ]);
  const fill=(k,qs)=>{ const arr=qs.docs.map(d=>d.data()); mem[k]=arr; shadow[k]=new Map(arr.map(x=>[x.id,JSON.stringify(x)])); };
  fill("p23.events",ev); fill("p23.todos",td); fill("p23.flightLog",fl); fill("p23.notes",nt); fill("p23.countdowns",cd);
  mem["p23.flightLog"].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const one=(k,d)=>{ mem[k]=d.exists?d.data():null; shadow[k]=d.exists?JSON.stringify(d.data()):null; };
  one("p23.activeFlight",af); one("p23.weather",wx); one("p23.home",hm);
  setSync("saved");
}
/* A brand-new database can take a moment to start accepting requests, so retry quietly before giving up. */
async function loadWithRetry(user){
  for(let i=0;;i++){
    try{ await loadAll(user); return; }
    catch(e){ dbg("load attempt",i,e); if(i<3 && ["permission-denied","unavailable","failed-precondition"].includes(e&&e.code)) await sleep(1500*(i+1)); else throw e; }
  }
}
function resetSession(){ uid=null; baseRef=null; DB.user=null; DB.profile=null; }

async function handleAuth(user){
  if(!user){
    if(gateState==="loading") closeGate();
    finishReady(); return;
  }
  if(authBusy) return; authBusy=true;
  if(readyDone) gate("loading",{text:"Loading your data…"});
  try{ await loadWithRetry(user); }
  catch(e){
    authBusy=false; resetSession();
    if(e&&e.code==="cancelled"){ try{ await user.delete(); }catch{} try{ await auth.signOut(); }catch{} cancelAuth(); finishReady(); return; }
    dbg(e); finishReady(); gate("error",{dismiss:cancelAuth}); return;
  }
  authBusy=false;
  const wasGuest=readyDone;
  afterLogin(); closeGate(); finishReady();
  if(wasGuest) loginHooks.forEach(f=>{ try{ f(); }catch(e){ dbg(e); } });
  authWaiters.splice(0).forEach(r=>r(true));
}

function initFirebase(){
  const cfg=window.FIREBASE_CONFIG;
  if(!cfg || !cfg.apiKey || /YOUR_/.test(cfg.apiKey) || !window.firebase){ dbg("Firebase is not configured or failed to load"); finishReady(); return; }
  try{
    firebase.initializeApp(cfg); auth=firebase.auth(); fdb=firebase.firestore();
    try{ firebase.firestore.setLogLevel("silent"); }catch{}
    fdb.enablePersistence({synchronizeTabs:true}).catch(()=>{});
  }catch(e){ dbg(e); finishReady(); return; }
  auth.getRedirectResult().catch(e=>{ dbg(e); gate("signin",{dismiss:cancelAuth,error:GENERIC_ERR}); });
  auth.onAuthStateChanged(handleAuth);
}

/* =====================================================================
   SOUND for alerts (shared audio context, unlocked by the first tap)
   ===================================================================== */
let actx=null;
function audioCtx(){ if(actx) return actx; const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return null; try{ actx=new AC(); }catch{} return actx; }
["pointerdown","keydown","touchend"].forEach(ev=>addEventListener(ev,()=>{ const c=audioCtx(); if(c&&c.state==="suspended") c.resume().catch(()=>{}); },{passive:true}));
DB.chime = function(force){
  if(!force && !DB.settings.notifSound) return;
  const c=audioCtx(); if(!c||c.state!=="running") return;
  const vol=Math.max(0,Math.min(1,DB.settings.volume))*.5; if(vol<=0) return;
  [880,1318.5].forEach((f,i)=>{ const t=c.currentTime+i*.14,o=c.createOscillator(),g=c.createGain(); o.type="sine"; o.frequency.value=f; g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+.02); g.gain.exponentialRampToValueAtTime(.0008,t+.9); o.connect(g).connect(c.destination); o.start(t); o.stop(t+1); });
};
const audioChanged = ()=>document.dispatchEvent(new CustomEvent("p23audio"));

/* =====================================================================
   NOTIFICATIONS (+ the recent-notifications list behind the bell)
   ===================================================================== */
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
const isStandalone = window.navigator.standalone===true || matchMedia("(display-mode: standalone)").matches;
let swReg=null;
async function registerSW(){
  if(swReg || !("serviceWorker" in navigator)) return swReg;
  if(!(location.protocol==="https:" || location.hostname==="localhost" || location.hostname==="127.0.0.1")) return null;
  try{ swReg = await navigator.serviceWorker.register("sw.js"); }catch(e){ dbg(e); }
  return swReg;
}
DB.notif = {
  isIOS, isStandalone,
  supported:()=>"Notification" in window,
  perm:()=>"Notification" in window ? Notification.permission : "unsupported",
  on:()=>!!DB.settings.notifyOn,
  async enable(){
    DB.settings.notifyOn = true; DB.saveSettings();
    let p = this.perm();
    if(this.supported() && p==="default") p = await Notification.requestPermission();     // must run straight from the tap
    registerSW();
    if(p==="unsupported") DB.toast(isIOS&&!isStandalone?"Add to Home Screen for phone alerts":"Alerts on while this page is open",
      isIOS&&!isStandalone?"In Safari tap Share, then Add to Home Screen, and open Project 23 from there.":"This browser can't show system notifications.",7000);
    else if(p==="denied") DB.toast("Alerts on while this page is open","System notifications are blocked. iPhone: Settings, Notifications, Project 23.",8000);
    else if(p==="granted") DB.fire("Notifications are on","Project 23 will alert you about events, reminders and landings.",{tag:"welcome"});
    refreshBell(); renderPanel(); document.dispatchEvent(new CustomEvent("p23notif"));
    return p;
  },
  disable(){ DB.settings.notifyOn=false; DB.saveSettings(); refreshBell(); renderPanel(); document.dispatchEvent(new CustomEvent("p23notif")); }
};
/* recent notifications, kept on this device */
const NLOG="p23.notifLog";
const nlog = ()=>DB.get(NLOG,[]);
function addLog(title,body,tag,url){
  const open=!!(panel&&!panel.hidden), e={id:DB.uid(),title,body:body||"",tag:tag||"",url:url||"",ts:Date.now(),read:open};
  const l=nlog(); l.unshift(e); DB.set(NLOG,l.slice(0,40));
  if(open) shown.unshift({...e,u:true});
  updateBadge(); renderPanel();
}
DB.fire = async function(title, body, o={}){
  if(!DB.settings.notifyOn && !o.force) return;
  addLog(title,body,o.tag,o.url);
  DB.toast(title, body, 7000, o.tag); DB.chime();
  if(DB.notif.perm()!=="granted") return;
  try{
    const reg = await registerSW();
    const opts = { body, tag:o.tag, icon:"icon-192.png", badge:"icon-192.png", data:{url:o.url||"./index.html"} };
    if(reg && reg.showNotification) await reg.showNotification(title, opts); else new Notification(title, opts);
  }catch(e){ dbg(e); }
};
DB.checkDue = function(){
  if(!uid || !DB.settings.notifyOn) return;
  const now = Date.now(), fired = DB.get("p23.fired",{}), s = DB.settings;
  let dirty=false;
  const once = (key,title,body,url)=>{ if(fired[key]) return; fired[key]=now; dirty=true; DB.fire(title,body,{tag:key,url}); };
  const WINDOW = 60*60000;
  if(s.notifyEvents){
    const rs = new Date(now-WINDOW-86400000), re = new Date(now+26*3600000);
    for(const ev of DB.loadEvents()){
      const a = ev.alert; if(a==null || a<0) continue;
      for(const o of DB.occurrences(ev, rs, re)){
        const at = o.start + (ev.allDay ? 9*3600000 : 0) - a*60000;
        if(at<=now && now-at<WINDOW){
          const when = ev.allDay ? "Today" : (a>0 ? `Starts in ${a>=1440?"1 day":a>=60?(a/60)+" hour":a+" min"} (${DB.fmtTime(o.start)})` : `Now (${DB.fmtTime(o.start)})`);
          once("ev|"+ev.id+"|"+o.start, ev.title, when+(ev.location?" · "+ev.location:""), "calendar.html");
        }
      }
    }
  }
  if(s.notifyTodos){
    for(const t of DB.get("p23.todos",[])){
      if(t.done || !t.due) continue;
      const due = DB.fromInputs(t.due, t.time || "09:00"), at = due - Math.max(0,t.alert??0)*60000;
      if(at<=now && now-at<WINDOW*3) once("todo|"+t.id+"|"+due, t.title, (t.time?"Due "+DB.fmtTime(due):"Due today")+(t.category?" · "+t.category:""), "todo.html");
    }
  }
  if(s.notifyEvents){
    for(const c of DB.get("p23.countdowns",[])){
      if(c.notify===false || !c.target) continue;
      if(c.target<=now && now-c.target<WINDOW) once("cd|"+c.id+"|"+c.target, c.title, "Your countdown has finished", "countdown.html");
    }
  }
  for(const k in fired) if(now-fired[k] > 7*86400000){ delete fired[k]; dirty=true; }
  if(dirty) DB.set("p23.fired", fired);
};

/* =====================================================================
   UI: background, header, notification panel, settings, footer
   ===================================================================== */
function buildBackground(){
  const bg = document.createElement("div"); bg.className="bg"; bg.setAttribute("aria-hidden","true");
  bg.innerHTML = "<i></i><i></i><i></i><canvas></canvas>"; document.body.prepend(bg);
  const cv = $("canvas",bg), cx = cv.getContext("2d");
  let W,H,stars=[],shoot=null,raf=null,last=0;
  const reduce = ()=>matchMedia("(prefers-reduced-motion: reduce)").matches || DB.settings.lite;
  function size(){ const r=Math.min(devicePixelRatio||1,1.5); W=cv.width=Math.round(innerWidth*r); H=cv.height=Math.round(innerHeight*r); stars=Array.from({length:Math.min(110,Math.floor(innerWidth*innerHeight/11000))},()=>({x:Math.random()*W,y:Math.random()*H,r:(Math.random()*1.3+.4)*r,p:Math.random()*6.28,s:Math.random()*.03+.01,v:(Math.random()*.08+.02)*r})); }
  function draw(){
    cx.clearRect(0,0,W,H); cx.fillStyle="#fff";
    for(const s of stars){ s.p+=s.s; s.y+=s.v*.3; if(s.y>H){ s.y=0; s.x=Math.random()*W; } cx.globalAlpha=.35+.65*Math.abs(Math.sin(s.p)); cx.beginPath(); cx.arc(s.x,s.y,s.r,0,6.283); cx.fill(); }
    if(!shoot && Math.random()<.006){ shoot={x:Math.random()*W*.8,y:Math.random()*H*.4,vx:18,vy:8,life:1}; }
    if(shoot){ cx.globalAlpha=shoot.life; const g=cx.createLinearGradient(shoot.x,shoot.y,shoot.x-shoot.vx*8,shoot.y-shoot.vy*8); g.addColorStop(0,"#fff"); g.addColorStop(1,"transparent"); cx.strokeStyle=g; cx.lineWidth=2; cx.beginPath(); cx.moveTo(shoot.x,shoot.y); cx.lineTo(shoot.x-shoot.vx*8,shoot.y-shoot.vy*8); cx.stroke(); shoot.x+=shoot.vx; shoot.y+=shoot.vy; shoot.life-=.035; if(shoot.life<=0) shoot=null; }
  }
  function frame(t){ raf=requestAnimationFrame(frame); if(t-last<66) return; last=t; draw(); }   // about 15 frames a second is plenty for twinkling stars
  function sync(){ cancelAnimationFrame(raf); raf=null; if(DB.settings.theme==="space" && !reduce() && !document.hidden){ size(); raf=requestAnimationFrame(frame); } }
  let rt; addEventListener("resize",()=>{ clearTimeout(rt); rt=setTimeout(()=>{ if(raf) size(); },200); });
  document.addEventListener("themechange",sync); document.addEventListener("visibilitychange",sync); document.addEventListener("p23lite",sync); sync();
}

let bellBtn, navGroup, indicator, panel;
const stateText = ()=>{ const p=DB.notif.perm(); if(!DB.settings.notifyOn) return p==="denied"?"Off (blocked in system settings)":"Off"; return p==="granted"?"On":"On (in-app only)"; };
function updateBadge(){ const b=$("#bellBadge"); if(!b) return; const n=nlog().filter(x=>!x.read).length; b.textContent=n>9?"9+":n; b.hidden=!n; }
function refreshBell(){
  if(bellBtn) bellBtn.classList.toggle("attn",!DB.settings.notifyOn);
  updateBadge();
  const b=$("#notifBanner"); if(b && DB.settings.notifyOn) b.remove();
  const st=$("#notifState"); if(st) st.textContent=stateText();
}
const initial = ()=>((DB.profile&&DB.profile.username)||(DB.user&&DB.user.displayName)||"?").trim().charAt(0).toUpperCase();
function avatarHTML(){ const url=DB.profile&&DB.profile.photoURL; return url ? `<img src="${DB.esc(url)}" alt="" referrerpolicy="no-referrer">` : `<span>${DB.esc(initial())}</span>`; }
const ago = ts=>{ const m=Math.round((Date.now()-ts)/60000); if(m<1) return "Just now"; if(m<60) return m+" min ago"; const h=Math.round(m/60); if(h<24) return h+(h===1?" hour ago":" hours ago"); return new Date(ts).toLocaleDateString([],{month:"short",day:"numeric"}); };

let shown=[];   // what the open panel is displaying (u = was unread when opened)
function renderPanel(){
  if(!panel || panel.hidden) return;
  const l=shown, on=DB.settings.notifyOn;
  panel.innerHTML=`<div class="np-head"><b>Notifications</b>${l.length?'<button class="ghost" id="npClear">Clear all</button>':""}</div>
    ${on?"":`<div class="np-enable"><span style="color:var(--accent)">${DB.icon("bell","ic-lg")}</span><div style="flex:1">Notifications are off.</div><button class="primary" id="npEnable">Enable</button></div>`}
    <div class="np-list">${l.length?l.map(n=>`<button class="np-item ${n.u?"unread":""}" data-id="${n.id}"><span class="np-ic">${DB.icon(toastIcon(n.tag))}</span><span><b>${DB.esc(n.title)}</b>${n.body?`<span class="t">${DB.esc(n.body)}<br></span>`:""}<span class="t">${ago(n.ts)}</span></span></button>`).join(""):'<div class="np-empty">No notifications yet.</div>'}</div>`;
  const c=$("#npClear",panel); if(c) c.onclick=()=>{ DB.set(NLOG,[]); shown=[]; updateBadge(); renderPanel(); };
  const e=$("#npEnable",panel); if(e) e.onclick=()=>DB.notif.enable();
  panel.querySelectorAll(".np-item").forEach(b=>b.onclick=()=>{ const n=shown.find(x=>x.id===b.dataset.id); if(n&&n.url) location.href=n.url; });
}
function togglePanel(){
  if(!panel){
    panel=document.createElement("div"); panel.className="notifpanel"; panel.hidden=true; document.body.appendChild(panel);
    document.addEventListener("pointerdown",e=>{ if(!panel.hidden && !panel.contains(e.target) && !bellBtn.contains(e.target)) panel.hidden=true; });
    document.addEventListener("keydown",e=>{ if(e.key==="Escape") panel.hidden=true; });
    addEventListener("resize",()=>{ panel.hidden=true; });
  }
  if(!panel.hidden){ panel.hidden=true; return; }
  document.querySelectorAll("#toasts .toast").forEach(t=>t.remove());      // clear pop-ups so the list isn't covered
  const l=nlog(); shown=l.map(n=>({...n,u:!n.read})); DB.set(NLOG,l.map(n=>({...n,read:true})));
  const r=bellBtn.getBoundingClientRect(), w=Math.min(380,innerWidth-16);
  panel.style.top=(r.bottom+10)+"px"; panel.style.left=Math.max(8,Math.min(r.right-w,innerWidth-w-8))+"px"; panel.style.width=w+"px";
  panel.hidden=false; renderPanel(); updateBadge();
}

function moveIndicator(link){
  if(!indicator||!link){ if(indicator) indicator.style.opacity=0; return; }
  const g=navGroup.getBoundingClientRect(), r=link.getBoundingClientRect();
  indicator.style.opacity=1; indicator.style.width=r.width+"px"; indicator.style.transform=`translateX(${r.left-g.left}px)`;
  navGroup.querySelectorAll(".nav").forEach(n=>n.classList.toggle("hot", n===link));
}

/* ---------- pinned pages + the "all pages" menu ---------- */
const isPhone = ()=>matchMedia("(max-width:760px)").matches;
const pinLimit = ()=>isPhone()?5:3;
const pinKey = ()=>isPhone()?"pinP":"pinD";
const pageById = id=>DB.pages.find(p=>p.id===id);
function pinned(){
  const ids=DB.pages.map(p=>p.id); let p=DB.settings[pinKey()];
  if(!Array.isArray(p)) p=ids.slice(0,pinLimit());
  return p.filter(id=>ids.includes(id)).slice(0,pinLimit());
}
function renderNav(){
  const page=document.body.dataset.page||"", pins=pinned(), cur=pageById(page), curLoose=cur&&!pins.includes(page);
  const link=p=>`<a class="nav${p.id===page?" active":""}" href="${p.href}" title="${DB.esc(p.name)}"${p.id===page?' aria-current="page"':""}>${DB.icon(p.icon)}<span>${DB.esc(p.short)}</span></a>`;
  navGroup.innerHTML=`<span class="nav-ind"></span>`+pins.map(id=>link(pageById(id))).join("")+
    `<button class="nav more${curLoose?" active":""}" id="moreBtn" aria-haspopup="menu" aria-expanded="false" title="All pages" aria-label="All pages">${DB.icon(curLoose?cur.icon:"grid")}<span>${curLoose?DB.esc(cur.short):"More"}</span></button>`;
  indicator=$(".nav-ind",navGroup);
  const links=[...navGroup.querySelectorAll(".nav")], active=navGroup.querySelector(".nav.active");
  links.forEach(l=>{ l.addEventListener("pointerenter",()=>moveIndicator(l)); l.addEventListener("focus",()=>moveIndicator(l)); });
  navGroup._active=active; navGroup._links=links;
  navGroup.querySelectorAll("a.nav").forEach(a=>a.addEventListener("click",e=>navClick(e,a)));
  $("#moreBtn",navGroup).onclick=e=>{ e.stopPropagation(); toggleMenu(); };
  setTimeout(()=>active?moveIndicator(active):(indicator.style.opacity=0),30);
}
let menuEl=null;
function closeMenu(){ if(!menuEl) return; menuEl.remove(); menuEl=null; const b=$("#moreBtn"); if(b) b.setAttribute("aria-expanded","false"); document.removeEventListener("pointerdown",menuOutside,true); document.removeEventListener("keydown",menuEsc); }
const menuOutside=e=>{ if(menuEl && !menuEl.contains(e.target) && !e.target.closest("#moreBtn")) closeMenu(); };
const menuEsc=e=>{ if(e.key==="Escape") closeMenu(); };
function toggleMenu(){
  if(menuEl){ closeMenu(); return; }
  const page=document.body.dataset.page||"", btn=$("#moreBtn"), phone=isPhone(), lim=pinLimit();
  menuEl=document.createElement("div"); menuEl.className="pagemenu"; menuEl.setAttribute("role","menu");
  const draw=()=>{
    const pins=pinned();
    menuEl.innerHTML=`<div class="pm-head"><b>All pages</b><span>Pin up to ${lim} to the ${phone?"bottom bar":"header"}</span></div>`+
      DB.pages.map(p=>`<div class="pm-row${p.id===page?" cur":""}"><a href="${p.href}" role="menuitem"><span class="pm-ic">${DB.icon(p.icon)}</span><span>${DB.esc(p.name)}</span></a><button class="pm-pin${pins.includes(p.id)?" on":""}" data-id="${p.id}" aria-pressed="${pins.includes(p.id)}" aria-label="${pins.includes(p.id)?"Unpin":"Pin"} ${DB.esc(p.name)}" title="${pins.includes(p.id)?"Unpin":"Pin"}">${DB.icon("pin2")}</button></div>`).join("");
    menuEl.querySelectorAll("a").forEach(a=>a.addEventListener("click",e=>{ closeMenu(); navClick(e,a); }));
    menuEl.querySelectorAll(".pm-pin").forEach(b=>b.onclick=()=>{
      let p=pinned(); const id=b.dataset.id;
      if(p.includes(id)) p=p.filter(x=>x!==id); else { if(p.length>=lim){ DB.toast(`You can pin up to ${lim} pages`,"Unpin one first to make room.",3200); return; } p.push(id); }
      DB.settings[pinKey()]=p; DB.saveSettings(); renderNav(); draw();
    });
  };
  draw(); document.body.appendChild(menuEl); btn.setAttribute("aria-expanded","true");
  const r=btn.getBoundingClientRect(), w=Math.min(330,innerWidth-16);
  menuEl.style.width=w+"px"; menuEl.style.left=Math.max(8,Math.min(r.left+r.width/2-w/2,innerWidth-w-8))+"px";
  if(phone){ menuEl.style.bottom=(innerHeight-navGroup.getBoundingClientRect().top+10)+"px"; } else { menuEl.style.top=(r.bottom+12)+"px"; menuEl.style.left=Math.max(8,Math.min(r.right-w,innerWidth-w-8))+"px"; }
  document.addEventListener("pointerdown",menuOutside,true); document.addEventListener("keydown",menuEsc);
}

/* ---------- page transition: a coloured wipe with the logo carries you to the next page ---------- */
function navClick(e,a){
  if(e.metaKey||e.ctrlKey||e.shiftKey||e.button!==0) return;
  const href=a.getAttribute("href"); if(!href) return;
  if(href===location.pathname.split("/").pop()){ e.preventDefault(); return; }
  if(a.classList.contains("nav")){ const r=a.getBoundingClientRect(), s=document.createElement("span"), sz=Math.max(r.width,r.height)*1.6; s.className="rip"; s.style.cssText=`width:${sz}px;height:${sz}px;left:${e.clientX-r.left-sz/2}px;top:${e.clientY-r.top-sz/2}px`; a.appendChild(s); setTimeout(()=>s.remove(),600); }
  if(reduceMotion || DB.settings.lite) return;
  e.preventDefault(); wipeOut(href);
}
function wipeEl(covered){
  const w=document.createElement("div"); w.className="p23wipe"; w.setAttribute("aria-hidden","true");
  w.innerHTML=`<div class="pw-slab" style="${covered?"transform:none":""}"><div class="pw-fill"></div><span class="pw-plane">${DB.icon("plane")}</span></div><img class="pw-logo" src="logo.png" alt="" style="${covered?"opacity:1":""}">`;
  return w;
}
function wipeOut(href){
  const w=wipeEl(false); document.documentElement.appendChild(w);
  const slab=w.querySelector(".pw-slab"), logo=w.querySelector(".pw-logo");
  slab.animate([{transform:"translateX(-130vw)"},{transform:"translateX(0)"}],{duration:460,easing:"cubic-bezier(.7,0,.25,1)",fill:"forwards"});
  logo.animate([{opacity:0,transform:"translate(-50%,-50%) scale(.5) rotate(-8deg)"},{opacity:1,transform:"translate(-50%,-50%) scale(1) rotate(0)"}],{duration:300,delay:260,easing:"cubic-bezier(.2,1.4,.4,1)",fill:"forwards"});
  try{ sessionStorage.setItem("p23.wipe","1"); }catch{}
  setTimeout(()=>{ location.href=href; },560);
}
addEventListener("pageshow",e=>{ if(e.persisted) document.querySelectorAll(".p23wipe").forEach(x=>x.remove()); });

function buildHeader(){
  const bar=$("#topbar") || Object.assign(document.createElement("header"),{id:"topbar"});
  bar.className="topbar";
  bar.innerHTML = `
    <span class="tb-spot"></span>
    <a class="logo" href="index.html" aria-label="Project 23 home">${DB.wordmark()}</a>
    <nav class="navgroup" aria-label="Main"></nav>
    <div class="tb-actions">
      <span class="sync off" id="syncChip" title="Cloud sync status"><i></i><span class="txt">Offline</span></span>
      <button class="iconbtn" id="bellBtn" title="Notifications" aria-label="Notifications">${DB.icon("bell")}<span class="badge" id="bellBadge" hidden>0</span></button>
      <button class="iconbtn" id="gearBtn" title="Settings" aria-label="Settings">${DB.icon("gear")}</button>
      <button class="avatar" id="meBtn" title="Account and settings" aria-label="Account and settings"><span>·</span></button>
      <button class="primary" id="signBtn">Sign in</button>
    </div>`;
  bar.classList.toggle("guest",!uid);
  if(!bar.parentNode) document.body.prepend(bar);
  if(document.body.dataset.public) document.body.classList.add("public");
  navGroup=$(".navgroup",bar); bellBtn=$("#bellBtn"); renderNav();
  navGroup.addEventListener("pointerleave",()=>{ const a=navGroup._active; if(a) moveIndicator(a); else { indicator.style.opacity=0; navGroup._links.forEach(n=>n.classList.remove("hot")); } });
  navGroup.addEventListener("focusout",()=>{ const a=navGroup._active; if(a) moveIndicator(a); });
  const place=()=>{ setTimeout(()=>navGroup._active?moveIndicator(navGroup._active):(indicator.style.opacity=0),30); };
  let pt; addEventListener("resize",()=>{ clearTimeout(pt); pt=setTimeout(place,120); }); if(document.fonts&&document.fonts.ready) document.fonts.ready.then(place); setTimeout(place,700);

  /* on phones the nav becomes a floating dock outside the header; the number of pinned pages changes too */
  const mq=matchMedia("(max-width:760px)");
  const dock=()=>{ closeMenu(); if(mq.matches) document.body.appendChild(navGroup); else bar.insertBefore(navGroup,$(".tb-actions",bar)); renderNav(); };
  mq.addEventListener("change",dock); dock();

  /* spotlight that trails the cursor: moved with transform (no repaint), at most once per frame */
  const spot=$(".tb-spot",bar); let sx=0,sy=0,sraf=0;
  if(!reduceMotion && matchMedia("(hover:hover)").matches){
    bar.addEventListener("pointermove",e=>{ const r=bar.getBoundingClientRect(); sx=e.clientX-r.left; sy=e.clientY-r.top; if(!sraf) sraf=requestAnimationFrame(()=>{ spot.style.transform=`translate3d(${sx}px,${sy}px,0)`; sraf=0; }); },{passive:true});
  }
  let st=0; addEventListener("scroll",()=>{ if(st) return; st=requestAnimationFrame(()=>{ bar.classList.toggle("scrolled",scrollY>10); st=0; }); },{passive:true});

  /* logo: little burst on click */
  const logo=$(".logo",bar);
  logo.addEventListener("click",e=>{
    if(reduceMotion || DB.settings.lite) return; const r=e.currentTarget.getBoundingClientRect(), x=r.left+r.width-24, y=r.top+r.height/2;
    for(let i=0;i<12;i++){ const p=document.createElement("i"); p.className="burst"; p.style.left=x+"px"; p.style.top=y+"px"; p.style.setProperty("--c",DB.palette[i%DB.palette.length]); document.body.appendChild(p);
      const a=i/12*Math.PI*2, d=34+Math.random()*40; p.animate([{transform:"translate(0,0) scale(1)",opacity:1},{transform:`translate(${Math.cos(a)*d}px,${Math.sin(a)*d}px) scale(0)`,opacity:0}],{duration:600,easing:"cubic-bezier(.2,.8,.3,1)"}).onfinish=()=>p.remove(); }
  });
  logo.addEventListener("click",e=>navClick(e,logo));
  bellBtn.onclick = togglePanel;
  $("#gearBtn").onclick = openSettings; $("#meBtn").onclick = openSettings; $("#signBtn").onclick = ()=>DB.requireAuth();
  refreshBell();
  setTimeout(()=>document.documentElement.classList.add("rolled"),2400);   // the intro animations play once per page
}

function buildBanner(){
  const main=$("main"); if(!main || !uid || document.body.dataset.page!=="home" || DB.settings.notifyOn || DB.get("p23.bannerOff",false)) return;
  const d=document.createElement("section"); d.className="panel row"; d.id="notifBanner"; d.style.setProperty("--i",0);
  const needHome=isIOS&&!isStandalone;
  d.innerHTML=`<span style="color:var(--accent)">${DB.icon("bell","ic-lg")}</span><div class="grow"><b>Get alerts for events, reminders and landings</b><div class="muted">${needHome?"On iPhone, first add Project 23 to your Home Screen (Share, then Add to Home Screen), then open it from there.":"Turn on notifications so Project 23 can tell you when something is due."}</div></div><button class="primary" id="nbEnable">Enable notifications</button><button class="ghost" id="nbClose" aria-label="Dismiss">${DB.icon("plus").replace('<svg','<svg style="transform:rotate(45deg)"')}</button>`;
  main.prepend(d);
  $("#nbEnable").onclick=()=>DB.notif.enable();
  $("#nbClose").onclick=()=>{ DB.set("p23.bannerOff",true); d.remove(); };
}

function openSettings(){
  if(!uid){ DB.requireAuth().then(ok=>{ if(ok) openSettings(); }); return; }
  const el=document.createElement("div");
  const sw=(id,label,sub,on)=>`<div class="setrow"><div><b>${label}</b><div class="muted">${sub}</div></div><button class="switch" id="${id}" role="switch" aria-checked="${on}" aria-label="${label}"></button></div>`;
  const nOn=DB.settings.notifyOn;
  el.innerHTML=`<h2>Settings</h2>
    <div class="sec"><h3>Account</h3>
      <div class="acct"><div class="avatar">${avatarHTML()}</div>
        <div class="who"><label for="uName">Username</label><div class="row"><input id="uName" class="grow" maxlength="30" value="${DB.esc(DB.profile.username)}"><button id="uSave">Save</button></div></div></div>
      <div class="setrow"><div><b>User ID</b><div class="copy" id="uid">${DB.esc(uid)}</div></div><button id="uCopy">Copy</button></div>
      <div class="setrow"><div><b>Signed in with Google</b><div class="muted">${DB.esc(DB.profile.email)}</div></div><button class="danger" id="uOut">Sign out</button></div>
    </div>
    <div class="sec"><h3>Appearance</h3>
      <div class="themes" role="group" aria-label="Theme">
        ${["light","dark","space"].map(t=>`<button class="theme" data-pick="${t}" aria-pressed="${DB.settings.theme===t}"><div class="prev ${t}"></div>${t[0].toUpperCase()+t.slice(1)}</button>`).join("")}
      </div>
      ${sw("swLite","Reduce animations","Smoother and cooler on older devices",DB.settings.lite)}
    </div>
    <div class="sec"><h3>Notifications</h3>
      <div class="setrow"><div><b>Status: <span id="notifState"></span></b><div class="muted">Alerts appear while Project 23 is open or running in the background.</div></div>
        <div class="btnrow"><button class="primary" id="setToggle">${nOn?"Disable":"Enable"}</button><button id="setTest" ${nOn?"":"disabled"}>Test</button></div></div>
      <div id="nSubs" class="${nOn?"":"dim"}">
        ${sw("swEv","Calendar events","Alert when an event is about to start",DB.settings.notifyEvents)}
        ${sw("swTd","To-do reminders","Alert when a task is due",DB.settings.notifyTodos)}
        ${sw("swFl","Focus landing","Alert when your flight lands",DB.settings.notifyFlight)}
      </div>
    </div>
    <div class="sec"><h3>Sound</h3>
      <div class="volrow">${DB.icon("volume","ic-lg")}<input type="range" id="vol" min="0" max="100" step="5" value="${Math.round(DB.settings.volume*100)}" aria-label="Volume"><output id="volOut">${Math.round(DB.settings.volume*100)}%</output></div>
      ${sw("swSnd","Plane flight sounds","Engine hum and cabin chimes during a Focus flight",DB.settings.sound)}
      ${sw("swNs","Notification sound","A soft chime when an alert arrives",DB.settings.notifSound)}
    </div>
    <div class="actions"><button class="primary" id="setDone">Done</button></div>`;
  const close=DB.modal(el); refreshBell();
  el.querySelectorAll(".theme").forEach(b=>b.onclick=()=>DB.setTheme(b.dataset.pick));
  const bind=(id,key,after)=>{ const b=$("#"+id,el); b.onclick=()=>{ DB.settings[key]=!DB.settings[key]; b.setAttribute("aria-checked",DB.settings[key]); DB.saveSettings(); if(after) after(); }; };
  bind("swEv","notifyEvents"); bind("swTd","notifyTodos"); bind("swFl","notifyFlight");
  bind("swLite","lite",()=>{ applyLite(); document.dispatchEvent(new CustomEvent("p23lite")); });
  bind("swSnd","sound",audioChanged); bind("swNs","notifSound");
  const vol=$("#vol",el), out=$("#volOut",el);
  vol.oninput=()=>{ DB.settings.volume=vol.value/100; out.textContent=vol.value+"%"; DB.saveSettings(); audioChanged(); };
  vol.onchange=()=>DB.chime(true);
  const syncNotifUI=()=>{ $("#setToggle",el).textContent=DB.settings.notifyOn?"Disable":"Enable"; $("#setTest",el).disabled=!DB.settings.notifyOn; $("#nSubs",el).classList.toggle("dim",!DB.settings.notifyOn); refreshBell(); };
  $("#setToggle",el).onclick=async()=>{ if(DB.settings.notifyOn) DB.notif.disable(); else await DB.notif.enable(); syncNotifUI(); };
  $("#setTest",el).onclick=()=>DB.fire("Test notification","If you can see this, alerts are working.",{tag:"test"});
  $("#uSave",el).onclick=async()=>{ const v=$("#uName",el).value.trim(); if(!v) return; DB.profile.username=v; try{ await baseRef.set({username:v},{merge:true}); DB.toast("Username saved",v,2500); }catch(e){ dbg(e); DB.toast("Couldn't save your username","Please try again.",3000); } };
  $("#uCopy",el).onclick=()=>{ navigator.clipboard&&navigator.clipboard.writeText(uid); DB.toast("User ID copied","",2000); };
  $("#uOut",el).onclick=()=>DB.signOut();
  $("#setDone",el).onclick=close;
  refreshBell();
}
DB.openSettings = openSettings;
DB.userId = ()=>uid;

function buildFooter(){
  if($(".sitefoot")) return;
  const f=document.createElement("footer"); f.className="sitefoot";
  f.innerHTML=`<div class="meta"><b>${DB.esc(CFG.name)}</b><span class="dot">•</span><span>${DB.esc(CFG.code)} ${DB.esc(CFG.version)}</span></div><a href="about.html">${DB.icon("info")}About this website</a>`;
  document.body.appendChild(f);
}

function afterLogin(){
  const bar=$("#topbar"); if(bar) bar.classList.remove("guest");
  const me=$("#meBtn"); if(me) me.innerHTML=avatarHTML();
  setSync("saved"); buildBanner(); refreshBell();
  document.querySelectorAll("main > .panel").forEach((p,i)=>{ if(!p.style.getPropertyValue("--i")) p.style.setProperty("--i", i+1); });
  setTimeout(DB.checkDue,1500); setInterval(DB.checkDue,30000);
  document.addEventListener("visibilitychange",()=>{ if(!document.hidden) DB.checkDue(); });
}

/* ---------- boot ---------- */
function boot(){
  buildBackground(); buildHeader(); buildFooter(); registerSW();
  if(document.body.dataset.public){ resolveReady(); readyDone=true; revealArrival(); return; }
  if(!arrivalWipe) showLoader(); setTimeout(hideLoader,10000);       // safety net: never trap the page behind the loader
  initFirebase();
}
document.readyState==="loading" ? document.addEventListener("DOMContentLoaded",boot) : boot();
})();