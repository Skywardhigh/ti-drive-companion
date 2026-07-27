import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(projectRoot, "data");
const runtimeDirectory = resolve(projectRoot, "public", "data");

const datasets = [
  {
    file: "TIDriveTemplate.json",
    requiredFields: ["dataName", "friendlyName", "thrust_N", "EV_kps", "req power", "requiredPowerPlant", "cooling"],
  },
  {
    file: "TIPowerPlantTemplate.json",
    requiredFields: ["dataName", "friendlyName", "maxOutput_GW", "specificPower_tGW", "powerPlantClass", "efficiency"],
  },
  {
    file: "TIRadiatorTemplate.json",
    requiredFields: ["dataName", "friendlyName", "specificPower_2s_KWkg"],
  },
];

function validateDataset(file, value, requiredFields) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${file} must contain a non-empty JSON array.`);
  }

  const identifiers = new Set();
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${file} entry ${index + 1} must be an object.`);
    }

    const missing = requiredFields.filter((field) => !(field in entry));
    if (missing.length) {
      throw new Error(`${file} entry ${index + 1} is missing: ${missing.join(", ")}.`);
    }

    if (identifiers.has(entry.dataName)) {
      throw new Error(`${file} contains duplicate dataName ${JSON.stringify(entry.dataName)}.`);
    }
    identifiers.add(entry.dataName);
  });
}

const validatedDatasets = [];

for (const dataset of datasets) {
  const source = resolve(sourceDirectory, dataset.file);
  let parsed;

  try {
    parsed = JSON.parse(await readFile(source, "utf8"));
  } catch (error) {
    throw new Error(`Could not read valid JSON from ${dataset.file}.`, { cause: error });
  }

  validateDataset(dataset.file, parsed, dataset.requiredFields);
  validatedDatasets.push({ ...dataset, source, recordCount: parsed.length });
}

await mkdir(runtimeDirectory, { recursive: true });

for (const dataset of validatedDatasets) {
  const destination = resolve(runtimeDirectory, dataset.file);
  await copyFile(dataset.source, destination);
  console.log(`Synced ${dataset.file} (${dataset.recordCount} records)`);
}

console.log("All Terra Invicta datasets are valid and synchronized.");