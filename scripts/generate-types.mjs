#!/usr/bin/env node
// Regenerates packages/shared TS types from the FastAPI OpenAPI schema.
//   node scripts/generate-types.mjs          -> write openapi.json + schema.d.ts
//   node scripts/generate-types.mjs --check  -> exit 1 if committed files are stale
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = join(root, "apps", "api");
const sharedDir = join(root, "packages", "shared");
const specPath = join(sharedDir, "openapi.json");
const typesPath = join(sharedDir, "src", "schema.d.ts");
const check = process.argv.includes("--check");
const shell = process.platform === "win32";

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const before = { spec: read(specPath), types: read(typesPath) };

// 1. Export the spec straight from the FastAPI app object (no server needed).
execFileSync("uv", ["run", "python", "-m", "scripts.export_openapi", specPath], {
  cwd: apiDir,
  stdio: "inherit",
  shell,
});

// 2. Generate TypeScript types from the spec.
execFileSync("pnpm", ["--filter", "@exploreai/shared", "exec", "openapi-typescript", "openapi.json", "-o", "src/schema.d.ts"], {
  cwd: root,
  stdio: "inherit",
  shell,
});

if (check) {
  const stale = read(specPath) !== before.spec || read(typesPath) !== before.types;
  if (stale) {
    writeFileSync(specPath, before.spec);
    writeFileSync(typesPath, before.types);
    console.error("\nShared types are stale. Run `make types` and commit the result.");
    process.exit(1);
  }
  console.log("Shared types are up to date.");
}
