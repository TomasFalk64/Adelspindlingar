#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = path.join(ROOT, "data", "adelspindlingar.json");
const IMAGE_DIR = path.join(ROOT, "data", "bilder");
const IMPORT_DIR = path.join(IMAGE_DIR, "import");
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const isDryRun = process.argv.includes("--dry-run");

async function main() {
  await ensureImportDirectory();

  const data = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
  if (!Array.isArray(data.arter)) {
    throw new Error("data/adelspindlingar.json saknar listan arter.");
  }

  const speciesNames = buildSpeciesNames(data.arter);
  const usedImagePaths = collectUsedImagePaths(data.arter);
  const report = {
    imported: [],
    skipped: [],
    warnings: []
  };

  const photographerDirs = await listPhotographerDirs();
  for (const photographerDir of photographerDirs) {
    const photographer = photographerDir.name.trim();
    const sourceDir = path.join(IMPORT_DIR, photographerDir.name);
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const sourcePath = path.join(sourceDir, entry.name);
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) {
        report.skipped.push(`${entry.name} - inte en stödd bildfil`);
        continue;
      }

      const match = findSpeciesForImage(entry.name, speciesNames);
      if (!match) {
        report.skipped.push(`${path.join(photographerDir.name, entry.name)} - ingen matchande art`);
        continue;
      }

      if (match.ambiguous) {
        report.skipped.push(`${path.join(photographerDir.name, entry.name)} - flera möjliga arter: ${match.names.join(", ")}`);
        continue;
      }

      const species = match.species;
      const destinationName = await getAvailableDestinationName(entry.name, usedImagePaths);
      const destinationPath = path.join(IMAGE_DIR, destinationName);
      const jsonPath = `data/bilder/${destinationName}`;

      species.bilder = Array.isArray(species.bilder) ? species.bilder : [];
      if (species.bilder.some((image) => image && image.fil === jsonPath)) {
        report.skipped.push(`${path.join(photographerDir.name, entry.name)} - finns redan i JSON`);
        continue;
      }

      species.bilder.push({
        fil: jsonPath,
        bildtext: species.svenskt_namn || path.parse(entry.name).name,
        fotograf: photographer,
        licens: ""
      });
      usedImagePaths.add(jsonPath.toLocaleLowerCase("sv"));

      if (!isDryRun) {
        await moveFile(sourcePath, destinationPath);
      }

      const renameNote = destinationName === entry.name ? "" : ` som ${destinationName}`;
      report.imported.push(`${entry.name} -> ${species.svenskt_namn}${renameNote} (${photographer})`);
    }
  }

  if (!isDryRun && report.imported.length > 0) {
    await fs.writeFile(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  printReport(report);
}

async function ensureImportDirectory() {
  await fs.mkdir(IMPORT_DIR, { recursive: true });
}

async function listPhotographerDirs() {
  const entries = await fs.readdir(IMPORT_DIR, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory());
}

function buildSpeciesNames(speciesList) {
  const names = [];
  for (const species of speciesList) {
    const normalized = normalizeName(species.svenskt_namn);
    if (!normalized) {
      continue;
    }

    names.push({
      normalized,
      compact: compactName(normalized),
      species,
      label: species.svenskt_namn || species.vetenskapligt_namn
    });
  }

  return names.sort((left, right) => right.normalized.length - left.normalized.length);
}

function collectUsedImagePaths(speciesList) {
  const used = new Set();
  for (const species of speciesList) {
    if (!Array.isArray(species.bilder)) {
      continue;
    }

    for (const image of species.bilder) {
      if (image?.fil) {
        used.add(String(image.fil).toLocaleLowerCase("sv"));
      }
    }
  }
  return used;
}

function findSpeciesForImage(fileName, speciesNames) {
  const normalizedFileName = normalizeName(path.parse(fileName).name);
  const compactFileName = compactName(normalizedFileName);
  const matches = speciesNames.filter(({ normalized, compact }) => (
    normalizedFileName.includes(normalized) || compactFileName.includes(compact)
  ));
  if (matches.length === 0) {
    return null;
  }

  const longestLength = matches[0].normalized.length;
  const bestMatches = matches.filter((match) => match.normalized.length === longestLength);
  const uniqueSpecies = Array.from(new Set(bestMatches.map((match) => match.species)));

  if (uniqueSpecies.length === 1) {
    return { species: uniqueSpecies[0] };
  }

  return {
    ambiguous: true,
    names: bestMatches.map((match) => match.label)
  };
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("sv");
}

function compactName(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/(.)\1+/g, "$1");
}

async function getAvailableDestinationName(originalName, usedImagePaths) {
  const parsed = path.parse(originalName);
  const cleanBase = sanitizeFileBase(parsed.name) || "bild";
  const cleanExt = parsed.ext.toLowerCase() || ".jpg";
  let candidate = `${cleanBase}${cleanExt}`;
  let counter = 2;

  while (
    usedImagePaths.has(`data/bilder/${candidate}`.toLocaleLowerCase("sv")) ||
    await exists(path.join(IMAGE_DIR, candidate))
  ) {
    candidate = `${cleanBase}_${counter}${cleanExt}`;
    counter += 1;
  }

  return candidate;
}

function sanitizeFileBase(value) {
  return String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function moveFile(sourcePath, destinationPath) {
  try {
    await fs.rename(sourcePath, destinationPath);
  } catch (error) {
    if (error.code !== "EXDEV") {
      throw error;
    }

    await fs.copyFile(sourcePath, destinationPath);
    await fs.unlink(sourcePath);
  }
}

function printReport(report) {
  console.log(isDryRun ? "Provkörning - inga filer ändrades.\n" : "Bildimport klar.\n");

  if (report.imported.length > 0) {
    console.log("Importerade:");
    report.imported.forEach((line) => console.log(`✓ ${line}`));
  } else {
    console.log("Importerade: inga");
  }

  if (report.skipped.length > 0) {
    console.log("\nHoppade över:");
    report.skipped.forEach((line) => console.log(`! ${line}`));
  }

  console.log(`\nImportmapp: ${path.relative(ROOT, IMPORT_DIR)}`);
}

main().catch((error) => {
  console.error(`Fel vid bildimport: ${error.message}`);
  process.exitCode = 1;
});
