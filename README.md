# hire.jiawis.com

Personal portfolio of Jiawei Zhang. Bilingual static HTML, CSS and JavaScript; no build step or runtime dependencies.

## Local preview

```sh
python3 -m http.server 4186 --bind 127.0.0.1
```

Open `http://127.0.0.1:4186`. Publish `index.html`, `assets/`, `CNAME` and `.nojekyll` together to the existing static host.

## Structure

- `index.html`: bilingual portfolio, case study, projects and experience.
- `assets/site.css`: responsive layout, focus states and reduced-motion styles.
- `assets/site.js`: language preference, mobile navigation, illustrative task flow and email copy.
- `assets/flow-scene*.webp`: responsive artwork for the task-flow illustration.
- `assets/icons/`: locally hosted [Phosphor](https://github.com/phosphor-icons/core) icons, with their MIT license.

The task-flow interaction is a generic illustration. It is not live telemetry, a benchmark, or a reconstruction of a former employer's system. The historical performance result refers to task submission time.

Content remains readable without JavaScript. Interactive behavior uses no external API, analytics, CDN or third-party font requests.
