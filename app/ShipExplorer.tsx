"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Ship Explorer - hulls, weapons and support modules.
 *
 * Deliberately a sibling of DriveExplorer rather than an extension of it: drives,
 * power plants and radiators are already solved there, and keeping this separate
 * means upstream changes to that component merge without conflict.
 */

type Hull = {
  dataName: string; friendlyName: string; consTier: number; mass_tons: number; crew: number;
  noseHardpoints: number; hullHardpoints: number; internalModules: number;
  structuralIntegrity: number; alien: boolean; requiredProjectName?: string;
  length_m?: number; volume?: number; missionControl?: number; noShipyardBuild?: boolean;
};

type Weapon = {
  dataName: string; friendlyName?: string; displayName?: string; requiredProjectName?: string;
  mount?: string; attackMode?: boolean; defenseMode?: boolean;
  baseWeaponMass_tons?: number; crew?: number; hp?: number;
  cooldown_s?: number; salvo_shots?: number; intraSalvoCooldown_s?: number;
  targetingRange_km?: number; pivotRange_deg?: number; isPointDefenseTargetable?: boolean;
  bombardmentValue?: number; warheadMass_kg?: number; shotPower_MJ?: number;
  flatDamage_MJ?: number; ammoMass_kg?: number; magazine?: number;
  muzzleVelocity_kps?: number; warheadClass?: string; deltaV_kps?: number;
  efficiency?: number; chargingEnergy_GJ?: number;
  // Laser optics - everything the wiki's effective-range formula needs.
  wavelength_nm?: number; mirrorRadius_cm?: number; beam_quality?: number; jitter_Rad?: number;
};

type ArmorSpecialty = { armorSpecialty: string; value: number };

type Support = {
  dataName: string; friendlyName?: string; displayName?: string; requiredProjectName?: string;
  mass_tons?: number; crew?: number; minConsTier?: number; grouping?: string;
  energyCapacity_GJ?: number; rechargeRate_GJs?: number; heatCapacity_GJ?: number;
  density_kgm3?: number; specialties?: ArmorSpecialty[];
  xRayHalfValue_cm?: number; baryonicHalfValue_cm?: number; heatofVaporization_MJkg?: number;
  weightedBuildMaterials?: { volatiles?: number; metals?: number; nobleMetals?: number; exotics?: number };
  powerRequirement_MW?: number;
};

type Tab = "hulls" | "weapons" | "support" | "loadout";

/**
 * Spoiler gate.
 *
 * There is no single reliable "is alien" flag in the templates, so this is a union
 * of three signals, verified against the 1.0 + Dark Skies data:
 *   - `alien: true`          exists on hulls only (15 of 28)
 *   - two unlock projects    catches alien MISSILES, which carry no "Alien" name at all
 *   - dataName prefix        catches 7 alien lasers gated behind neither of the above
 * Any one alone leaks. Erring toward hiding is intentional: a false positive costs a
 * hidden row, a false negative spoils something.
 */
const ALIEN_PROJECTS = new Set(["Project_AlienMasterProject", "Project_AlienAdvancedMasterProject"]);

function isAlien(entry: { alien?: boolean; requiredProjectName?: string; dataName: string }): boolean {
  if (entry.alien === true) return true;
  if (entry.requiredProjectName && ALIEN_PROJECTS.has(entry.requiredProjectName)) return true;
  return entry.dataName.toLowerCase().startsWith("alien");
}

/**
 * Templates disagree on the display-name field: plasma, particle and heat sinks use
 * displayName where everything else uses friendlyName.
 *
 * The split on the end handles one genuine data wart: VectorThrusters ships with
 * `friendlyName` set to the unspaced dataName, so it renders run-together next to every
 * other module. Only unspaced camelCase names are touched, which is exactly that one
 * entry today - anything already containing a space (including "Mk1" forms) is left
 * alone.
 */
function label(entry: { friendlyName?: string; displayName?: string; dataName: string }): string {
  const name = entry.friendlyName ?? entry.displayName ?? entry.dataName;
  return /\s/.test(name) ? name : name.replace(/([a-z])([A-Z])/g, "$1 $2");
}

const WEAPON_FILES: Array<{ file: string; family: string }> = [
  { file: "TIGunTemplate.json", family: "Gun" },
  { file: "TIMagneticGunTemplate.json", family: "Magnetic" },
  { file: "TILaserWeaponTemplate.json", family: "Laser" },
  { file: "TIPlasmaWeaponTemplate.json", family: "Plasma" },
  { file: "TIParticleWeaponTemplate.json", family: "Particle" },
  { file: "TIMissileTemplate.json", family: "Missile" },
];

const SUPPORT_FILES: Array<{ file: string; group: string }> = [
  { file: "TIShipArmorTemplate.json", group: "Armor" },
  { file: "TIUtilityModuleTemplate.json", group: "Utility" },
  { file: "TIBatteryTemplate.json", group: "Battery" },
  { file: "TIHeatSinkTemplate.json", group: "Heat sink" },
];

const FAMILY_COLORS: Record<string, string> = {
  Gun: "#f4b942", Magnetic: "#65c79f", Laser: "#65b9ec",
  Plasma: "#a38cff", Particle: "#ff6f91", Missile: "#a7b0b8",
};

/**
 * Damage class is not a field - it is a property of the weapon family, and it is the
 * axis that actually decides a loadout. Per the wiki's Spaceships page:
 *   Kinetic   - guns, magnetic, missiles. Damage = ½mv²/20MJ, blocked point-for-point by
 *               armor value, and the only class Adamantane/Boron Carbide resist (-25%).
 *   Thermal   - lasers and plasma. Same armor subtraction, but kinetic resistance does
 *               NOT apply. Plasma is explicitly "kinetic energy applied as thermal".
 *   Radiation - particle beams. Armor never stops it fully; it is attenuated by
 *               half-values instead, and it cannot touch rad-hardened systems at all.
 */
type DamageClass = "Kinetic" | "Thermal" | "Radiation" | "Blast";

const DAMAGE_CLASS: Record<string, DamageClass> = {
  Gun: "Kinetic", Magnetic: "Kinetic", Missile: "Kinetic",
  Laser: "Thermal", Plasma: "Thermal", Particle: "Radiation",
};

/**
 * Missiles do not inherit a single damage class from their family - the warhead decides.
 * Fragmentation and Penetrator warheads are pure kinetic, so Adamantane's -25% applies;
 * nuclear-family warheads deliver payload damage instead, ignore kinetic resistance, and
 * are exempt from overpenetration, so they keep destroying systems until spent.
 */
const BLAST_WARHEADS = new Set(["Nuclear", "ShapedNuclear", "Antimatter"]);

function damageClassOf(weapon: Weapon & { family: string }): DamageClass | undefined {
  if (weapon.family === "Missile" && weapon.warheadClass && BLAST_WARHEADS.has(weapon.warheadClass)) return "Blast";
  return DAMAGE_CLASS[weapon.family];
}

const MOUNT_COUNTS: Record<string, number> = { Half: 0.5, One: 1, Two: 2, Three: 3, Four: 4 };

/**
 * `mount` encodes both how many hardpoints a weapon eats and which kind, e.g.
 * "FourNose" or "TwoHullHoriz". It also covers non-ship emplacements
 * (RegionDefense, TxBaseDefense) which have no place in a ship loadout - those are
 * flagged so they can be filtered out rather than silently padding the list.
 */
function parseMount(mount?: string): { slots: number; where: "nose" | "hull" | "base"; label: string } {
  const value = mount ?? "";
  if (/BaseDefense|RegionDefense/i.test(value)) return { slots: 0, where: "base", label: "base defense" };
  const size = Object.keys(MOUNT_COUNTS).find((k) => value.startsWith(k));
  const where = /Nose/i.test(value) ? "nose" : "hull";
  const slots = size ? MOUNT_COUNTS[size] : 1;
  return { slots, where, label: `${slots}× ${where}` };
}

/**
 * Pareto dominance across the stats that decide whether a hull is worth building.
 *
 * A hull is dominated when another hull is available no later (consTier <=), costs no
 * more mass, and is at least equal on every hardpoint count and structural integrity -
 * while being strictly better somewhere. That is the testable form of the common
 * guidance that certain hulls stop being worth building once a tier opens up.
 */
function dominatedBy(hull: Hull, pool: Hull[]): Hull | null {
  for (const other of pool) {
    if (other.dataName === hull.dataName) continue;
    if (other.consTier > hull.consTier) continue;
    if (other.mass_tons > hull.mass_tons) continue;
    const atLeast =
      other.noseHardpoints >= hull.noseHardpoints &&
      other.hullHardpoints >= hull.hullHardpoints &&
      other.internalModules >= hull.internalModules &&
      other.structuralIntegrity >= hull.structuralIntegrity;
    if (!atLeast) continue;
    const strictly =
      other.noseHardpoints > hull.noseHardpoints ||
      other.hullHardpoints > hull.hullHardpoints ||
      other.internalModules > hull.internalModules ||
      other.structuralIntegrity > hull.structuralIntegrity ||
      other.mass_tons < hull.mass_tons ||
      other.consTier < hull.consTier;
    if (strictly) return other;
  }
  return null;
}

function num(value: unknown, digits = 0): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(value);
}

/**
 * Armor plate geometry, from the 0.4.90 formulas on the wiki's Spaceships page.
 *
 * One "point" of armor is a plate thick enough to absorb 20 MJ (= 1 damage point) over
 * the game's fixed 0.005 m² reference spot:
 *     thickness (m) = 20 / heatOfVaporization / density / 0.005
 * Everything else about armor derives from this, so it is worth computing rather than
 * eyeballing the raw half-value figures.
 */
function plateThickness_cm(entry: Support): number | null {
  if (typeof entry.heatofVaporization_MJkg !== "number" || typeof entry.density_kgm3 !== "number") return null;
  return (20 / entry.heatofVaporization_MJkg / entry.density_kgm3 / 0.005) * 100;
}

/** Areal mass of one point of armor, kg per m² of covered hull. This is the real price. */
function massPerPoint(entry: Support): number | null {
  const thickness = plateThickness_cm(entry);
  if (thickness === null || typeof entry.density_kgm3 !== "number") return null;
  return (thickness / 100) * entry.density_kgm3;
}

/**
 * Points of armor before radiation resistance starts counting AT ALL.
 *
 * Every ship already carries a baseline 4 half-values (1/16) against x-rays and baryons.
 * Armor does not stack on top of that - it REPLACES the baseline once it gets there, so
 * anything below this threshold does literally nothing against particle beams. That makes
 * the threshold, not the raw half-value, the number to compare.
 *
 * Verified against the wiki's own worked examples: Adamantane comes out at 124 points
 * (stated "about 120") and Exotic at 18.5 (stated 18.5).
 */
function pointsToBaseline(entry: Support, kind: "xRay" | "baryonic"): number | null {
  const half = kind === "xRay" ? entry.xRayHalfValue_cm : entry.baryonicHalfValue_cm;
  const thickness = plateThickness_cm(entry);
  if (typeof half !== "number" || thickness === null) return null;
  return (4 * half) / thickness;
}

/**
 * `specialties` mixes two incompatible units under one field name, which is the trap.
 *
 *   XRayResistance / BaryonicResistance - POINTS OF ARMOR PER HALF-VALUE. Adamantane's
 *     31.02 is just 115.8 cm half-value / 3.73 cm per point. LOWER is better, and these
 *     already have dedicated columns.
 *   Everything else (Kinetics, Chipping, Laser) - a genuine damage MULTIPLIER, where
 *     0.75 is the wiki's "25% resistance".
 *
 * Reading the first group as a multiplier labels Adamantane "×31 baryonic", which reads
 * as a strength when it is in fact the worst baryon armor per point in the game. So only
 * the true multipliers are rendered here.
 */
const HALF_VALUE_SPECIALTIES = new Set(["XRayResistance", "BaryonicResistance"]);

function formatSpecialties(list?: ArmorSpecialty[]): Array<{ text: string; good: boolean; bad: boolean }> {
  if (!Array.isArray(list) || !list.length) return [];
  return list
    .filter((s) => typeof s.value === "number" && s.armorSpecialty && s.armorSpecialty !== "None"
      && !HALF_VALUE_SPECIALTIES.has(s.armorSpecialty) && s.value !== 1)
    .map((s) => {
      const name = s.armorSpecialty
        .replace(/Resistance$/, "")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .toLowerCase();
      const text = s.value < 1
        ? `−${Math.round((1 - s.value) * 100)}% ${name}`
        : `+${Math.round((s.value - 1) * 100)}% ${name}`;
      return { text, good: s.value < 1, bad: s.value > 1 };
    });
}

function formatMaterials(m?: Support["weightedBuildMaterials"]): string {
  if (!m) return "—";
  const parts: string[] = [];
  if (m.volatiles) parts.push(`${Math.round(m.volatiles * 100)}% vol`);
  if (m.metals) parts.push(`${Math.round(m.metals * 100)}% met`);
  if (m.nobleMetals) parts.push(`${Math.round(m.nobleMetals * 100)}% nob`);
  if (m.exotics) parts.push(`${Math.round(m.exotics * 100)}% exo`);
  return parts.join(" · ") || "—";
}

/**
 * How fast a beam spreads: metres of spot diameter per kilometre of range.
 *
 *   factor = (1000 / mirrorDiameter) × √( (1.22 · λ · beamQuality)² + (2 · jitter · mirrorDiameter)² )
 *
 * Diffraction dominates for small mirrors, pointing jitter for large ones.
 */
function beamSpreadFactor(weapon: Weapon): number | null {
  const { wavelength_nm, mirrorRadius_cm, beam_quality, jitter_Rad } = weapon;
  if (typeof wavelength_nm !== "number" || typeof mirrorRadius_cm !== "number") return null;
  if (typeof beam_quality !== "number" || typeof jitter_Rad !== "number") return null;
  const diameter_m = (2 * mirrorRadius_cm) / 100;
  if (diameter_m <= 0) return null;
  const diffraction = 1.22 * (wavelength_nm * 1e-9) * beam_quality;
  const pointing = 2 * jitter_Rad * diameter_m;
  return (1000 / diameter_m) * Math.hypot(diffraction, pointing);
}

/**
 * The range past which a laser simply refuses to fire - which is NOT its listed
 * targeting range, and is the single most misleading stat in the ship designer.
 *
 * A laser's damage is spread over its spot, so armor gets more effective with distance:
 *     armorEffectiveness = spotArea / 0.005 m²,  spotArea = π/4 · (range × spreadFactor)²
 * The game gates firing on damage / armorEffectiveness clearing a threshold that depends
 * on the target: 1.0 for an armored ship, 0.15 for a missile. Inverting for range:
 *     range = √( (damage / threshold) × 0.005 / (π/4) ) / spreadFactor
 *
 * The result is capped at the listed targeting range, since that limit still applies.
 * Anything that buffs laser damage (Laser Engines, Directed Energy officers) buys range
 * here as well as damage - the reason weak point-defense turrets scale so unexpectedly.
 */
const LASER_THRESHOLDS = { ship: 1, missile: 0.15 } as const;

function laserEffectiveRange(weapon: Weapon, target: keyof typeof LASER_THRESHOLDS): number | null {
  const factor = beamSpreadFactor(weapon);
  if (factor === null || factor <= 0 || typeof weapon.shotPower_MJ !== "number") return null;
  const damage = weapon.shotPower_MJ / 20;
  const spot_m = Math.sqrt((damage / LASER_THRESHOLDS[target]) * 0.005 / 0.7853982);
  const reach_km = spot_m / factor;
  return Math.min(reach_km, weapon.targetingRange_km ?? Infinity);
}

/**
 * Sustained shots per minute, honouring salvos.
 *
 * A salvo of X shots over Y seconds fires one shot every Y/(X-1) seconds, then the weapon
 * goes on cooldown - so a full cycle is X shots in (Y + cooldown) seconds, not X/cooldown.
 * Comparing raw cooldowns across families gets this badly wrong: the 30mm Autocannon's
 * "4 s cooldown" is really 10 shots per 8.5 s cycle.
 */
function shotsPerMinute(weapon: Weapon): number | null {
  const cooldown = weapon.cooldown_s;
  if (typeof cooldown !== "number" || cooldown <= 0) return null;
  const shots = typeof weapon.salvo_shots === "number" && weapon.salvo_shots > 1 ? weapon.salvo_shots : 1;
  const intra = typeof weapon.intraSalvoCooldown_s === "number" ? weapon.intraSalvoCooldown_s : 0;
  const cycle = cooldown + intra * (shots - 1);
  return cycle > 0 ? (shots / cycle) * 60 : null;
}

/**
 * Damage in POINTS, which is the only unit that compares across families - and the same
 * unit armor is rated in, so "6.8 points" against "12 points of armor" is a real answer.
 *
 * One point is 20 MJ. Beams state their shot power directly; kinetics carry it as muzzle
 * energy, ½mv²/20MJ. Computing the kinetic case rather than reading the stored
 * `damage_MJ` / `expectedDamage_MJ` fields is deliberate: the two agree exactly wherever
 * both exist, but magnetic weapons have no stored field at all and a few guns (the 40mm
 * Nose Autocannon) are missing theirs, so the formula covers cases the field does not.
 *
 * Missiles are handled separately - see missileDamage.
 */
function damagePoints(weapon: Weapon): number | null {
  if (typeof weapon.shotPower_MJ === "number") return weapon.shotPower_MJ / 20;
  if (typeof weapon.warheadMass_kg === "number" && typeof weapon.muzzleVelocity_kps === "number") {
    return (0.5 * weapon.warheadMass_kg * weapon.muzzleVelocity_kps ** 2) / 20;
  }
  if (typeof weapon.flatDamage_MJ === "number") return weapon.flatDamage_MJ / 20;
  return null;
}

function points(value: number): string {
  return `${num(value, value < 10 ? 2 : 0)} pts`;
}

/**
 * Missiles need their own treatment, because `flatDamage_MJ` means different things per
 * warhead class and taking it at face value produces nonsense.
 *
 *   Nuclear / Shaped / Antimatter - the field is a physical YIELD, not a damage figure.
 *     A Python's 188,325,000 MJ is a ~45 kt device; dividing by 20 claims 9.4 million
 *     damage points, which would delete any ship in the game. The real damage depends on
 *     spherical (or cone) falloff from the detonation point, which is an engagement
 *     property, so the yield is reported as a yield and left there.
 *   Explosive - payload plus a tenth of impact energy, so the payload is a floor.
 *   Fragmentation / Penetrator - no payload at all; damage is purely ½mv². Impact
 *     velocity is closing speed plus the missile's own ∆V, and only the ∆V half is known
 *     statically, so this is reported as a lower bound. A head-on intercept hits far
 *     harder than the figure shown.
 */
function missileDamage(weapon: Weapon): string {
  const warheadClass = weapon.warheadClass;
  if (warheadClass && BLAST_WARHEADS.has(warheadClass) && typeof weapon.flatDamage_MJ === "number") {
    const terajoules = weapon.flatDamage_MJ / 1e6;
    return `${num(terajoules, terajoules < 100 ? 1 : 0)} TJ yield`;
  }
  const kinetic = typeof weapon.warheadMass_kg === "number" && typeof weapon.deltaV_kps === "number"
    ? (0.5 * weapon.warheadMass_kg * weapon.deltaV_kps ** 2) / 20
    : null;
  if (warheadClass === "Explosive" && typeof weapon.flatDamage_MJ === "number") {
    return `${points(weapon.flatDamage_MJ / 20)} + impact`;
  }
  return kinetic === null ? "—" : `≥ ${points(kinetic)}`;
}

function damageOf(weapon: Weapon & { family: string }): string {
  if (weapon.family === "Missile") return missileDamage(weapon);
  const value = damagePoints(weapon);
  return value === null ? "—" : points(value);
}

/**
 * Orbital bombardment, from the wiki's Fleets page. It is a capability rule rather than a
 * stat: all magnetic weapons, all lasers with an attack mode, and missiles carrying
 * nuclear-family warheads. Guns, plasma and particle beams can never bombard at all.
 *
 * `bombardmentValue` agrees with that rule for 306 of the 309 weapons in the templates.
 * The three exceptions are systematic rather than noise - every nuclear missile POD (the
 * half-slot version) carries 0 while every equivalent BAY carries a positive value, so
 * the pods look deliberately excluded. The field is trusted over the prose because of
 * that consistency, which means a bombardment ship wants Bays, not Pods.
 *
 * Thick atmospheres block more. Earth and Titan - the only two bombardable bodies with
 * one - reject every missile outright, and every laser outside 380-740 nm. In practice
 * that leaves only the 540 nm green lasers: UV at 270 and IR at 810/1080 are all blocked.
 */
const ATMOSPHERE_MIN_NM = 380;
const ATMOSPHERE_MAX_NM = 740;

function bombardment(weapon: Weapon & { family: string }): { capable: boolean; throughAtmosphere: boolean } {
  const capable = (weapon.bombardmentValue ?? 0) > 0;
  if (!capable) return { capable: false, throughAtmosphere: false };
  if (weapon.family === "Missile") return { capable, throughAtmosphere: false };
  if (weapon.family === "Laser") {
    const nm = weapon.wavelength_nm;
    return { capable, throughAtmosphere: typeof nm === "number" && nm >= ATMOSPHERE_MIN_NM && nm <= ATMOSPHERE_MAX_NM };
  }
  return { capable, throughAtmosphere: true };
}

/**
 * Energy drawn from the ship's power plant per shot, in GJ. Naval guns and missiles are
 * self-powered and draw nothing, which is why they keep firing after the reactor dies.
 *
 *   Laser / particle:  shotPower / efficiency
 *   Magnetic:          ½ × AMMO mass × muzzle velocity² / efficiency  - note this is ammo
 *                      mass, not warhead mass; the sabot has to be accelerated too, so
 *                      power draw is always higher than damage suggests
 *   Plasma:            charging energy plus the same kinetic term
 */
function powerPerShot_GJ(weapon: Weapon & { family: string }): number | null {
  const efficiency = weapon.efficiency;
  if (typeof efficiency !== "number" || efficiency <= 0) return null;
  if (weapon.family === "Gun" || weapon.family === "Missile") return 0;
  if (typeof weapon.shotPower_MJ === "number") return weapon.shotPower_MJ / efficiency / 1000;
  const velocity_ms = typeof weapon.muzzleVelocity_kps === "number" ? weapon.muzzleVelocity_kps * 1000 : null;
  if (velocity_ms === null) return null;
  const mass_kg = weapon.family === "Plasma" ? weapon.warheadMass_kg : weapon.ammoMass_kg;
  if (typeof mass_kg !== "number") return null;
  const kinetic = (0.5 * mass_kg * velocity_ms ** 2) / efficiency / 1e9;
  return kinetic + (weapon.family === "Plasma" ? (weapon.chargingEnergy_GJ ?? 0) / efficiency : 0);
}

/** Waste heat per shot: whatever the weapon's efficiency threw away. */
function heatPerShot_GJ(weapon: Weapon & { family: string }): number | null {
  const power = powerPerShot_GJ(weapon);
  if (power === null || typeof weapon.efficiency !== "number") return null;
  return power * (1 - weapon.efficiency);
}

/**
 * Sustained power demand, GW.
 *
 * The wiki divides energy per shot by Min(cooldown, intra-salvo cooldown) - i.e. it sizes
 * the reactor for the burst rate inside a salvo, not the average over the whole cycle.
 * That is why a fast-salvo weapon demands far more plant than its damage implies.
 */
function powerDraw_GW(weapon: Weapon & { family: string }): number | null {
  const perShot = powerPerShot_GJ(weapon);
  if (perShot === null || typeof weapon.cooldown_s !== "number" || weapon.cooldown_s <= 0) return null;
  const intra = weapon.intraSalvoCooldown_s;
  const interval = typeof intra === "number" && intra > 0 ? Math.min(weapon.cooldown_s, intra) : weapon.cooldown_s;
  return interval > 0 ? perShot / interval : null;
}

/* ------------------------------------------------------------------------- *
 * Loadout
 *
 * The join the three tabs were missing. A hull is a budget - so many nose
 * hardpoints, hull hardpoints and utility slots - and everything else is spend
 * against it. Reading the tables separately hides the only question that
 * matters: does this actually fit, and what does the reactor have to carry?
 * ------------------------------------------------------------------------- */

type SlotKind = "nose" | "hull" | "utility";

/** Fitted items are keyed by family + dataName, since names repeat across families. */
type Loadout = Record<string, number>;

const keyOf = (item: { dataName: string }, family: string) => `${family}:${item.dataName}`;

type Totals = {
  used: Record<SlotKind, number>;
  mass_tons: number;
  crew: number;
  weaponsPower_GW: number;
  heat_GJs: number;
  damagePerMinute: number;
  unknownPower: number;
};

/**
 * Required Systems Power, GW - the hotel load, before any weapon fires.
 *   1.1 × (crew × 5 kW + consTier × 5 MW + Σ module power)
 * Crew is the WHOLE ship's crew, so weapon and module crew count toward it.
 */
function systemsPower_GW(hull: Hull, crew: number, modulePower_MW: number): number {
  return 1.1 * (crew * 0.000005 + hull.consTier * 0.005 + modulePower_MW * 0.001);
}

/**
 * Roll a loadout up into the numbers a design is judged on.
 *
 * `unknownPower` counts fitted weapons whose draw could not be derived, so a total is
 * never quietly reported as complete when part of it is missing.
 */
function summarise(
  loadout: Loadout,
  weapons: Array<Weapon & { family: string }>,
  modules: Support[],
): Totals {
  const totals: Totals = {
    used: { nose: 0, hull: 0, utility: 0 },
    mass_tons: 0, crew: 0, weaponsPower_GW: 0, heat_GJs: 0, damagePerMinute: 0, unknownPower: 0,
  };

  for (const weapon of weapons) {
    const count = loadout[keyOf(weapon, weapon.family)] ?? 0;
    if (!count) continue;
    const mount = parseMount(weapon.mount);
    if (mount.where === "base") continue;
    totals.used[mount.where] += mount.slots * count;
    totals.mass_tons += (weapon.baseWeaponMass_tons ?? 0) * count;
    totals.crew += (weapon.crew ?? 0) * count;

    const draw = powerDraw_GW(weapon);
    if (draw === null) totals.unknownPower += count;
    else totals.weaponsPower_GW += draw * count;

    const heat = heatPerShot_GJ(weapon);
    const rpm = shotsPerMinute(weapon);
    if (heat !== null && rpm !== null) totals.heat_GJs += (heat * rpm / 60) * count;

    // Nuclear yields are not damage points, so they would swamp any sum they entered.
    const perShot = weapon.family === "Missile" && BLAST_WARHEADS.has(weapon.warheadClass ?? "")
      ? null
      : damagePoints(weapon);
    if (perShot !== null && rpm !== null) totals.damagePerMinute += perShot * rpm * count;
  }

  for (const module of modules) {
    const count = loadout[keyOf(module, "Utility")] ?? 0;
    if (!count) continue;
    totals.used.utility += count;
    totals.mass_tons += (module.mass_tons ?? 0) * count;
    totals.crew += (module.crew ?? 0) * count;
  }

  return totals;
}

function modulePower_MW(loadout: Loadout, modules: Support[]): number {
  return modules.reduce((sum, m) => sum + (m.powerRequirement_MW ?? 0) * (loadout[keyOf(m, "Utility")] ?? 0), 0);
}

/** Free slots of each kind, given a hull and what is already fitted. */
function capacityOf(hull: Hull): Record<SlotKind, number> {
  return { nose: hull.noseHardpoints, hull: hull.hullHardpoints, utility: hull.internalModules };
}

/**
 * Narrow a parsed mount to a hull slot. Base and region emplacements return null - they
 * are not ship equipment and have no budget to spend against, so callers must decide what
 * to do rather than silently charging them to a hardpoint.
 */
function slotKind(where: "nose" | "hull" | "base"): SlotKind | null {
  return where === "base" ? null : where;
}

export function ShipExplorer() {
  const [hulls, setHulls] = useState<Hull[]>([]);
  const [weapons, setWeapons] = useState<Array<Weapon & { family: string }>>([]);
  const [support, setSupport] = useState<Array<Support & { group: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("hulls");
  const [showAlien, setShowAlien] = useState(false);
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState<string>("All");
  const [role, setRole] = useState<"All" | "Attack" | "Defense">("All");
  const [showBaseDefense, setShowBaseDefense] = useState(false);
  const [supportGroup, setSupportGroup] = useState<"Armor" | "Utility" | "Battery" | "Heat sink">("Armor");
  const [hullChoice, setHullChoice] = useState<string>("");
  const [loadout, setLoadout] = useState<Loadout>({});

  useEffect(() => {
    const load = async (file: string) => {
      const response = await fetch(`/data/${file}`);
      if (!response.ok) throw new Error(`Could not load ${file}.`);
      return response.json();
    };
    Promise.all([
      load("TIShipHullTemplate.json"),
      Promise.all(WEAPON_FILES.map(async (w) => (await load(w.file)).map((e: Weapon) => ({ ...e, family: w.family })))),
      Promise.all(SUPPORT_FILES.map(async (s) => (await load(s.file)).map((e: Support) => ({ ...e, group: s.group })))),
    ])
      .then(([hullValues, weaponGroups, supportGroups]) => {
        setHulls(hullValues as Hull[]);
        setWeapons(weaponGroups.flat());
        setSupport(supportGroups.flat());
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load ship data."));
  }, []);

  const visibleHulls = useMemo(
    () =>
      hulls
        .filter((h) => (showAlien || !isAlien(h)) && label(h).toLowerCase().includes(search.toLowerCase()))
        // Template order is arbitrary (the STO Fighter sits last despite being tier 1).
        // Tier then mass is the order you actually unlock and choose between them.
        .sort((a, b) => a.consTier - b.consTier || a.mass_tons - b.mass_tons),
    [hulls, showAlien, search],
  );

  // Dominance is judged only against hulls you can actually build, so hiding alien
  // hulls does not silently mark a human hull "dominated" by something unavailable.
  const dominancePool = useMemo(() => hulls.filter((h) => showAlien || !isAlien(h)), [hulls, showAlien]);

  const visibleWeapons = useMemo(
    () =>
      weapons.filter((w) => {
        if (!showAlien && isAlien(w)) return false;
        // Base and region emplacements are not ship equipment; they'd pad the list
        // with 37 entries you can never fit to a hardpoint.
        if (!showBaseDefense && parseMount(w.mount).where === "base") return false;
        if (family !== "All" && w.family !== family) return false;
        if (role === "Attack" && !w.attackMode) return false;
        if (role === "Defense" && !w.defenseMode) return false;
        return label(w).toLowerCase().includes(search.toLowerCase());
      }),
    [weapons, showAlien, showBaseDefense, family, role, search],
  );

  const visibleSupport = useMemo(
    () => support.filter((s) => (showAlien || !isAlien(s)) && label(s).toLowerCase().includes(search.toLowerCase())),
    [support, showAlien, search],
  );

  const selectedHull = useMemo(
    () => visibleHulls.find((h) => h.dataName === hullChoice) ?? null,
    [visibleHulls, hullChoice],
  );

  // Utility modules are the only support group that occupies a hull slot; armor,
  // batteries and heat sinks are fitted elsewhere and are not part of this budget.
  const utilityModules = useMemo(() => support.filter((s) => s.group === "Utility" && (showAlien || !isAlien(s))), [support, showAlien]);

  const fittable = useMemo(
    () => weapons.filter((w) => (showAlien || !isAlien(w)) && parseMount(w.mount).where !== "base"),
    [weapons, showAlien],
  );

  const totals = useMemo(() => summarise(loadout, fittable, utilityModules), [loadout, fittable, utilityModules]);

  const power = useMemo(() => {
    if (!selectedHull) return null;
    const crew = selectedHull.crew + totals.crew;
    return {
      systems_GW: systemsPower_GW(selectedHull, crew, modulePower_MW(loadout, utilityModules)),
      crew,
    };
  }, [selectedHull, totals, loadout, utilityModules]);

  // Fittings deliberately survive a hull change. "Does this loadout fit a Frigate, or do I
  // need a Cruiser?" is the question this tab exists to answer, and clearing on every
  // change would throw the comparison away. An overflowing hull reports it instead: the
  // slot card turns red and says how far over it is.

  const adjust = (key: string, delta: number) =>
    setLoadout((current) => {
      const next = (current[key] ?? 0) + delta;
      if (next <= 0) { const { [key]: _removed, ...rest } = current; return rest; }
      return { ...current, [key]: next };
    });

  const hiddenCount = useMemo(() => {
    if (showAlien) return 0;
    return [
      hulls.filter(isAlien).length,
      weapons.filter(isAlien).length,
      support.filter(isAlien).length,
    ].reduce((a, b) => a + b, 0);
  }, [hulls, weapons, support, showAlien]);

  if (error) return <main className="app-shell"><div className="empty-state">{error}</div></main>;

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="brand"><span className="brand-mark" /> TI SHIP COMPANION</div>
        <div className="eyebrow">SHIP DESIGN ATLAS / 02</div>
        <h1>Pick the hull before you pick the gun.</h1>
        <p>
          Hulls, weapons and support modules from your installed game data. Drives, reactors and
          radiators live in the <a href="/">Drive Companion</a>.
        </p>
        <div className="dataset-badge">
          Terra Invicta · {hulls.length || "—"} hulls · {weapons.length || "—"} weapons · {support.length || "—"} support modules
        </div>
      </header>

      <section className="ship-controls">
        <div className="chart-mode-toggle">
          {(["hulls", "weapons", "support", "loadout"] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
              {t === "hulls" ? "Hulls" : t === "weapons" ? "Weapons" : t === "support" ? "Armor & modules" : "Loadout"}
            </button>
          ))}
        </div>

        <input
          className="input"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {tab === "weapons" && (
          <>
            <select className="input" value={family} onChange={(e) => setFamily(e.target.value)}>
              <option>All</option>
              {WEAPON_FILES.map((w) => <option key={w.family}>{w.family}</option>)}
            </select>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              <option value="All">All roles</option>
              <option value="Attack">Attack</option>
              <option value="Defense">Point defense</option>
            </select>
            <label className="spoiler-toggle">
              <input type="checkbox" checked={showBaseDefense} onChange={(e) => setShowBaseDefense(e.target.checked)} />
              <span>Include base / region defenses</span>
            </label>
          </>
        )}

        <label className="spoiler-toggle">
          <input type="checkbox" checked={showAlien} onChange={(e) => setShowAlien(e.target.checked)} />
          <span>Show alien equipment{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ""}</span>
        </label>
      </section>

      {!showAlien && (
        <p className="spoiler-note">
          Alien hulls, weapons and modules are hidden. Turning them on reveals late-game
          equipment you may not have researched yet.
        </p>
      )}

      {tab === "hulls" && (
        <section className="table-wrap">
          <table className="ship-table">
            <thead>
              <tr>
                <th>Hull</th><th>Tier</th><th>Nose</th><th>Hull</th><th>Internal</th>
                <th>Structure</th><th>Mass (t)</th><th>Crew</th>
                <th>Guns / kt</th><th>Structure / kt</th><th>Crew / gun</th>
              </tr>
            </thead>
            <tbody>
              {visibleHulls.map((h) => {
                const guns = h.noseHardpoints + h.hullHardpoints;
                const kt = h.mass_tons / 1000;
                const gunsPerKt = kt ? guns / kt : 0;
                const siPerKt = kt ? h.structuralIntegrity / kt : 0;
                // Retained so modded data still surfaces genuinely redundant hulls.
                // Against vanilla 1.0 nothing triggers it - see the note below.
                const beaten = dominatedBy(h, dominancePool);
                return (
                  <tr key={h.dataName} className={beaten ? "is-dominated" : ""}>
                    <td className="name-cell">
                      {label(h)}
                      {isAlien(h) && <span className="alien-tag">alien</span>}
                      {beaten && <span className="verdict-bad"> · dominated by {label(beaten)}</span>}
                    </td>
                    <td>{h.consTier}</td><td>{h.noseHardpoints}</td><td>{h.hullHardpoints}</td>
                    <td>{h.internalModules}</td><td>{h.structuralIntegrity}</td>
                    <td>{num(h.mass_tons)}</td><td>{num(h.crew)}</td>
                    <td className={gunsPerKt >= 5 ? "stat-good" : gunsPerKt < 4 ? "stat-poor" : ""}>{num(gunsPerKt, 1)}</td>
                    <td className={siPerKt >= 25 ? "stat-good" : siPerKt < 20 ? "stat-poor" : ""}>{num(siPerKt, 1)}</td>
                    <td>{num(guns ? h.crew / guns : 0, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="footer-note">
            <strong>No vanilla hull is strictly dominated</strong> — every one trades something (the Monitor
            gives up its nose mounts for broadside hardpoints; the Lancer trades structure for nose weapons).
            The efficiency columns are what actually separate them: <strong>guns per kilotonne is close to flat
            at ~5 across every tier</strong>, so bigger hulls buy concentration and toughness, not firepower per
            tonne. The Battleship has the best structure-per-tonne in the game; the Lancer and Titan are
            <em> less</em> mass-efficient than a Frigate.
          </p>
        </section>
      )}

      {tab === "weapons" && (
        <section className="table-wrap">
          <table className="ship-table">
            <thead>
              <tr>
                <th>Weapon</th><th>Family</th><th>Damage</th><th>Mount</th><th>Role</th>
                <th>Mass (t)</th><th>Crew</th><th>Shots/min</th><th>Listed range</th>
                <th>Real range</th><th>Damage</th><th>Bombard</th><th>PD-stoppable</th>
              </tr>
            </thead>
            <tbody>
              {visibleWeapons.map((w) => {
                const mount = parseMount(w.mount);
                const cls = damageClassOf(w);
                const rpm = shotsPerMinute(w);
                const bomb = bombardment(w);
                // Only lasers have a damage-gated firing range; every other family fires
                // out to its listed range, so there is nothing to correct for them.
                const vsShip = w.family === "Laser" ? laserEffectiveRange(w, "ship") : null;
                const vsMissile = w.family === "Laser" ? laserEffectiveRange(w, "missile") : null;
                const listed = w.targetingRange_km;
                const capped = typeof listed === "number" && vsShip !== null && vsShip < listed - 1;
                return (
                  <tr key={`${w.family}:${w.dataName}`}>
                    <td className="name-cell">{label(w)}{isAlien(w) && <span className="alien-tag">alien</span>}</td>
                    <td><span className="family-dot" style={{ background: FAMILY_COLORS[w.family] }} />{w.family}</td>
                    <td className={`dmg-${cls?.toLowerCase()}`}>
                      {cls ?? "—"}
                      {w.warheadClass && <><br /><span className="sub">{w.warheadClass.replace(/([a-z])([A-Z])/g, "$1 $2")}</span></>}
                    </td>
                    <td>{mount.label}</td>
                    <td>{[w.attackMode && "Attack", w.defenseMode && "PD"].filter(Boolean).join(" + ") || "—"}</td>
                    <td>{num(w.baseWeaponMass_tons, 1)}</td><td>{num(w.crew)}</td>
                    <td>{rpm === null ? "—" : num(rpm, 1)}</td>
                    <td>{num(listed)}</td>
                    <td className={capped ? "stat-poor" : ""}>
                      {vsShip === null ? "—" : (
                        <>
                          {num(vsShip)}<span className="sub"> vs ship</span>
                          {vsMissile !== null && <><br />{num(vsMissile)}<span className="sub"> vs missile</span></>}
                        </>
                      )}
                    </td>
                    <td>{damageOf(w)}</td>
                    <td className={bomb.capable ? "stat-good" : ""}>
                      {!bomb.capable ? "no" : bomb.throughAtmosphere ? "yes — inc. Earth" : (
                        <>yes<span className="sub"> — airless only</span></>
                      )}
                    </td>
                    <td className={w.isPointDefenseTargetable ? "stat-poor" : "stat-good"}>
                      {w.isPointDefenseTargetable ? "yes — interceptable" : "no"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="footer-note">
            <strong>Damage class</strong> decides what a weapon is for. <span className="dmg-kinetic">Kinetic</span> (guns,
            magnetic, missiles) is the only class Adamantane and Boron Carbide resist, at −25%.
            <span className="dmg-thermal"> Thermal</span> (lasers, plasma) is blocked the same way but ignores that
            resistance — plasma is literally kinetic energy relabelled as thermal.
            <span className="dmg-radiation"> Radiation</span> (particle) is never fully stopped: armor only attenuates it in
            half-values, and it cannot touch rad-hardened systems at all.
            <span className="dmg-blast"> Blast</span> is the nuclear-family missile warheads, which deliver payload damage
            rather than impact energy and are the only weapons <em>exempt from overpenetration</em> — they keep destroying
            systems until spent, rather than punching out the far side with damage unused.
            <strong> Damage is in points</strong> (1 point = 20 MJ), the same unit as armor, so the two compare directly.
          </p>
          <p className="footer-note">
            <strong>Bombard</strong> is narrower than it looks. Only magnetic weapons, lasers with an attack mode, and
            nuclear-family missiles can bombard at all — guns, plasma and particle beams never can. Then a thick
            atmosphere blocks more: <strong>Earth and Titan reject every missile</strong>, and every laser outside
            380–740 nm, which in practice leaves only the <strong>540 nm green lasers</strong> — UV and IR are both shut
            out. Two consequences worth designing around: a ship meant to hit Earth wants green lasers or magnetic
            weapons, and <strong>nuclear missile <em>Pods</em> cannot bombard while the identical <em>Bays</em> can</strong>
            {" "}— all three half-slot nuclear pods carry a bombardment value of zero where every full-slot bay does not.
          </p>
          <p className="footer-note">
            <strong>Missiles cannot be reduced to a single number</strong>, so they are not pretended into one.
            Fragmentation and Penetrator warheads carry no payload at all — their damage is pure impact energy, and impact
            velocity is closing speed <em>plus</em> the missile&apos;s own ∆V. Only the ∆V half is knowable from the
            template, so those show <strong>≥</strong> a floor; a head-on intercept hits far harder. Explosive warheads add
            a tenth of impact energy on top of their payload. Nuclear-family warheads are listed as a{" "}
            <strong>yield in terajoules</strong> rather than points, because the stored figure is a physical yield — a
            Python is a ~45 kt device — and what actually lands depends on falloff from the detonation point.
          </p>
          <p className="footer-note">
            <strong>Real range is the one that matters for lasers.</strong> A laser will not fire unless its damage still
            beats the target&apos;s armor at that distance, and the beam spreads with range — so most laser ranges in the
            designer are aspirational. The Point Defense Laser Turret lists 250 km but only engages a ship inside{" "}
            <strong>≈48 km</strong>. Every laser here is computed from its own mirror, wavelength, beam quality and jitter;
            anything that buffs laser damage (Laser Engines, Directed Energy officers) buys range as well as damage.
            Lasers also have <strong>1 hp regardless of size</strong>, against 3×hardpoints for everything else — they are
            glass cannons, and the reason particle beams hunt them.
          </p>
          <p className="footer-note">
            <strong>Shots per minute</strong> accounts for salvos: X shots then a cooldown means a full cycle of
            X ÷ (cooldown + gaps), not one shot per cooldown. <strong>Stoppable by PD</strong> is the other axis — every
            railgun and missile can be shot down in flight, while lasers, plasma and particle beams cannot.
            <strong> Mount</strong> is how many nose or hull hardpoints the weapon consumes, so cross-reference it against
            the Hulls tab before committing to a design.
          </p>
        </section>
      )}

      {tab === "support" && (
        <section className="table-wrap">
          <div className="chart-mode-toggle group-toggle">
            {(["Armor", "Utility", "Battery", "Heat sink"] as const).map((g) => (
              <button key={g} className={supportGroup === g ? "active" : ""} onClick={() => setSupportGroup(g)}>{g}</button>
            ))}
          </div>

          {/* Each group is measured by different things, so they get different columns
              rather than one lowest-common-denominator "Capacity" column. */}
          {supportGroup === "Armor" && (
            <>
              <table className="ship-table">
                <thead>
                  <tr>
                    <th>Armor</th><th>Density</th><th>Thickness / point</th><th>Mass / point</th>
                    <th>Points to beat baseline<br /><span className="sub">x-ray · baryon</span></th>
                    <th>Bonuses</th><th>Materials</th>
                  </tr>
                </thead>
                <tbody>
                  {[...visibleSupport.filter((s) => s.group === "Armor")]
                    .sort((a, b) => (massPerPoint(a) ?? Infinity) - (massPerPoint(b) ?? Infinity))
                    .map((s) => {
                      const perPoint = massPerPoint(s);
                      const thickness = plateThickness_cm(s);
                      const xray = pointsToBaseline(s, "xRay");
                      const baryon = pointsToBaseline(s, "baryonic");
                      return (
                        <tr key={s.dataName}>
                          <td className="name-cell">{label(s)}{isAlien(s) && <span className="alien-tag">alien</span>}</td>
                          <td>{num(s.density_kgm3)}</td>
                          <td>{thickness === null ? "—" : `${num(thickness, 2)} cm`}</td>
                          <td className={perPoint !== null && perPoint <= 70 ? "stat-good" : perPoint !== null && perPoint >= 400 ? "stat-poor" : ""}>
                            {perPoint === null ? "—" : `${num(perPoint)} kg/m²`}
                          </td>
                          <td className={baryon !== null && baryon <= 20 ? "stat-good" : baryon !== null && baryon >= 75 ? "stat-poor" : ""}>
                            {xray === null ? "—" : num(xray, 1)} · {baryon === null ? "—" : num(baryon, 1)}
                          </td>
                          <td>
                            {formatSpecialties(s.specialties).length === 0 ? "—" :
                              formatSpecialties(s.specialties).map((sp) => (
                                <span key={sp.text} className={sp.good ? "stat-good" : sp.bad ? "stat-poor" : ""}>
                                  {sp.text}{" "}
                                </span>
                              ))}
                          </td>
                          <td>{formatMaterials(s.weightedBuildMaterials)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              <p className="footer-note">
                Sorted by <strong>mass per point</strong> — the price of armor, in kilograms per square metre of hull
                covered. A point of armor is a plate thick enough to absorb 20 MJ, so tougher materials buy the same
                protection for far less mass: Hybrid costs <strong>50 kg/m²</strong> against Steel&apos;s{" "}
                <strong>588</strong>. Remember that a point of <em>side</em> armor is 10–35× heavier than nose or tail,
                because of the surface area it has to wrap.
              </p>
              <p className="footer-note">
                <strong>Points to beat baseline</strong> is the particle-beam number, and it is a cliff rather than a
                curve. Every ship already has 4 half-values (1/16) of innate radiation resistance, and armor{" "}
                <em>replaces</em> that baseline rather than adding to it — so armor below this figure does nothing at all
                against particle beams. Adamantane looks superb on paper but needs <strong>124 points</strong> to start
                resisting baryons, where Exotic needs <strong>18.5</strong>. Baryon damage is also multiplied by 5, and
                every armor except Boron Carbide is far weaker against baryons than x-rays, so the baryon figure is the
                one to read. Nothing ever reduces radiation damage to zero.
              </p>
            </>
          )}

          {supportGroup === "Battery" && (
            <table className="ship-table">
              <thead>
                <tr><th>Battery</th><th>Mass (t)</th><th>Crew</th><th>Capacity (GJ)</th><th>Recharge (GJ/s)</th><th>GJ per tonne</th></tr>
              </thead>
              <tbody>
                {visibleSupport.filter((s) => s.group === "Battery").map((s) => (
                  <tr key={s.dataName}>
                    <td className="name-cell">{label(s)}{isAlien(s) && <span className="alien-tag">alien</span>}</td>
                    <td>{num(s.mass_tons, 1)}</td><td>{num(s.crew)}</td>
                    <td>{num(s.energyCapacity_GJ, 1)}</td><td>{num(s.rechargeRate_GJs, 2)}</td>
                    <td>{s.mass_tons ? num((s.energyCapacity_GJ ?? 0) / s.mass_tons, 2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {supportGroup === "Heat sink" && (
            <table className="ship-table">
              <thead>
                <tr><th>Heat sink</th><th>Mass (t)</th><th>Crew</th><th>Heat capacity (GJ)</th><th>GJ per tonne</th></tr>
              </thead>
              <tbody>
                {visibleSupport.filter((s) => s.group === "Heat sink").map((s) => (
                  <tr key={s.dataName}>
                    <td className="name-cell">{label(s)}{isAlien(s) && <span className="alien-tag">alien</span>}</td>
                    <td>{num(s.mass_tons, 1)}</td><td>{num(s.crew)}</td>
                    <td>{num(s.heatCapacity_GJ, 1)}</td>
                    <td>{s.mass_tons ? num((s.heatCapacity_GJ ?? 0) / s.mass_tons, 2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {supportGroup === "Utility" && (
            <table className="ship-table">
              <thead>
                <tr><th>Module</th><th>Grouping</th><th>Min tier</th><th>Mass (t)</th><th>Crew</th><th>Power (MW)</th></tr>
              </thead>
              <tbody>
                {[...visibleSupport.filter((s) => s.group === "Utility")]
                  .sort((a, b) => (a.minConsTier ?? 0) - (b.minConsTier ?? 0))
                  .map((s) => (
                    <tr key={s.dataName}>
                      <td className="name-cell">{label(s)}{isAlien(s) && <span className="alien-tag">alien</span>}</td>
                      <td>{s.grouping ?? "—"}</td><td>{s.minConsTier ?? "—"}</td>
                      <td>{num(s.mass_tons, 1)}</td><td>{num(s.crew)}</td>
                      <td>{num(s.powerRequirement_MW, 1)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === "loadout" && (
        <section className="table-wrap">
          <div className="loadout-hull-picker">
            <label htmlFor="hull-select">Hull</label>
            <select
              id="hull-select"
              className="input"
              value={hullChoice}
              onChange={(e) => setHullChoice(e.target.value)}
            >
              <option value="">Choose a hull…</option>
              {visibleHulls.map((h) => (
                <option key={h.dataName} value={h.dataName}>
                  {label(h)} — T{h.consTier}, {h.noseHardpoints}N / {h.hullHardpoints}H / {h.internalModules}U
                </option>
              ))}
            </select>
            {selectedHull && Object.keys(loadout).length > 0 && (
              <button className="link-button" onClick={() => setLoadout({})}>Clear fittings</button>
            )}
          </div>

          {!selectedHull ? (
            <div className="empty-state">
              Pick a hull to start. Its hardpoints become the budget, and everything you fit is
              measured against it.
            </div>
          ) : (
            <>
              <div className="loadout-summary">
                {(["nose", "hull", "utility"] as SlotKind[]).map((kind) => {
                  const capacity = capacityOf(selectedHull)[kind];
                  const used = totals.used[kind];
                  const over = used > capacity;
                  return (
                    <div key={kind} className={`stat-card ${over ? "is-over" : ""}`}>
                      <span className="stat-label">{kind === "utility" ? "Utility slots" : `${kind} hardpoints`}</span>
                      <span className="stat-value">{num(used, 1)} / {capacity}</span>
                      <span className="sub">{over ? `over by ${num(used - capacity, 1)}` : `${num(capacity - used, 1)} free`}</span>
                    </div>
                  );
                })}
                <div className="stat-card">
                  <span className="stat-label">Mass fitted</span>
                  <span className="stat-value">{num(totals.mass_tons)} t</span>
                  <span className="sub">hull {num(selectedHull.mass_tons)} t + fittings</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Crew</span>
                  <span className="stat-value">{num(power?.crew ?? selectedHull.crew)}</span>
                  <span className="sub">+{num(totals.crew)} from fittings · {num((power?.crew ?? 0) * 4)} t life support</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Power demand</span>
                  <span className="stat-value">{num((power?.systems_GW ?? 0) + totals.weaponsPower_GW, 2)} GW</span>
                  <span className="sub">
                    {num(power?.systems_GW ?? 0, 2)} systems + {num(totals.weaponsPower_GW, 2)} weapons
                    {totals.unknownPower > 0 && ` · ${totals.unknownPower} unknown`}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Waste heat</span>
                  <span className="stat-value">{num(totals.heat_GJs, 2)} GJ/s</span>
                  <span className="sub">sustained fire, radiators retracted</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Damage output</span>
                  <span className="stat-value">{num(totals.damagePerMinute)} pts/min</span>
                  <span className="sub">excludes nuclear yields</span>
                </div>
              </div>

              <table className="ship-table">
                <thead>
                  <tr>
                    <th>Fit</th><th>Item</th><th>Family</th><th>Mount</th><th>Mass (t)</th>
                    <th>Crew</th><th>Power</th><th>Damage / min</th><th>Fitted</th>
                  </tr>
                </thead>
                <tbody>
                  {[...fittable, ...utilityModules.map((m) => ({ ...m, family: "Utility" }))]
                    .filter((item) => label(item).toLowerCase().includes(search.toLowerCase()))
                    .filter((item) => {
                      // Anything already fitted stays listed even if it no longer fits, so
                      // switching to a smaller hull shows you WHAT is overflowing rather
                      // than just that something is.
                      if (loadout[keyOf(item, item.family)]) return true;
                      // Otherwise hide what this hull could never take even when empty:
                      // a 4-slot nose cannon on a Gunship is noise, not a choice.
                      if (item.family === "Utility") return selectedHull.internalModules > 0;
                      const mount = parseMount((item as Weapon).mount);
                      const kind = slotKind(mount.where);
                      return kind !== null && mount.slots <= capacityOf(selectedHull)[kind];
                    })
                    .map((item) => {
                      const key = keyOf(item, item.family);
                      const fitted = loadout[key] ?? 0;
                      const isUtility = item.family === "Utility";
                      const parsed = isUtility
                        ? { slots: 1, where: "utility" as const, label: "1× utility" }
                        : parseMount((item as Weapon).mount);
                      const kind: SlotKind | null = parsed.where === "utility" ? "utility" : slotKind(parsed.where);
                      const free = kind === null ? 0 : capacityOf(selectedHull)[kind] - totals.used[kind];
                      const canAdd = kind !== null && parsed.slots <= free;
                      const weapon = item as Weapon & { family: string };
                      // Modules draw single-digit MW where weapons draw GW, so a shared
                      // GW column renders every module as "0 GW". Each keeps its own unit.
                      const moduleDraw_MW = isUtility ? (item as Support).powerRequirement_MW ?? 0 : 0;
                      const draw = isUtility ? null : powerDraw_GW(weapon);
                      const rpm = isUtility ? null : shotsPerMinute(weapon);
                      const perShot = isUtility || BLAST_WARHEADS.has(weapon.warheadClass ?? "")
                        ? null
                        : damagePoints(weapon);
                      return (
                        <tr key={key} className={fitted ? "is-fitted" : ""}>
                          <td className="fit-cell">
                            <button className="fit-button" disabled={!canAdd} onClick={() => adjust(key, 1)}>+</button>
                            <button className="fit-button" disabled={!fitted} onClick={() => adjust(key, -1)}>−</button>
                          </td>
                          <td className="name-cell">{label(item)}{isAlien(item) && <span className="alien-tag">alien</span>}</td>
                          <td>
                            <span className="family-dot" style={{ background: FAMILY_COLORS[item.family] ?? "#7d8894" }} />
                            {item.family}
                          </td>
                          <td className={canAdd ? "" : "stat-poor"}>{parsed.label}</td>
                          <td>{num(isUtility ? (item as Support).mass_tons : weapon.baseWeaponMass_tons, 1)}</td>
                          <td>{num(item.crew)}</td>
                          <td>
                            {isUtility
                              ? (moduleDraw_MW ? `${num(moduleDraw_MW)} MW` : "—")
                              : draw === null ? "—" : draw === 0 ? "self-powered" : `${num(draw, 2)} GW`}
                          </td>
                          <td>{perShot !== null && rpm !== null ? num(perShot * rpm) : "—"}</td>
                          <td className={fitted ? "stat-good" : ""}>{fitted || "—"}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>

              <p className="footer-note">
                <strong>Power demand is the constraint the hardpoint count hides.</strong> Systems load is
                1.1 × (crew × 5 kW + tier × 5 MW + module draw); weapons are sized on their <em>burst</em> rate —
                energy per shot ÷ the shorter of cooldown and intra-salvo gap — so a fast-salvo weapon demands far more
                reactor than its damage suggests. Naval guns and missiles are <strong>self-powered</strong>: they draw
                nothing and generate no heat, which is why they keep firing after the reactor is gone.
              </p>
              <p className="footer-note">
                <strong>Waste heat</strong> assumes sustained fire with radiators retracted, which is the combat case —
                extended radiators are unarmored and bleed damage straight into the hull. That figure is what your heat
                sinks have to absorb before the radiators are forced out. Compare it against the{" "}
                <a href="/">Drive Companion</a> for reactors and radiators; mass here excludes armor, propellant and the
                drive, so it is what the <em>fittings</em> cost, not the finished ship.
              </p>
            </>
          )}
        </section>
      )}

      <p className="footer-note">
        Data loaded at runtime from your installed Terra Invicta templates. Alien equipment is
        hidden by default.
      </p>
    </main>
  );
}
