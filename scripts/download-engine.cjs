#!/usr/bin/env node
/**
 * Download the Prisma query engine binary at container startup.
 *
 * The engine binary is not bundled during Docker build (to avoid TLS issues).
 * This script runs at container startup where networking is reliable.
 *
 * Usage: node download-engine.cjs <output-directory>
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ENGINE_DIR = process.argv[2];
if (!ENGINE_DIR) {
  process.stderr.write('Usage: node download-engine.cjs <output-directory>\n');
  process.exit(1);
}

const CLIENT_INDEX = path.join(
  process.cwd(),
  'node_modules',
  '.prisma',
  'client',
  'index.js',
);

// ── Extract engine version from generated Prisma client ─────
function getEngineVersion() {
  try {
    const content = fs.readFileSync(CLIENT_INDEX, 'utf-8');
    const match = content.match(
      /engineVersion['"]?\s*[:=]\s*['"]([^'"]+)['"]/,
    );
    if (match) return match[1];
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
        headers: { 'User-Agent': 'prestige-club/1.0' },
      },
      (response) => {
        // Follow redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          fs.unlinkSync(dest);
          return download(new URL(response.headers.location, url).href, dest).then(resolve).catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          return reject(
            new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`),
          );
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      },
    );

    request.on('error', (err) => {
      file.close();
      // Clean up partial download
      try { fs.unlinkSync(dest); } catch { /* ignore */ }
      reject(err);
    });

    request.setTimeout(30000, () => {
      request.destroy();
      try { fs.unlinkSync(dest); } catch { /* ignore */ }
      reject(new Error('Download timed out after 30s'));
    });
  });
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  const engineVersion = getEngineVersion();
  if (!engineVersion) {
    process.stderr.write(
      'ERROR: Could not determine Prisma engine version.\n',
    );
    process.exit(1);
  }

  const binaryTarget = 'linux-musl-openssl-3.0.x';
  const engineFile = path.join(ENGINE_DIR, 'libquery_engine.so.node');
  const gzFile = engineFile + '.gz';

  const baseUrl = `https://binaries.prisma.sh/all_commits/${engineVersion}/${binaryTarget}`;
  const downloadUrl = `${baseUrl}/libquery_engine.so.node.gz`;

  process.stdout.write(`Engine version: ${engineVersion}\n`);
  process.stdout.write(`Binary target:  ${binaryTarget}\n`);
  process.stdout.write(`Download URL:   ${downloadUrl}\n`);

  // Ensure output directory exists
  fs.mkdirSync(ENGINE_DIR, { recursive: true });

  // Try to download with up to 3 retries
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      process.stdout.write(`Download attempt ${attempt}/3...\n`);
      await download(downloadUrl, gzFile);
      process.stdout.write('Download complete, decompressing...\n');

      // Decompress .gz file
      const gzData = fs.readFileSync(gzFile);
      const decompressed = zlib.gunzipSync(gzData);
      fs.writeFileSync(engineFile, decompressed);
      fs.unlinkSync(gzFile);
      fs.chmodSync(engineFile, 0o755);

      process.stdout.write('Engine ready.\n');
      return;
    } catch (err) {
      lastError = err;
      process.stderr.write(`Attempt ${attempt} failed: ${err.message}\n`);
      // Clean up any partial files
      try { fs.unlinkSync(gzFile); } catch { /* ignore */ }
      if (attempt < 3) {
        const delay = attempt * 2000;
        process.stdout.write(`Retrying in ${delay / 1000}s...\n`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  process.stderr.write(`ERROR: All download attempts failed: ${lastError.message}\n`);
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`FATAL: ${err.message}\n`);
  process.exit(1);
});
