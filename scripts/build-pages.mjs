import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const staticSrc = join(root, "static");
const staticDest = join(publicDir, "static");

mkdirSync(publicDir, { recursive: true });
if (existsSync(staticDest)) rmSync(staticDest, { recursive: true, force: true });
cpSync(staticSrc, staticDest, { recursive: true });
console.log("Synced static/ → public/static/");
