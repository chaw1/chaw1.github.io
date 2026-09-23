# hire.jiawis.com

Personal portfolio of Jiawei Zhang. Bilingual static HTML, CSS and JavaScript; no build step or runtime dependencies.

## Local preview

```sh
python3 -m http.server 4186 --bind 127.0.0.1
```

Open `http://127.0.0.1:4186`. Publish `index.html`, `assets/`, `robots.txt`, `sitemap.xml`, `CNAME` and `.nojekyll` together to the existing static host. When CSS or JS changes, bump the `?v=` query on the three asset links in `index.html`.

## Structure

- `index.html`: bilingual portfolio: the year in numbers, platform architecture, case files, working method, side projects, experience. Open Graph / Twitter card tags and JSON-LD `Person` data are in the head; a tiny inline script applies the saved language before first paint.
- `assets/site.css`: responsive layout, focus states, reduced-motion and print styles.
- `assets/site.js`: language preference, navigation, reveal and count-up, commit heatmap, architecture explorer, case tabs, delivery-state illustration, email copy.
- `assets/pointcloud.js`: dependency-free WebGL scene. A seeded street is ray-cast by a virtual 64-beam LiDAR; points render with a sweep and a 3D annotation cuboid. Ray-casting runs in a Web Worker created from a Blob URL (main-thread fallback, identical seeded output). Pauses off-screen; static under reduced motion.
- `assets/og.png`: 1200×630 share image, rendered from a local HTML page with Playwright and quantized to 256 colors.
- `assets/icons/`: locally hosted [Phosphor](https://github.com/phosphor-icons/core) icons, with their MIT license.

Heatmap data is daily commit counts recomputed from local git (author date, deduplicated by hash, Sep 2025 – Aug 2026). Every metric is tagged as production (PROD) or staging/lab (LAB). The delivery-state animation is a generic illustration, not live telemetry.

Content remains readable without JavaScript. No external API, analytics, CDN or third-party font requests.
