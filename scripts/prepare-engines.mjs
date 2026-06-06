#!/usr/bin/env node
/**
 * Pre-download the Prisma query engine on the HOST machine.
 *
 * Run this BEFORE `docker compose build` so the engine binary
 * is available in the build context (.prisma-build/ directory)
 * and gets baked into the Docker image — zero network needed
 * during build or at runtime.
 *
 * Usage: node scripts/prepare-engines.mjs
 */

import https from "https";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ── Get engine version from the generated Prisma client ─────
function getEngineVersion() {
  const indexFile = path.join(
    PROJECT_ROOT,
    "node_modules",
    ".prisma",
    "client",
    "index.js",
  );
  try {
    const content = fs.readFileSync(indexFile, "utf-8");
    const match = content.match(/engineVersion['"]?\s*[:=]\s*['"]([^'"]+)['"]/);
    if (match) return match[1];
  } catch {
    // fall through
  }

  // Fallback: try @prisma/client's package.json
  try {
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(
          PROJECT_ROOT,
          "node_modules",
          "@prisma/client",
          "package.json",
        ),
        "utf-8",
      ),
    );
    if (pkg.prisma?.enginesVersion) return pkg.prisma.enginesVersion;
  } catch {
    // fall through
  }

  return null;
}

// ── Download with retries ────────────────────────────────────
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    const request = https.get(
      url,
      {
        rejectUnauthorized: false,
        headers: { "User-Agent": "prestige-club/1.0" },
      },
      (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          file.close();
          try {
            fs.unlinkSync(dest);
          } catch {
            /* ignore */
          }
          return download(new URL(response.headers.location, url).href, dest)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close();
          try {
            fs.unlinkSync(dest);
          } catch {
            /* ignore */
          }
          reject(
            new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`),
          );
          return;
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      },
    );

    request.on("error", (err) => {
      file.close();
      try {
        fs.unlinkSync(dest);
      } catch {
        /* ignore */
      }
      reject(err);
    });

    request.setTimeout(30000, () => {
      request.destroy();
      try {
        fs.unlinkSync(dest);
      } catch {
        /* ignore */
      }
      reject(new Error("Download timed out after 30s"));
    });
  });
}

// ── Download a single file with retries ─────────────────────
async function downloadWithRetries(url, dest, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`  ${label} (attempt ${attempt}/3)...`);
      await download(url, dest);
      return;
    } catch (err) {
      console.error(`  ${label} failed: ${err.message}`);
      try {
        fs.unlinkSync(dest);
      } catch {
        /* ignore */
      }
      if (attempt < 3) {
        const delay = attempt * 2000;
        console.log(`  Retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw new Error(`Failed to download ${label}`);
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  const engineVersion = getEngineVersion();
  if (!engineVersion) {
    console.error(
      "ERROR: Could not determine Prisma engine version.\n" +
        'Make sure you have run "npm install" and "npx prisma generate" first.',
    );
    process.exit(1);
  }

  const binaryTarget = "linux-musl-openssl-3.0.x";
  const outputDir = path.join(PROJECT_ROOT, ".prisma-build");

  const baseUrl = `https://binaries.prisma.sh/all_commits/${engineVersion}/${binaryTarget}`;
  const engineGzUrl = `${baseUrl}/libquery_engine.so.node.gz`;

  const gzFile = path.join(outputDir, "libquery_engine.so.node.gz");
  const engineFile = path.join(outputDir, "libquery_engine.so.node");
  const sha256File = path.join(outputDir, "libquery_engine.so.node.sha256");

  console.log(`Engine version: ${engineVersion}`);
  console.log(`Binary target:  ${binaryTarget}`);
  console.log(`Output dir:     ${outputDir}`);

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    // 1. Download engine binary (.gz)
    await downloadWithRetries(engineGzUrl, gzFile, "Engine binary");

    // 2. Decompress
    console.log("  Decompressing...");
    const gzData = fs.readFileSync(gzFile);
    const decompressed = zlib.gunzipSync(gzData);
    fs.writeFileSync(engineFile, decompressed);
    fs.unlinkSync(gzFile);
    fs.chmodSync(engineFile, 0o755);

    // 3. Compute SHA256 of the decompressed engine and save it.
    //    Prisma with PRISMA_ENGINE_FILES_DIR expects
    //    libquery_engine.so.node.sha256 (hash of the .node file).
    console.log("  Computing SHA256 checksum...");
    const engineData = fs.readFileSync(engineFile);
    const hash = crypto.createHash("sha256").update(engineData).digest("hex");
    fs.writeFileSync(sha256File, hash);

    console.log(`\n✅ Engine ready at ${engineFile}`);
    console.log(`   SHA256: ${hash}`);
    console.log("Now run: docker compose build");
  } catch (err) {
    console.error(`\n❌ ${err.message}`);
    process.exit(1);
  }
}

main();
