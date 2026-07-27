"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Drive = { dataName:string; friendlyName:string; driveClassification:string; requiredPowerPlant:string; thrust_N:number; EV_kps:number; flatMass_tons:number; specificPower_kgMW:number; efficiency:number; propellant:string; thrusters:number; "req power":string|number; thrustRating_GW:string|number; powerGen:string; cooling:"Open"|"Closed"|"Calc"; perTankPropellantMaterials?:Record<string,number>; disable?:boolean };
type PowerPlant = { dataName:string; friendlyName:string; maxOutput_GW:number; specificPower_tGW:number; powerPlantClass:string; efficiency:number };
type Radiator = { dataName:string; friendlyName:string; specificPower_2s_KWkg:number; radiatorType:string };
type ChartMode = "performance"|"power"|"installed";
type InstalledSystem = { plant:PowerPlant|null; radiator:Radiator|null; plantMass:number; radiatorMass:number; wasteHeat:number; totalMass:number };
type LabelPlacement = { textX:number; textY:number; anchor:"start"|"end"; line?:{x1:number;y1:number;x2:number;y2:number} };
type Family = "Chemical"|"Fission"|"Fusion"|"Antimatter"|"Electric"|"Other";
const COLORS:Record<Family,string>={Chemical:"#f4b942",Fission:"#65c79f",Fusion:"#a38cff",Antimatter:"#ff6f91",Electric:"#65b9ec",Other:"#a7b0b8"};
const SHAPES=["circle","diamond","square","triangle","cross"] as const;

function familyOf(d:Drive):Family { const v=d.driveClassification; if(v==="Chemical")return "Chemical"; if(v.includes("Fission")||v==="NuclearSaltWater")return "Fission"; if(v.includes("Fusion"))return "Fusion"; if(v==="Antimatter")return "Antimatter"; if(["Electrostatic","Electromagnetic","Electrothermal"].includes(v))return "Electric"; return "Other"; }
function readable(v:string){return v.replaceAll("_"," ").replace(/([a-z])([A-Z])/g,"$1 $2").replace(/\b\w/g,l=>l.toUpperCase())}
function subtypeKey(d:Drive){return d.requiredPowerPlant!=="Any_General"?d.requiredPowerPlant:d.driveClassification}
const SUBTYPE_LABELS:Record<string,string>={Antimatter_Beam_Core:"Antimatter beam core",Antimatter_Plasma_Core:"Antimatter plasma core",Chemical:"Chemical",Electromagnetic:"Electromagnetic",Electrostatic:"Electrostatic",Electrothermal:"Electrothermal",Fission_Pulse:"Fission pulse",Gas_Core_Fission:"Gas-core fission",Liquid_Core_Fission:"Liquid-core fission",NuclearSaltWater:"Nuclear salt water",Solid_Core_Fission:"Solid-core fission",Electrostatic_Confinement_Fusion:"Electrostatic fusion",Hybrid_Confinement_Fusion:"Hybrid fusion",Inertial_Confinement_Fusion:"Inertial fusion",Mirrored_Magnetic_Confinement_Fusion:"Mirror fusion",Toroid_Magnetic_Confinement_Fusion:"Torus fusion",Z_Pinch_Fusion:"Z-pinch fusion"};
function subtypeOf(d:Drive){const key=subtypeKey(d);return SUBTYPE_LABELS[key]??readable(key)}
function baseDriveName(d:Drive){return d.friendlyName.replace(/\s+x\d+$/i,"")}
function shapeOf(d:Drive){const t=`${d.driveClassification}:${d.requiredPowerPlant}`;let h=0;for(let i=0;i<t.length;i++)h=(h*31+t.charCodeAt(i))|0;return SHAPES[Math.abs(h)%SHAPES.length]}
function compact(v:number,u=""){return `${new Intl.NumberFormat("en",{notation:"compact",maximumFractionDigits:2}).format(v)}${u}`}
function precise(v:number,u=""){return `${new Intl.NumberFormat("en",{maximumFractionDigits:2}).format(v)}${u}`}
function compositionOf(d:Drive){const entries=Object.entries(d.perTankPropellantMaterials??{}).filter(([,value])=>value>0);return entries.length?entries.map(([name,value])=>`${new Intl.NumberFormat("en",{maximumFractionDigits:1}).format(value*100)}% ${readable(name)}`).join(" · "):"No resource mix listed"}
function powerRequiredGW(d:Drive){return Number(String(d["req power"]).replaceAll(",",""))||0}
function thrustRatingGW(d:Drive){return Number(String(d.thrustRating_GW).replaceAll(",",""))||0}
function formatRequiredPower(d:Drive){const power=powerRequiredGW(d);return power<=0?"0 GW - self-powered":`${new Intl.NumberFormat("en",{maximumFractionDigits:3}).format(power)} GW`}
function formatThrustPerPower(d:Drive){const power=powerRequiredGW(d);return power<=0?"N/A - no external power":compact(d.thrust_N/power," N/GW")}
function formatPowerPlant(d:Drive){return powerRequiredGW(d)<=0?"No external plant required":SUBTYPE_LABELS[d.requiredPowerPlant]??readable(d.requiredPowerPlant)}
function formatPowerTiming(d:Drive){return powerRequiredGW(d)<=0?"Internal / self-powered":readable(d.powerGen)}
function formatSpecificPower(d:Drive){return powerRequiredGW(d)<=0?"Not applicable":d.specificPower_kgMW>0?precise(d.specificPower_kgMW," kg/MW"):"Not listed"}
function radiatorLabel(radiator:Radiator){return `${radiator.friendlyName}${radiator.radiatorType==="AlienSpike"?" (Alien)":""}`}
function installedSystem(d:Drive,plants:PowerPlant[],radiators:Radiator[],radiatorChoice:string):InstalledSystem|null {
  const power=powerRequiredGW(d);
  if(power<=0)return {plant:null,radiator:null,plantMass:0,radiatorMass:0,wasteHeat:0,totalMass:Math.max(d.flatMass_tons,.000001)};
  const compatible=plants.filter(plant=>(d.requiredPowerPlant==="Any_General"||plant.powerPlantClass===d.requiredPowerPlant)&&plant.maxOutput_GW>=power);
  if(!compatible.length)return null;
  const preferredRadiator=radiators.find(item=>item.dataName===radiatorChoice&&item.specificPower_2s_KWkg>0)??radiators.find(item=>item.dataName==="LithiumSpray"&&item.specificPower_2s_KWkg>0)??radiators.filter(item=>item.specificPower_2s_KWkg>0).sort((a,b)=>b.specificPower_2s_KWkg-a.specificPower_2s_KWkg)[0]??null;
  const radiator=d.cooling==="Open"?null:preferredRadiator;
  return compatible.map(plant=>{
    const plantMass=power*plant.specificPower_tGW;
    const wasteHeat=d.cooling==="Open"?0:power*(1-plant.efficiency);
    const radiatorMass=radiator?wasteHeat*1000/radiator.specificPower_2s_KWkg:0;
    return {plant,radiator,plantMass,radiatorMass,wasteHeat,totalMass:Math.max(d.flatMass_tons+plantMass+radiatorMass,.000001)};
  }).sort((a,b)=>a.totalMass-b.totalMass)[0];
}

const CHART_MODES:Record<ChartMode,{label:string;description:string;xLabel:string;yLabel:string}>={
  performance:{label:"Drive performance",description:"Raw exhaust velocity and thrust from the drive data.",xLabel:"EXHAUST VELOCITY · KM/S",yLabel:"THRUST · NEWTONS"},
  power:{label:"Power demand",description:"Required electrical power against delivered thrust.",xLabel:"REQUIRED POWER · GW",yLabel:"THRUST · NEWTONS"},
  installed:{label:"Installed system",description:"Thrust per tonne after adding the lightest compatible reactor and selected radiator.",xLabel:"EXHAUST VELOCITY · KM/S",yLabel:"PROPULSION-SYSTEM SPECIFIC THRUST · N/T"},
};

function PropellantFilter({options,excluded,onToggle,onAll,onNone}:{options:string[];excluded:Set<string>;onToggle:(value:string)=>void;onAll:()=>void;onNone:()=>void}){
  const included=options.length-excluded.size;
  return <details className="filter-dropdown"><summary>{included===options.length?"All propellants":`${included} of ${options.length} propellants`}<span aria-hidden="true">⌄</span></summary><div className="filter-menu"><div className="filter-actions"><button type="button" onClick={onAll}>Select all</button><button type="button" onClick={onNone}>None</button></div>{options.map(option=><label className="filter-option" key={option}><input type="checkbox" checked={!excluded.has(option)} onChange={()=>onToggle(option)}/><span>{readable(option)}</span></label>)}</div></details>
}

function DriveTypeFilter({groups,excludedFamilies,excludedSubtypes,onFamily,onSubtype,onAll,onNone}:{groups:Array<{family:Family;subtypes:string[]}>;excludedFamilies:Set<Family>;excludedSubtypes:Set<string>;onFamily:(family:Family)=>void;onSubtype:(family:Family,subtype:string)=>void;onAll:()=>void;onNone:()=>void}){
  const familyCount=groups.filter(group=>!excludedFamilies.has(group.family)).length;
  const subtypeCount=groups.reduce((count,group)=>count+group.subtypes.filter(subtype=>!excludedFamilies.has(group.family)&&!excludedSubtypes.has(subtype)).length,0);
  const allSelected=familyCount===groups.length&&excludedSubtypes.size===0;
  return <details className="filter-dropdown type-dropdown"><summary>{allSelected?"All drive types":`${familyCount} families · ${subtypeCount} subtypes`}<span aria-hidden="true">⌄</span></summary><div className="filter-menu"><div className="filter-actions"><button type="button" onClick={onAll}>Select all</button><button type="button" onClick={onNone}>None</button></div>{groups.map(group=><div className={`filter-group${excludedFamilies.has(group.family)?" muted":""}`} key={group.family}><label className="filter-option family-option"><input type="checkbox" checked={!excludedFamilies.has(group.family)} onChange={()=>onFamily(group.family)}/><span className="legend-dot" style={{"--dot":COLORS[group.family]} as React.CSSProperties}/><strong>{group.family}</strong><small>{group.subtypes.filter(subtype=>!excludedSubtypes.has(subtype)).length}/{group.subtypes.length}</small></label><div className="subtype-options">{group.subtypes.map(subtype=><label className="filter-option" key={subtype}><input type="checkbox" checked={!excludedFamilies.has(group.family)&&!excludedSubtypes.has(subtype)} onChange={()=>onSubtype(group.family,subtype)}/><span>{SUBTYPE_LABELS[subtype]??readable(subtype)}</span></label>)}</div></div>)}</div></details>
}

function PlotShape({shape,x,y,color,selected}:{shape:typeof SHAPES[number];x:number;y:number;color:string;selected:boolean}){
  const p={fill:color,stroke:selected?"#fff":color,strokeWidth:selected?2:.7};
  if(shape==="diamond")return <rect x={x-3.5} y={y-3.5} width="7" height="7" rx=".8" transform={`rotate(45 ${x} ${y})`} {...p}/>;
  if(shape==="square")return <rect x={x-3.5} y={y-3.5} width="7" height="7" rx="1" {...p}/>;
  if(shape==="triangle")return <path d={`M ${x} ${y-4.5} L ${x+4.5} ${y+3.5} L ${x-4.5} ${y+3.5} Z`} {...p}/>;
  if(shape==="cross")return <path d={`M ${x-4} ${y-1.5} H ${x-1.5} V ${y-4} H ${x+1.5} V ${y-1.5} H ${x+4} V ${y+1.5} H ${x+1.5} V ${y+4} H ${x-1.5} V ${y+1.5} H ${x-4} Z`} {...p}/>;
  return <circle cx={x} cy={y} r={selected?4.5:3.5} {...p}/>;
}

function placeLabels(points:Array<{drive:Drive;x:number;y:number}>,selected:Set<string>,chart:{width:number;height:number;left:number;right:number;top:number;bottom:number},fontSize:number,nameOf:(drive:Drive)=>string){
  const placements=new Map<string,LabelPlacement>(),occupied:Array<{left:number;right:number;top:number;bottom:number}>=[];
  const candidates=[{dx:8,dy:3.5,anchor:"start" as const,leader:false},{dx:-8,dy:3.5,anchor:"end" as const,leader:false},{dx:8,dy:-8,anchor:"start" as const,leader:true},{dx:8,dy:14,anchor:"start" as const,leader:true},{dx:-8,dy:-8,anchor:"end" as const,leader:true},{dx:-8,dy:14,anchor:"end" as const,leader:true},{dx:20,dy:3.5,anchor:"start" as const,leader:true},{dx:-20,dy:3.5,anchor:"end" as const,leader:true},{dx:16,dy:-18,anchor:"start" as const,leader:true},{dx:16,dy:24,anchor:"start" as const,leader:true},{dx:-16,dy:-18,anchor:"end" as const,leader:true},{dx:-16,dy:24,anchor:"end" as const,leader:true},...[32,48,64,84,108].flatMap(distance=>[-1,-.5,0,.5,1].flatMap(vertical=>[{dx:distance,dy:vertical*distance+3.5,anchor:"start" as const,leader:true},{dx:-distance,dy:vertical*distance+3.5,anchor:"end" as const,leader:true}]))];
  const overlaps=(a:{left:number;right:number;top:number;bottom:number},b:{left:number;right:number;top:number;bottom:number})=>a.left<b.right+3&&a.right+3>b.left&&a.top<b.bottom+2&&a.bottom+2>b.top;
  const overlapArea=(a:{left:number;right:number;top:number;bottom:number},b:{left:number;right:number;top:number;bottom:number})=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
  const markerBounds=points.map(point=>({id:point.drive.dataName,rect:{left:point.x-5,right:point.x+5,top:point.y-5,bottom:point.y+5}}));
  const prioritized=[...points].sort((a,b)=>Number(selected.has(b.drive.dataName))-Number(selected.has(a.drive.dataName))||a.drive.friendlyName.localeCompare(b.drive.friendlyName));
  for(const point of prioritized){
    const width=Math.max(fontSize*2,nameOf(point.drive).length*fontSize*.61),height=fontSize*1.2;
    let fallback:{placement:LabelPlacement;rect:{left:number;right:number;top:number;bottom:number};score:number}|null=null;
    for(let index=0;index<candidates.length;index++){
      const candidate=candidates[index],textX=point.x+candidate.dx,textY=point.y+candidate.dy;
      const rect={left:candidate.anchor==="start"?textX:textX-width,right:candidate.anchor==="start"?textX+width:textX,top:textY-fontSize*.82,bottom:textY+height-fontSize*.82};
      const inBounds=rect.left>=chart.left&&rect.right<=chart.width-chart.right&&rect.top>=chart.top&&rect.bottom<=chart.height-chart.bottom;
      const placement:LabelPlacement={textX,textY,anchor:candidate.anchor};
      if(candidate.leader)placement.line={x1:point.x+Math.sign(candidate.dx)*4,y1:point.y+Math.sign(candidate.dy)*2,x2:textX+(candidate.anchor==="start"?-2:2),y2:textY-fontSize*.22};
      if(!inBounds)continue;
      const coversMarker=markerBounds.some(marker=>marker.id!==point.drive.dataName&&overlaps(rect,marker.rect));
      const coversLabel=occupied.some(other=>overlaps(rect,other));
      if(!coversMarker&&!coversLabel){placements.set(point.drive.dataName,placement);occupied.push(rect);fallback=null;break}
      const score=occupied.reduce((sum,other)=>sum+overlapArea(rect,other),0)+markerBounds.reduce((sum,marker)=>marker.id===point.drive.dataName?sum:sum+overlapArea(rect,marker.rect)*3,0)+Math.hypot(candidate.dx,candidate.dy)*.01;
      if(!fallback||score<fallback.score)fallback={placement,rect,score};
    }
    if(fallback){placements.set(point.drive.dataName,fallback.placement);occupied.push(fallback.rect)}
  }
  return placements;
}

export function DriveExplorer(){
  const [drives,setDrives]=useState<Drive[]>([]),[plants,setPlants]=useState<PowerPlant[]>([]),[radiators,setRadiators]=useState<Radiator[]>([]),[error,setError]=useState(""),[query,setQuery]=useState("");
  const [scale,setScale]=useState<"log"|"linear">("log"),[selected,setSelected]=useState<string[]>([]);
  const [chartMode,setChartMode]=useState<ChartMode>("performance");
  const [radiatorChoice,setRadiatorChoice]=useState("LithiumSpray");
  const [maxOnly,setMaxOnly]=useState(true);
  const [showNames,setShowNames]=useState(true);
  const [readableText,setReadableText]=useState(false);
  const [excludedPropellants,setExcludedPropellants]=useState<Set<string>>(()=>new Set());
  const [excludedFamilies,setExcludedFamilies]=useState<Set<Family>>(()=>new Set());
  const [excludedSubtypes,setExcludedSubtypes]=useState<Set<string>>(()=>new Set());
  const [hovered,setHovered]=useState<{drive:Drive;x:number;y:number}|null>(null);
  const tooltipTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const showTooltip=(drive:Drive,x:number,y:number)=>{if(tooltipTimer.current)clearTimeout(tooltipTimer.current);tooltipTimer.current=null;setHovered({drive,x,y})};
  const closeTooltipSoon=()=>{if(tooltipTimer.current)clearTimeout(tooltipTimer.current);tooltipTimer.current=setTimeout(()=>{setHovered(null);tooltipTimer.current=null},1600)};
  useEffect(()=>()=>{if(tooltipTimer.current)clearTimeout(tooltipTimer.current)},[]);
  useEffect(()=>{Promise.all([fetch("/data/TIDriveTemplate.json"),fetch("/data/TIPowerPlantTemplate.json"),fetch("/data/TIRadiatorTemplate.json")]).then(async responses=>{if(responses.some(response=>!response.ok))throw new Error("Could not load the propulsion datasets.");return Promise.all(responses.map(response=>response.json()))}).then(([driveValues,plantValues,radiatorValues]:[Drive[],PowerPlant[],Radiator[]])=>{const active=driveValues.filter(d=>!d.disable);setDrives(active);setPlants(plantValues);setRadiators(radiatorValues);setSelected(["Apex Solid Rocket","Lars Drive","Triton Reflex Drive"].map(name=>active.filter(d=>baseDriveName(d)===name).sort((a,b)=>b.thrusters-a.thrusters)[0]?.dataName).filter((id):id is string=>Boolean(id)))}).catch(e=>setError(e instanceof Error?e.message:"Could not load data."))},[]);
  const propellantOptions=useMemo(()=>Array.from(new Set(drives.map(d=>d.propellant))).sort(),[drives]);
  const familyGroups=useMemo(()=>(Object.keys(COLORS) as Family[]).map(family=>({family,subtypes:Array.from(new Set(drives.filter(d=>familyOf(d)===family).map(subtypeKey))).sort()})).filter(group=>group.subtypes.length),[drives]);
  const filtered=useMemo(()=>{
    const candidates=maxOnly?Array.from(drives.reduce((groups,d)=>{const key=baseDriveName(d);const current=groups.get(key);if(!current||d.thrusters>current.thrusters)groups.set(key,d);return groups},new Map<string,Drive>()).values()):drives;
    const n=query.trim().toLowerCase();
    return candidates.filter(d=>!excludedPropellants.has(d.propellant)&&!excludedFamilies.has(familyOf(d))&&!excludedSubtypes.has(subtypeKey(d))&&(!n||`${d.friendlyName} ${d.driveClassification} ${d.requiredPowerPlant} ${d.propellant}`.toLowerCase().includes(n)))
  },[drives,excludedFamilies,excludedPropellants,excludedSubtypes,maxOnly,query]);
  const selectedDrives=selected.map(id=>drives.find(d=>d.dataName===id)).filter((d):d is Drive=>Boolean(d));
  const searchResults=query.trim()?filtered.slice(0,8):[];
  const chart={width:1400,height:760,left:100,right:34,top:34,bottom:70};
  const systems=useMemo(()=>new Map(filtered.map(d=>[d.dataName,installedSystem(d,plants,radiators,radiatorChoice)])),[filtered,plants,radiators,radiatorChoice]);
  const positivePowers=filtered.map(powerRequiredGW).filter(value=>value>0);
  const powerFloor=positivePowers.length?Math.min(...positivePowers)/10:.01;
  const valuesFor=(d:Drive)=>{
    if(chartMode==="power")return {x:powerRequiredGW(d)>0?powerRequiredGW(d):powerFloor,y:d.thrust_N};
    if(chartMode==="installed"){const system=systems.get(d.dataName);return system?{x:d.EV_kps,y:d.thrust_N/system.totalMass}:null}
    return {x:d.EV_kps,y:d.thrust_N};
  };
  const plotted=filtered.map(d=>({drive:d,values:valuesFor(d)})).filter((item):item is {drive:Drive;values:{x:number;y:number}}=>Boolean(item.values&&item.values.x>0&&item.values.y>0));
  const xs=plotted.map(item=>item.values.x),ys=plotted.map(item=>item.values.y);
  const domain={xMin:xs.length?Math.min(...xs):1,xMax:xs.length?Math.max(...xs):10,yMin:ys.length?Math.min(...ys):1,yMax:ys.length?Math.max(...ys):10};
  const norm=(v:number,min:number,max:number)=>scale==="log"?(Math.log10(v)-Math.log10(min))/Math.max(.00001,Math.log10(max)-Math.log10(min)):(v-min)/Math.max(.00001,max-min);
  const px=(v:number)=>chart.left+norm(v,domain.xMin,domain.xMax)*(chart.width-chart.left-chart.right),py=(v:number)=>chart.top+(1-norm(v,domain.yMin,domain.yMax))*(chart.height-chart.top-chart.bottom);
  const plotPoints=plotted.map(item=>({...item,x:px(item.values.x),y:py(item.values.y)}));
  const chartDriveName=(drive:Drive)=>maxOnly?baseDriveName(drive):drive.friendlyName;
  const labels=showNames?placeLabels(plotPoints,new Set(selected),chart,readableText?11:9,chartDriveName):new Map<string,LabelPlacement>();
  const ticks=[0,.25,.5,.75,1],tickValue=(r:number,min:number,max:number)=>scale==="log"?10**(Math.log10(min)+r*(Math.log10(max)-Math.log10(min))):min+r*(max-min);
  const toggle=(id:string)=>setSelected(c=>c.includes(id)?c.filter(v=>v!==id):c.length<4?[...c,id]:c);
  const togglePropellant=(value:string)=>setExcludedPropellants(current=>{const next=new Set(current);if(next.has(value))next.delete(value);else next.add(value);return next});
  const toggleFamily=(value:Family)=>setExcludedFamilies(current=>{const next=new Set(current);if(next.has(value))next.delete(value);else next.add(value);return next});
  const toggleSubtype=(family:Family,value:string)=>{const familyWasExcluded=excludedFamilies.has(family);setExcludedSubtypes(current=>{const next=new Set(current);if(familyWasExcluded||next.has(value))next.delete(value);else next.add(value);return next});setExcludedFamilies(current=>{if(!current.has(family))return current;const next=new Set(current);next.delete(family);return next})};
  const mode=CHART_MODES[chartMode];

  return <main className={`app-shell${readableText?" readable-text":""}`}>
    <header className="topbar"><div className="brand"><span className="brand-mark" aria-hidden="true"/>TI DRIVE COMPANION</div><div className="dataset-badge">Terra Invicta · {drives.length||"—"} active configurations</div></header>
    <section className="hero"><p className="eyebrow">Ship propulsion atlas / 01</p><h1>Find the drive that fits the mission.</h1><p>Map every drive by exhaust velocity and thrust, isolate a technology family, then pin up to four candidates for a direct performance readout.</p></section>
    <section className="workspace">
      <div className="panel"><div className="panel-head"><h2 className="panel-title">Performance envelope</h2><span className="count">{filtered.length} shown</span></div>
        <div className="chart-mode-bar"><div className="chart-mode-toggle" role="group" aria-label="Chart mode">{(Object.keys(CHART_MODES) as ChartMode[]).map(value=><button type="button" key={value} className={chartMode===value?"active":""} onClick={()=>{setChartMode(value);setHovered(null)}} aria-pressed={chartMode===value}>{CHART_MODES[value].label}</button>)}</div><div className="chart-mode-context"><p>{mode.description}</p>{chartMode==="installed"&&radiators.length>0&&<label className="radiator-control"><span>Radiator</span><select className="select" value={radiatorChoice} onChange={event=>{setRadiatorChoice(event.target.value);setHovered(null)}}>{[...radiators].sort((a,b)=>b.specificPower_2s_KWkg-a.specificPower_2s_KWkg||a.friendlyName.localeCompare(b.friendlyName)).map(radiator=><option key={radiator.dataName} value={radiator.dataName}>{radiatorLabel(radiator)}</option>)}</select></label>}</div></div>
        <div className="accessibility-row"><label className="global-font-toggle"><input type="checkbox" checked={readableText} onChange={e=>setReadableText(e.target.checked)}/><span className="toggle-track" aria-hidden="true"><span/></span><span>Larger, clearer text</span></label></div>
        <div className="controls"><div className="search-control"><input className="input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, type, propellant…" aria-label="Search drives"/>{query&&<button className="clear-search" onClick={()=>setQuery("")} aria-label="Clear search filter" title="Clear search">×</button>}</div><PropellantFilter options={propellantOptions} excluded={excludedPropellants} onToggle={togglePropellant} onAll={()=>setExcludedPropellants(new Set())} onNone={()=>setExcludedPropellants(new Set(propellantOptions))}/><DriveTypeFilter groups={familyGroups} excludedFamilies={excludedFamilies} excludedSubtypes={excludedSubtypes} onFamily={toggleFamily} onSubtype={toggleSubtype} onAll={()=>{setExcludedFamilies(new Set());setExcludedSubtypes(new Set())}} onNone={()=>setExcludedFamilies(new Set(familyGroups.map(group=>group.family)))}/><label className="max-toggle"><input type="checkbox" checked={maxOnly} onChange={e=>setMaxOnly(e.target.checked)}/><span className="toggle-track" aria-hidden="true"><span/></span><span>Max thrusters only</span></label><label className="max-toggle"><input type="checkbox" checked={showNames} onChange={e=>setShowNames(e.target.checked)}/><span className="toggle-track" aria-hidden="true"><span/></span><span>Show drive names</span></label><div className="scale-toggle" aria-label="Chart scale"><button className={scale==="log"?"active":""} onClick={()=>setScale("log")} aria-pressed={scale==="log"}>Log</button><button className={scale==="linear"?"active":""} onClick={()=>setScale("linear")} aria-pressed={scale==="linear"}>Linear</button></div></div>
        <div className="legend">{(Object.keys(COLORS) as Family[]).map(n=><span className="legend-item" key={n}><span className="legend-dot" style={{"--dot":COLORS[n]} as React.CSSProperties}/>{n}</span>)}<span>• shape = power-plant subtype</span></div>
        {error?<div className="empty-state">{error}</div>:!drives.length?<div className="loading">Loading drive telemetry…</div>:!plotted.length?<div className="empty-state">No drives match the active filters or have a valid installed system.</div>:<div className="chart-wrap" onMouseLeave={closeTooltipSoon}><svg className="chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={`${mode.label} scatter plot`}>
          {chartMode==="power"&&<><rect className="zero-power-lane" x={chart.left} y={chart.top} width={Math.max(18,px(powerFloor*10)-chart.left)/2} height={chart.height-chart.top-chart.bottom}/><text className="zero-power-label" x={chart.left+8} y={chart.height-chart.bottom-10}>SELF-POWERED · 0 GW</text></>}
          {ticks.map(t=>{const x=chart.left+t*(chart.width-chart.left-chart.right),y=chart.top+(1-t)*(chart.height-chart.top-chart.bottom);const xValue=tickValue(t,domain.xMin,domain.xMax);return <g key={t}><line className="grid-line" x1={x} x2={x} y1={chart.top} y2={chart.height-chart.bottom}/><line className="grid-line" x1={chart.left} x2={chart.width-chart.right} y1={y} y2={y}/><text className="axis-text" x={x} y={chart.height-33} textAnchor="middle">{chartMode==="power"&&t===0?"0":compact(xValue)}</text><text className="axis-text" x={chart.left-10} y={y+3} textAnchor="end">{compact(tickValue(t,domain.yMin,domain.yMax))}</text></g>})}
          <text className="axis-label" x={(chart.left+chart.width-chart.right)/2} y={chart.height-7} textAnchor="middle">{mode.xLabel}</text><text className="axis-label" transform={`translate(15 ${(chart.top+chart.height-chart.bottom)/2}) rotate(-90)`} textAnchor="middle">{mode.yLabel}</text>
          {plotPoints.map(({drive:d,x,y})=>{const active=selected.includes(d.dataName),label=labels.get(d.dataName),show=()=>showTooltip(d,x/chart.width*100,y/chart.height*100);return <g className={`point${active?" selected":""}`} style={{color:COLORS[familyOf(d)],opacity:active?1:.58}} key={d.dataName} onClick={()=>toggle(d.dataName)} onMouseEnter={show} onMouseLeave={closeTooltipSoon} onFocus={show} onBlur={closeTooltipSoon} tabIndex={0} role="button" aria-label={`Compare ${d.friendlyName}`}><PlotShape shape={shapeOf(d)} x={x} y={y} color={COLORS[familyOf(d)]} selected={active}/>{label?.line&&<line className="label-leader" {...label.line}/>}{label&&<text className="point-label" x={label.textX} y={label.textY} textAnchor={label.anchor}>{chartDriveName(d)}</text>}</g>})}
        </svg>{hovered&&(()=>{const system=systems.get(hovered.drive.dataName);return <div className={`tooltip ${hovered.y>62?"above":"below"}`} style={{left:`${Math.min(hovered.x,72)}%`,...(hovered.y>62?{bottom:`${100-Math.max(10,Math.min(hovered.y,88))}%`}:{top:`${Math.max(10,Math.min(hovered.y,88))}%`})}}><strong>{hovered.drive.friendlyName}</strong><div className="tooltip-grid"><span>Thrust</span><span>{compact(hovered.drive.thrust_N," N")}</span><span>Exhaust</span><span>{precise(hovered.drive.EV_kps," km/s")}</span>{chartMode!=="performance"&&<><span>Required power</span><span>{formatRequiredPower(hovered.drive)}</span></>}{chartMode==="installed"&&system&&<><span>Installed mass</span><span>{precise(system.totalMass," t")}</span><span>Specific thrust</span><span>{compact(hovered.drive.thrust_N/system.totalMass," N/t")}</span><span>Auto reactor</span><span>{system.plant?.friendlyName??"Self-powered"}</span><span>Radiator</span><span>{system.radiator?radiatorLabel(system.radiator):(hovered.drive.cooling==="Open"?"Open-cycle":"Not required")}</span></>}<span>Subtype</span><span>{subtypeOf(hovered.drive)}</span><span>Propellant</span><span>{readable(hovered.drive.propellant)}</span></div><div className="tooltip-materials"><span>Tank composition</span><b>{compositionOf(hovered.drive)}</b></div></div>})()}</div>}
      </div>
      <aside className="panel compare-panel"><div className="panel-head"><h2 className="panel-title">Compare</h2><span className="count">{selected.length} / 4</span></div><p className="compare-help">Click a point or search by name and type. Shapes distinguish power-plant subtypes inside each color family.</p>
        {searchResults.length>0&&<div className="results">{searchResults.map(d=><div className="result-row" key={d.dataName}><div><div className="result-name">{d.friendlyName}</div><div className="result-meta">{familyOf(d)} · {subtypeOf(d)}</div></div><button className="add-btn" disabled={selected.length>=4&&!selected.includes(d.dataName)} onClick={()=>toggle(d.dataName)} aria-label={`${selected.includes(d.dataName)?"Remove":"Add"} ${d.friendlyName}`}>{selected.includes(d.dataName)?"−":"+"}</button></div>)}</div>}
        <div className="compare-list">{selectedDrives.length?selectedDrives.map(d=>{const color=COLORS[familyOf(d)];return <article className="drive-card" key={d.dataName}><div className="drive-card-head"><span className={`glyph ${shapeOf(d)}`} style={{"--glyph":color} as React.CSSProperties}/><div><h3>{d.friendlyName}</h3><div className="subtype">{familyOf(d)} · {subtypeOf(d)}</div></div><button className="remove-btn" onClick={()=>toggle(d.dataName)} aria-label={`Remove ${d.friendlyName}`}>×</button></div><div className="metrics"><div className="metric"><div className="metric-label">Thrust</div><div className="metric-value">{compact(d.thrust_N," N")}</div></div><div className="metric"><div className="metric-label">Exhaust velocity</div><div className="metric-value">{precise(d.EV_kps," km/s")}</div></div><div className="metric"><div className="metric-label">Drive mass</div><div className="metric-value">{precise(d.flatMass_tons," t")}</div></div><div className="metric"><div className="metric-label">Propellant</div><div className="metric-value">{readable(d.propellant)}</div></div><div className="metric metric-wide"><div className="metric-label">Tank composition</div><div className="metric-value">{compositionOf(d)}</div></div><div className="metric-section-label">Power</div><div className="metric"><div className="metric-label">Required power</div><div className="metric-value">{formatRequiredPower(d)}</div></div><div className="metric"><div className="metric-label">Thrust / required power</div><div className="metric-value">{formatThrustPerPower(d)}</div></div><div className="metric"><div className="metric-label">Thrust rating</div><div className="metric-value">{new Intl.NumberFormat("en",{maximumFractionDigits:3}).format(thrustRatingGW(d))} GW</div></div><div className="metric"><div className="metric-label">Power timing</div><div className="metric-value">{formatPowerTiming(d)}</div></div><div className="metric metric-wide"><div className="metric-label">Required power plant</div><div className="metric-value">{formatPowerPlant(d)}</div></div><div className="metric metric-wide"><div className="metric-label">Specific power</div><div className="metric-value">{formatSpecificPower(d)}</div></div></div></article>}):<div className="no-selection">Choose drives from the chart to build a comparison.</div>}</div><p className="footer-note">Data loaded at runtime from TIDriveTemplate.json. Disabled configurations are hidden.</p>
      </aside>
    </section>
  </main>
}
