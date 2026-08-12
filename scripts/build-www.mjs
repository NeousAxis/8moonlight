// Assemble the static web app into www/ for Capacitor.
// Source of truth stays at repo root (also served as a PWA on GitHub Pages);
// this copies only the runtime assets the native app needs.
import { mkdirSync, rmSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const www = join(root, "www");

const ASSETS = [
  "index.html",
  "script.js",
  "astro.js",
  "vendor/astronomy.browser.min.js",
  "style.css",
  "sw.js",
  "manifest.json",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "icon.png",
  "apple-touch-icon.png",
];

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

let copied = 0;
for (const f of ASSETS) {
  const src = join(root, f);
  if (existsSync(src)) {
    // Certains assets vivent dans un sous-dossier (vendor/), à recréer côté www.
    const dest = join(www, f);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    copied++;
  } else {
    console.warn(`[build-www] missing asset: ${f}`);
  }
}
console.log(`[build-www] copied ${copied} assets to www/`);
