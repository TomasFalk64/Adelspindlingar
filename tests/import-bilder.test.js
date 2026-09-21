const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const { execFile } = require("node:child_process");
const sharp = require("sharp");

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(__dirname, "..");

async function fixture(t) {
  const tempRoot = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(tempRoot, "adelspindling-import-test-"));
  t.after(async () => {
    const resolved = await fs.realpath(root);
    assert.equal(path.dirname(resolved), tempRoot);
    assert.ok(path.basename(resolved).startsWith("adelspindling-import-test-"));
    await fs.rm(resolved, { recursive: true, force: true });
  });
  const images = path.join(root, "data", "bilder");
  const incoming = path.join(images, "import", "Testfotograf");
  const dataFile = path.join(root, "data", "adelspindlingar.json");
  await fs.mkdir(incoming, { recursive: true });
  await fs.mkdir(path.join(root, "scripts"));
  await fs.copyFile(path.join(projectRoot, "scripts", "import-bilder.js"), path.join(root, "scripts", "import-bilder.js"));
  await fs.writeFile(dataFile, JSON.stringify({ arter: [{ svenskt_namn: "Persiljespindling", bilder: [] }] }));
  const run = (...args) => execFileAsync(process.execPath, [path.join(root, "scripts", "import-bilder.js"), ...args], {
    env: { ...process.env, NODE_PATH: path.join(projectRoot, "node_modules") }
  });
  return { images, incoming, dataFile, run };
}

function sample(width, height, alpha = 1) {
  return sharp({ create: { width, height, channels: 4, background: { r: 95, g: 70, b: 150, alpha } } });
}

test("dry-run validates compression without changing input, output or JSON", async (t) => {
  const f = await fixture(t);
  const source = path.join(f.incoming, "Persiljespindling.jpg");
  await sample(2800, 1400).jpeg().toFile(source);
  const before = await fs.readFile(source);
  const dataBefore = await fs.readFile(f.dataFile);
  const { stdout } = await f.run("--dry-run");
  assert.match(stdout, /1400 × 700 px/);
  assert.match(stdout, /Persiljespindling.webp/);
  assert.deepEqual(await fs.readFile(source), before);
  assert.deepEqual(await fs.readFile(f.dataFile), dataBefore);
  assert.deepEqual(await fs.readdir(f.images), ["import"]);
});

test("import resizes, orients and compresses images, preserves collisions and skips invalid files", async (t) => {
  const f = await fixture(t);
  await sample(2800, 1400).jpeg().toFile(path.join(f.incoming, "Persiljespindling_wide.jpg"));
  await sample(2800, 1400).withMetadata({ orientation: 6 }).jpeg().toFile(path.join(f.incoming, "Persiljespindling_rotated.jpeg"));
  await sample(700, 2100).png().toFile(path.join(f.incoming, "Persiljespindling_tall.png"));
  await sample(320, 200, 0.5).png().toFile(path.join(f.incoming, "Persiljespindling_small.png"));
  await sample(100, 80).webp().toFile(path.join(f.incoming, "Persiljespindling_webp.webp"));
  await fs.writeFile(path.join(f.incoming, "Persiljespindling_bad.jpg"), "broken image");
  await fs.writeFile(path.join(f.incoming, "Persiljespindling.txt"), "not an image");
  await sample(50, 50).png().toFile(path.join(f.incoming, "Unknown.png"));
  const existing = path.join(f.images, "Persiljespindling_wide.webp");
  await sample(60, 40).webp().toFile(existing);
  const existingBytes = await fs.readFile(existing);
  const sourceSize = (await fs.stat(path.join(f.incoming, "Persiljespindling_wide.jpg"))).size;
  const { stdout } = await f.run();
  assert.match(stdout, /kunde inte komprimeras/);
  assert.match(stdout, /ingen matchande art/);
  assert.match(stdout, /inte en stödd bildfil/);
  const data = JSON.parse(await fs.readFile(f.dataFile, "utf8"));
  const records = data.arter[0].bilder;
  assert.equal(records.length, 5);
  const expected = {
    "Persiljespindling_wide_2.webp": [1400, 700],
    "Persiljespindling_rotated.webp": [700, 1400],
    "Persiljespindling_tall.webp": [467, 1400],
    "Persiljespindling_small.webp": [320, 200],
    "Persiljespindling_webp.webp": [100, 80]
  };
  for (const record of records) {
    assert.equal(record.fotograf, "Testfotograf");
    const name = path.posix.basename(record.fil);
    const metadata = await sharp(await fs.readFile(path.join(f.images, name))).metadata();
    assert.equal(metadata.format, "webp");
    assert.deepEqual([metadata.width, metadata.height], expected[name]);
    assert.equal(metadata.orientation, undefined);
    if (name.includes("small")) assert.equal(metadata.hasAlpha, true);
  }
  assert.ok((await fs.stat(path.join(f.images, "Persiljespindling_wide_2.webp"))).size < sourceSize);
  assert.deepEqual(await fs.readFile(existing), existingBytes);
  assert.deepEqual((await fs.readdir(f.incoming)).sort(), ["Persiljespindling.txt", "Persiljespindling_bad.jpg", "Unknown.png"]);
});
