# hire.jiawis.com

Personal portfolio of Jiawei Zhang. Bilingual static HTML, CSS and JavaScript; no build step or runtime dependencies.

## Local preview

```sh
python3 -m http.server 4186 --bind 127.0.0.1
```

Open `http://127.0.0.1:4186`. GitHub Pages serves the repository root. Ship the page directories and assets together. When CSS or JavaScript changes, bump its `?v=` reference in every HTML entry that loads it.

## Structure

- `index.html`: bilingual portfolio: the year in numbers, platform architecture, case files, working method, side projects, experience. Open Graph / Twitter card tags and JSON-LD `Person` data are in the head; a tiny inline script applies the saved language before first paint.
- `datakeel-benchmarks/` contains the bilingual Datakeel engineering notes and benchmark tables. Each measurement identifies its workload, source and limits.
- `assets/site.css`: responsive layout, focus states, reduced-motion and print styles.
- `assets/site.js`: language preference, navigation, reveal and count-up, commit heatmap, architecture explorer, case tabs, delivery-state illustration, email copy.
- `assets/pointcloud.js`: dependency-free WebGL scene. A seeded street is ray-cast by a virtual 64-beam LiDAR; points render with a sweep and a 3D annotation cuboid. Ray-casting runs in a Web Worker created from a Blob URL (main-thread fallback, identical seeded output). Pauses off-screen; static under reduced motion.
- `assets/og.png`: 1200×630 share image, rendered from a local HTML page with Playwright and quantized to 256 colors.
- `assets/icons/`: locally hosted [Phosphor](https://github.com/phosphor-icons/core) icons, with their MIT license.

Heatmap data is daily commit counts recomputed from local git (author date, deduplicated by hash, Sep 2025 – Aug 2026). Portfolio metrics distinguish production (PROD), staging/lab (LAB) and open-source measurements (OSS). The delivery-state animation is a generic illustration, not live telemetry.

Content remains readable without JavaScript. No external API, analytics, CDN or third-party font requests.

## Local quality checks

Run from the site checkout. The audit starts a disposable loopback server and uses Chrome, Playwright and axe-core. Keep the Node dependencies and evidence in an output directory outside this repository. With an existing installation, point `NODE_PATH` at the directory containing the two packages.

```sh
export AUDIT_OUTPUT="../hire-site-audit"
mkdir -p "$AUDIT_OUTPUT"
npm install --prefix "$AUDIT_OUTPUT/tools" --no-save --package-lock=false playwright@1.56.1 axe-core@4.11.0
NODE_PATH="$AUDIT_OUTPUT/tools/node_modules" node scripts/audit.cjs "$AUDIT_OUTPUT"
```

The last command reruns the entire audit. It captures both languages at 1440, 768, 390 and 320 CSS pixels, checks the home page and the benchmark page, and writes PNGs under `screenshots/` and JSON and Markdown under `reports/`. Each browser context blocks outbound requests. The audit compares homepage transfer sizes with the Git baseline in the same browser. A failed check returns a nonzero exit code.

Set `CHROME_PATH` to use a specific Chrome executable, or `AUDIT_BROWSER=chromium` to use Playwright’s installed Chromium. The optional `AUDIT_BASE_REF` selects a different local baseline commit.
