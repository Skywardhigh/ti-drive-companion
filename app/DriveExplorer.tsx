"use client";

import { useEffect, useMemo, useState } from "react";

type Drive = { dataName:string; friendlyName:string; driveClassification:string; requiredPowerPlant:string; thrust_N:number; EV_kps:number; flatMass_tons:number; specificPower_kgMW:number; efficiency:number; propellant:string; thrusters:number; disable?:boolean };
type Family = "Chemical"|"Fission"|"Fusion"|"Antimatter"|"Electric"|"Other";
const COLORS:Record<Family,string>={Chemical:"#f4b942",Fission:"#65c79f",Fusion:"#a38cff",Antimatter:"#ff6f91",Electric:"#65b9ec",Other:"#a7b0b8"};
const SHAPES=["circle","diamond","square","triangle","cross"] as const;

function familyOf(d:Drive):Family { const v=d.driveClassification; if(v==="Chemical")return "Chemical"; if(v.includes("Fission")||v==="NuclearSaltWater")return "Fission"; if(v.includes("Fusion"))return "Fusion"; if(v==="Antimatter")return "Antimatter"; if(["Electrostatic","Electromagnetic","Electrothermal"].includes(v))return "Electric"; return "Other"; }
function readable(v:string){return v.replaceAll("_"," ").replace(/\b\w/g,l=>l.toUpperCase())}
function subtypeOf(d:Drive){return readable(d.requiredPowerPlant!=="Any_General"?d.requiredPowerPlant:d.driveClassification)}
function shapeOf(d:Drive){const t=`${d.driveClassification}:${d.requiredPowerPlant}`;let h=0;for(let i=0;i<t.length;i++)h=(h*31+t.charCodeAt(i))|0;return SHAPES[Math.abs(h)%SHAPES.length]}
function compact(v:number,u=""){return `${new Intl.NumberFormat("en",{notation:"compact",maximumFractionDigits:2}).format(v)}${u}`}
function precise(v:number,u=""){return `${new Intl.NumberFormat("en",{maximumFractionDigits:2}).format(v)}${u}`}

function PlotShape({shape,x,y,color,selected}:{shape:typeof SHAPES[number];x:number;y:number;color:string;selected:boolean}){
  const p={fill:color,stroke:selected?"#fff":color,strokeWidth:selected?2:.7};
  if(shape==="diamond")return <rect x={x-3.5} y={y-3.5} width="7" height="7" rx=".8" transform={`rotate(45 ${x} ${y})`} {...p}/>;
  if(shape==="square")return <rect x={x-3.5} y={y-3.5} width="7" height="7" rx="1" {...p}/>;
  if(shape==="triangle")return <path d={`M ${x} ${y-4.5} L ${x+4.5} ${y+3.5} L ${x-4.5} ${y+3.5} Z`} {...p}/>;
  if(shape==="cross")return <path d={`M ${x-4} ${y-1.5} H ${x-1.5} V ${y-4} H ${x+1.5} V ${y-1.5} H ${x+4} V ${y+1.5} H ${x+1.5} V ${y+4} H ${x-1.5} V ${y+1.5} H ${x-4} Z`} {...p}/>;
  return <circle cx={x} cy={y} r={selected?4.5:3.5} {...p}/>;
}

export function DriveExplorer(){
  const [drives,setDrives]=useState<Drive[]>([]),[error,setError]=useState(""),[query,setQuery]=useState(""),[family,setFamily]=useState("All families");
  const [scale,setScale]=useState<"log"|"linear">("log"),[selected,setSelected]=useState<string[]>([]);
  const [hovered,setHovered]=useState<{drive:Drive;x:number;y:number}|null>(null);
  useEffect(()=>{fetch("/data/TIDriveTemplate.json").then(r=>{if(!r.ok)throw new Error("Could not load the drive dataset.");return r.json()}).then((values:Drive[])=>{const active=values.filter(d=>!d.disable);setDrives(active);setSelected(["Apex Solid Rocket x1","Lars Drive x1","Triton Reflex Drive x1"].map(n=>active.find(d=>d.friendlyName===n)?.dataName).filter((id):id is string=>Boolean(id)))}).catch(e=>setError(e instanceof Error?e.message:"Could not load data."))},[]);
  const filtered=useMemo(()=>{const n=query.trim().toLowerCase();return drives.filter(d=>(family==="All families"||familyOf(d)===family)&&(!n||`${d.friendlyName} ${d.driveClassification} ${d.requiredPowerPlant} ${d.propellant}`.toLowerCase().includes(n)))},[drives,family,query]);
  const selectedDrives=selected.map(id=>drives.find(d=>d.dataName===id)).filter((d):d is Drive=>Boolean(d));
  const searchResults=query.trim()?filtered.slice(0,8):[];
  const chart={width:900,height:540,left:72,right:24,top:28,bottom:58};
  const xs=filtered.map(d=>d.EV_kps).filter(v=>v>0),ys=filtered.map(d=>d.thrust_N).filter(v=>v>0);
  const domain={xMin:xs.length?Math.min(...xs):1,xMax:xs.length?Math.max(...xs):10,yMin:ys.length?Math.min(...ys):1,yMax:ys.length?Math.max(...ys):10};
  const norm=(v:number,min:number,max:number)=>scale==="log"?(Math.log10(v)-Math.log10(min))/Math.max(.00001,Math.log10(max)-Math.log10(min)):(v-min)/Math.max(.00001,max-min);
  const px=(v:number)=>chart.left+norm(v,domain.xMin,domain.xMax)*(chart.width-chart.left-chart.right),py=(v:number)=>chart.top+(1-norm(v,domain.yMin,domain.yMax))*(chart.height-chart.top-chart.bottom);
  const ticks=[0,.25,.5,.75,1],tickValue=(r:number,min:number,max:number)=>scale==="log"?10**(Math.log10(min)+r*(Math.log10(max)-Math.log10(min))):min+r*(max-min);
  const toggle=(id:string)=>setSelected(c=>c.includes(id)?c.filter(v=>v!==id):c.length<4?[...c,id]:c);

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark" aria-hidden="true"/>TI DRIVE COMPANION</div><div className="dataset-badge">Terra Invicta · {drives.length||"—"} active configurations</div></header>
    <section className="hero"><p className="eyebrow">Ship propulsion atlas / 01</p><h1>Find the drive that fits the mission.</h1><p>Map every drive by exhaust velocity and thrust, isolate a technology family, then pin up to four candidates for a direct performance readout.</p></section>
    <section className="workspace">
      <div className="panel"><div className="panel-head"><h2 className="panel-title">Performance envelope</h2><span className="count">{filtered.length} shown</span></div>
        <div className="controls"><input className="input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, type, propellant…" aria-label="Search drives"/><select className="select" value={family} onChange={e=>setFamily(e.target.value)} aria-label="Filter drive family">{["All families",...Object.keys(COLORS)].map(v=><option key={v}>{v}</option>)}</select><div className="scale-toggle" aria-label="Chart scale"><button className={scale==="log"?"active":""} onClick={()=>setScale("log")} aria-pressed={scale==="log"}>Log</button><button className={scale==="linear"?"active":""} onClick={()=>setScale("linear")} aria-pressed={scale==="linear"}>Linear</button></div></div>
        <div className="legend">{(Object.keys(COLORS) as Family[]).map(n=><span className="legend-item" key={n}><span className="legend-dot" style={{"--dot":COLORS[n]} as React.CSSProperties}/>{n}</span>)}<span>• shape = power-plant subtype</span></div>
        {error?<div className="empty-state">{error}</div>:!drives.length?<div className="loading">Loading drive telemetry…</div>:!filtered.length?<div className="empty-state">No drives match this search.</div>:<div className="chart-wrap" onMouseLeave={()=>setHovered(null)}><svg className="chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Scatter plot of drive exhaust velocity versus thrust">
          {ticks.map(t=>{const x=chart.left+t*(chart.width-chart.left-chart.right),y=chart.top+(1-t)*(chart.height-chart.top-chart.bottom);return <g key={t}><line className="grid-line" x1={x} x2={x} y1={chart.top} y2={chart.height-chart.bottom}/><line className="grid-line" x1={chart.left} x2={chart.width-chart.right} y1={y} y2={y}/><text className="axis-text" x={x} y={chart.height-33} textAnchor="middle">{compact(tickValue(t,domain.xMin,domain.xMax))}</text><text className="axis-text" x={chart.left-10} y={y+3} textAnchor="end">{compact(tickValue(t,domain.yMin,domain.yMax))}</text></g>})}
          <text className="axis-label" x={(chart.left+chart.width-chart.right)/2} y={chart.height-7} textAnchor="middle">EXHAUST VELOCITY · KM/S</text><text className="axis-label" transform={`translate(15 ${(chart.top+chart.height-chart.bottom)/2}) rotate(-90)`} textAnchor="middle">THRUST · NEWTONS</text>
          {filtered.map(d=>{const x=px(d.EV_kps),y=py(d.thrust_N),active=selected.includes(d.dataName);return <g className={`point${active?" selected":""}`} style={{color:COLORS[familyOf(d)],opacity:active?1:.58}} key={d.dataName} onClick={()=>toggle(d.dataName)} onMouseEnter={()=>setHovered({drive:d,x:x/chart.width*100,y:y/chart.height*100})} onFocus={()=>setHovered({drive:d,x:x/chart.width*100,y:y/chart.height*100})} tabIndex={0} role="button" aria-label={`Compare ${d.friendlyName}`}><PlotShape shape={shapeOf(d)} x={x} y={y} color={COLORS[familyOf(d)]} selected={active}/></g>})}
        </svg>{hovered&&<div className="tooltip" style={{left:`${Math.min(hovered.x,72)}%`,top:`${Math.max(10,Math.min(hovered.y,88))}%`}}><strong>{hovered.drive.friendlyName}</strong><div className="tooltip-grid"><span>Thrust</span><span>{compact(hovered.drive.thrust_N," N")}</span><span>Exhaust</span><span>{precise(hovered.drive.EV_kps," km/s")}</span><span>Subtype</span><span>{subtypeOf(hovered.drive)}</span></div></div>}</div>}
      </div>
      <aside className="panel compare-panel"><div className="panel-head"><h2 className="panel-title">Compare</h2><span className="count">{selected.length} / 4</span></div><p className="compare-help">Click a point or search by name and type. Shapes distinguish power-plant subtypes inside each color family.</p>
        {searchResults.length>0&&<div className="results">{searchResults.map(d=><div className="result-row" key={d.dataName}><div><div className="result-name">{d.friendlyName}</div><div className="result-meta">{familyOf(d)} · {subtypeOf(d)}</div></div><button className="add-btn" disabled={selected.length>=4&&!selected.includes(d.dataName)} onClick={()=>toggle(d.dataName)} aria-label={`${selected.includes(d.dataName)?"Remove":"Add"} ${d.friendlyName}`}>{selected.includes(d.dataName)?"−":"+"}</button></div>)}</div>}
        <div className="compare-list">{selectedDrives.length?selectedDrives.map(d=>{const color=COLORS[familyOf(d)];return <article className="drive-card" key={d.dataName}><div className="drive-card-head"><span className={`glyph ${shapeOf(d)}`} style={{"--glyph":color} as React.CSSProperties}/><div><h3>{d.friendlyName}</h3><div className="subtype">{familyOf(d)} · {subtypeOf(d)}</div></div><button className="remove-btn" onClick={()=>toggle(d.dataName)} aria-label={`Remove ${d.friendlyName}`}>×</button></div><div className="metrics"><div className="metric"><div className="metric-label">Thrust</div><div className="metric-value">{compact(d.thrust_N," N")}</div></div><div className="metric"><div className="metric-label">Exhaust velocity</div><div className="metric-value">{precise(d.EV_kps," km/s")}</div></div><div className="metric"><div className="metric-label">Drive mass</div><div className="metric-value">{precise(d.flatMass_tons," t")}</div></div><div className="metric"><div className="metric-label">Propellant</div><div className="metric-value">{readable(d.propellant)}</div></div></div></article>}):<div className="no-selection">Choose drives from the chart to build a comparison.</div>}</div><p className="footer-note">Data loaded at runtime from TIDriveTemplate.json. Disabled configurations are hidden.</p>
      </aside>
    </section>
  </main>
}
