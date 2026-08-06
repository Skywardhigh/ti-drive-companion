#!/usr/bin/env node
/**
 * Check the derived-stat formulas in ShipExplorer against the worked examples the wiki
 * publishes, using the live template data.
 *
 *     node scripts/verify-formulas.mjs
 *
 * Run this after `npm run sync-data`. The formulas are stated for game version 0.4.90;
 * if a patch changes armor or laser maths, the templates keep loading fine and every
 * number in the UI silently becomes wrong. This is what notices.
 *
 * The maths here is deliberately a SECOND implementation rather than an import - the
 * component is a "use client" .tsx and not loadable from plain node. That means the two
 * can drift, so treat a failure here as "something changed, go look", not as proof that
 * the component is the broken one.
 *
 * Sources: https://wiki.hoodedhorse.com/Terra_Invicta/Spaceships (Armor, Lasers)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const load = (file) => JSON.parse(readFileSync(join(DATA, file), "utf8"));

const failures = [];

function expect(label, actual, wanted, tolerance) {
  const ok = Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${actual?.toFixed?.(2) ?? actual} (wiki says ${wanted} ±${tolerance})`);
  if (!ok) failures.push(label);
}

// --- Armor -----------------------------------------------------------------
// Plate thickness (m) = 20 / heatOfVaporization / density / 0.005
// A ship's innate radiation resistance is 4 half-values, and armor replaces rather than
// adds to it - so 4 x (half-value / plate thickness) is the point at which armor starts
// mattering against particle beams.
const armors = load("TIShipArmorTemplate.json");
const plate_cm = (a) => (20 / a.heatofVaporization_MJkg / a.density_kgm3 / 0.005) * 100;
const toBaseline = (a, half) => (4 * half) / plate_cm(a);

const byName = (name) => {
  const found = armors.find((a) => a.dataName === name);
  if (!found) throw new Error(`armor template missing: ${name}`);
  return found;
};

const adamantane = byName("AdamantaneArmor");
const exotic = byName("ExoticArmor");

// "Adamantane Armor needs about 120 points of armor to reach 4 half-values for Baryons."
expect("Adamantane points to baryon baseline", toBaseline(adamantane, adamantane.baryonicHalfValue_cm), 120, 5);
// "Exotic Armor needs about 18.5 points of armor to reach 4 half-values for Baryons."
expect("Exotic points to baryon baseline", toBaseline(exotic, exotic.baryonicHalfValue_cm), 18.5, 0.5);

// "apart from Boron Carbide Armor, all armors have significantly smaller half-values for
// x-rays than for baryons."
const inverted = armors.filter((a) => a.xRayHalfValue_cm > a.baryonicHalfValue_cm).map((a) => a.dataName);
const invertedOk = inverted.length === 1 && inverted[0] === "BoronCarbideArmor";
console.log(`${invertedOk ? "PASS" : "FAIL"}  only Boron Carbide favours baryons over x-rays: [${inverted}]`);
if (!invertedOk) failures.push("baryon/x-ray inversion set");

// The specialties list mixes units: XRay/Baryonic values are points per half-value, and
// must reproduce halfValue_cm / plateThickness_cm. Everything else is a multiplier.
for (const armor of armors) {
  for (const specialty of armor.specialties ?? []) {
    const half = specialty.armorSpecialty === "XRayResistance" ? armor.xRayHalfValue_cm
      : specialty.armorSpecialty === "BaryonicResistance" ? armor.baryonicHalfValue_cm
      : null;
    if (half === null) continue;
    const derived = half / plate_cm(armor);
    if (Math.abs(derived - specialty.value) > 0.05) {
      failures.push(`${armor.dataName} ${specialty.armorSpecialty}`);
      console.log(`FAIL  ${armor.dataName} ${specialty.armorSpecialty}: stored ${specialty.value}, derived ${derived.toFixed(2)}`);
    }
  }
}
console.log("PASS  every XRay/Baryonic specialty equals points-per-half-value");

// Armor volume wraps the hull as a cylinder. The wiki's "Rough Armor Cost Multiplier"
// table is this formula linearised (dropping the t² term), so it must reproduce all four
// of its columns: cinematic ends ×1 / side ×0.75, realistic ends ×3 / side ×0.5.
const hulls = load("TIShipHullTemplate.json");
const MULTIPLIERS = {
  Frigate: [314, 4712, 942, 3142], Gunship: [79, 1178, 236, 785],
  Dreadnought: [962, 22678, 2886, 15119], Battleship: [491, 11781, 1473, 7854],
};
for (const [name, expected] of Object.entries(MULTIPLIERS)) {
  const hull = hulls.find((h) => h.dataName === name);
  const endArea = Math.PI * (hull.width_m / 2) ** 2;
  const sideArea = Math.PI * hull.length_m * hull.width_m; // d/dt of ((r+t)² - r²) at t=0
  const got = [endArea, sideArea * 0.75, endArea * 3, sideArea * 0.5].map(Math.round);
  const ok = got.every((v, i) => Math.abs(v - expected[i]) <= 2);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} armor cost multipliers: [${got}] vs wiki [${expected}]`);
  if (!ok) failures.push(`${name} armor multipliers`);
}

// Habs take the best armor that does NOT cost exotics, so the claim that Adamantane is
// the last armor project improving them depends on exactly which armors carry an exotics
// cost. Pin that set.
const exoticCost = armors
  .filter((a) => !/^alien/i.test(a.dataName) && (a.weightedBuildMaterials?.exotics ?? 0) > 0)
  .map((a) => a.dataName);
const exoticOk = exoticCost.length === 2 && ["ExoticArmor", "HybridArmor"].every((n) => exoticCost.includes(n));
console.log(`${exoticOk ? "PASS" : "FAIL"}  only Exotic and Hybrid cost exotics (so habs cap at Adamantane): [${exoticCost}]`);
if (!exoticOk) failures.push("exotic-cost armor set");

// --- Lasers ----------------------------------------------------------------
// A laser refuses to fire once its damage no longer beats the armor its spot covers.
const lasers = load("TILaserWeaponTemplate.json");
const spread = (l) => {
  const diameter_m = (2 * l.mirrorRadius_cm) / 100;
  return (1000 / diameter_m) * Math.hypot(1.22 * l.wavelength_nm * 1e-9 * l.beam_quality, 2 * l.jitter_Rad * diameter_m);
};
const effective = (l, threshold) =>
  Math.min(Math.sqrt((l.shotPower_MJ / 20 / threshold) * 0.005 / 0.7853982) / spread(l), l.targetingRange_km);

const turret = lasers.find((l) => l.dataName === "PointDefenseLaserTurret");
// Listed targeting range is 250 km; the anti-ship gate is damage / armorEffectiveness > 1.
expect("PD Laser Turret anti-ship range (km)", effective(turret, 1), 48, 3);
const cappedCount = lasers.filter((l) => !/^alien/i.test(l.dataName) && effective(l, 1) < l.targetingRange_km - 1).length;
console.log(`INFO  ${cappedCount} human lasers engage ships closer than their listed range`);
if (cappedCount === 0) failures.push("no lasers capped - formula probably broken");

// --- Kinetic damage --------------------------------------------------------
// Damage Points = ½ x warheadMass x muzzleVelocity² / 20MJ. Where the templates also
// store the answer, the two must agree.
const ke = (e) => (0.5 * e.warheadMass_kg * e.muzzleVelocity_kps ** 2) / 20;
let checked = 0;
for (const file of ["TIGunTemplate.json", "TIPlasmaWeaponTemplate.json"]) {
  for (const entry of load(file)) {
    const stored = entry.damage_MJ ?? entry.expectedDamage_MJ;
    if (typeof stored !== "number") continue;
    checked += 1;
    if (Math.abs(stored / 20 - ke(entry)) > 0.01) {
      failures.push(`${entry.dataName} damage`);
      console.log(`FAIL  ${entry.dataName}: stored ${stored / 20}, computed ${ke(entry).toFixed(3)}`);
    }
  }
}
console.log(`PASS  ½mv²/20MJ matches every stored damage field (${checked} weapons)`);

// --- Bombardment ------------------------------------------------------------
// The Fleets page states capability as a rule: all magnetic weapons, all lasers with an
// attack mode, and missiles with nuclear-family warheads. The UI trusts the templates'
// `bombardmentValue` instead, so the two must keep agreeing - with exactly one known
// divergence, the half-slot nuclear pods, which carry 0 where their bays do not.
const BLAST = new Set(["Nuclear", "ShapedNuclear", "Antimatter"]);
const FAMILIES = [
  ["TIGunTemplate.json", "Gun"], ["TIMagneticGunTemplate.json", "Magnetic"],
  ["TILaserWeaponTemplate.json", "Laser"], ["TIPlasmaWeaponTemplate.json", "Plasma"],
  ["TIParticleWeaponTemplate.json", "Particle"], ["TIMissileTemplate.json", "Missile"],
];
const byRule = (family, e) =>
  family === "Laser" ? Boolean(e.attackMode)
  : family === "Magnetic" ? true
  : family === "Missile" ? BLAST.has(e.warheadClass)
  : false;

const divergent = [];
for (const [file, family] of FAMILIES) {
  for (const entry of load(file)) {
    if (((entry.bombardmentValue ?? 0) > 0) !== byRule(family, entry)) divergent.push(entry.dataName);
  }
}
const expectedDivergent = ["PythonNuclearMissilePod", "CerebrusNuclearTorpedoPod", "HadesNuclearTorpedoPod"];
const divergenceOk = divergent.length === expectedDivergent.length && divergent.every((d) => expectedDivergent.includes(d));
console.log(`${divergenceOk ? "PASS" : "FAIL"}  bombardmentValue matches the wiki rule except the 3 nuclear pods: [${divergent}]`);
if (!divergenceOk) failures.push("bombardment rule divergence");

// Only 380-740 nm gets through Earth's atmosphere, which should leave green lasers alone.
const throughAtmosphere = new Set(
  load("TILaserWeaponTemplate.json")
    .filter((l) => !/^alien/i.test(l.dataName) && l.wavelength_nm >= 380 && l.wavelength_nm <= 740)
    .map((l) => l.wavelength_nm),
);
const greenOnly = throughAtmosphere.size === 1 && throughAtmosphere.has(540);
console.log(`${greenOnly ? "PASS" : "FAIL"}  only 540 nm lasers bombard through atmosphere: [${[...throughAtmosphere]}]`);
if (!greenOnly) failures.push("atmosphere-capable wavelengths");

console.log(failures.length ? `\n${failures.length} FAILURE(S): ${failures.join(", ")}` : "\nall formula checks passed");
process.exit(failures.length ? 1 : 0);
