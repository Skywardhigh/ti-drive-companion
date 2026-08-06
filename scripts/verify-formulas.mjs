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

console.log(failures.length ? `\n${failures.length} FAILURE(S): ${failures.join(", ")}` : "\nall formula checks passed");
process.exit(failures.length ? 1 : 0);
