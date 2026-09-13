import { cpSync, mkdirSync, rmSync, existsSync, copyFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const staticSrc = join(root, "static");
const staticDest = join(publicDir, "static");
const mediaDest = join(publicDir, "media");
const pdfSrc = join(root, "private", "book.pdf");
const pdfDest = join(mediaDest, "life-happens-in-decisions.pdf");

mkdirSync(publicDir, { recursive: true });
mkdirSync(mediaDest, { recursive: true });
if (existsSync(staticDest)) rmSync(staticDest, { recursive: true, force: true });
cpSync(staticSrc, staticDest, { recursive: true });
if (!existsSync(pdfSrc)) {
  console.error("Missing private/book.pdf — cannot build Pages media asset");
  process.exit(1);
}
copyFileSync(pdfSrc, pdfDest);
const size = statSync(pdfDest).size / (1024 * 1024);
console.log("Synced static/ → public/static/");
console.log(`Copied PDF → public/media/life-happens-in-decisions.pdf (${size.toFixed(2)} MiB)`);
if (size >= 25) {
  console.error("ERROR: PDF is >= 25 MiB; Cloudflare Pages will reject it");
  process.exit(1);
}
