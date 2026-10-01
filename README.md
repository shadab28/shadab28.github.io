# shadab28.github.io

Personal site of Mohd Shadab Siddiqui: FX trader and quantitative researcher.
Live at <https://shadab28.github.io/>.

Plain static HTML, CSS and JavaScript. There is no build step and there are no dependencies.
GitHub Pages serves the `master` branch root as is (`.nojekyll` turns off Jekyll processing).

```
index.html                  homepage
research/nifty50-options-wheel.html  options-wheel case study
research/pure-alpha.html    Pure Alpha research dashboard
404.html                    not-found page
assets/css/site.css         all styles (design tokens at the top)
assets/js/site.js           nav, section tracking, email, reveal, charts
assets/js/wheel-data.js     weekly growth-of-100 series for the options-wheel charts
assets/js/pure-alpha.js     Pure Alpha charts and heatmap
assets/js/pure-alpha-data.js          generated analytics (window.PURE_ALPHA)
tools/build_pure_alpha_data.py        generator for the Pure Alpha data file
assets/img/og-card.png      social preview image (1200x630)
assets/Mohd_Shadab_Siddiqui_CV.pdf
favicon.svg, favicon-32.png, apple-touch-icon.png, robots.txt, sitemap.xml
```

## Preview locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Links are root-relative (`/assets/...`), so open the site through a server, not with `file://`.

## Common edits

- **CV:** overwrite `assets/Mohd_Shadab_Siddiqui_CV.pdf` and keep the file name.
- **Email:** `data-email-user` and `data-email-domain` in the Contact section of `index.html`.
  The address is assembled in the browser to keep it away from simple scrapers.
- **LinkedIn / GitHub:** search `index.html` and `research/nifty50-options-wheel.html` for `linkedin.com` and `github.com/shadab28`.
- **Options-wheel charts:** `assets/js/wheel-data.js` holds weekly NAV rebased to 100
  (`d` dates, `s` wheel at 3x, `b` NIFTY 50 TRI), taken from the wheel backtest's `equity_curves.csv`.

## Rebuilding the Pure Alpha data

The dashboard shows the frozen Pure Alpha v1.0 strategy re-run point in time
(`research/results/phase3_pit/` in the Pure Alpha repo, produced by `research/phase3_pit.py`):
futures lots, F&O listing dates and universe as they stood on each day, from the raw NSE
bhavcopies. The script recomputes every figure from the run's positions and exits without
writing anything if its results do not reconcile with the run's own summary. Pass `--run frozen`
to build from the original frozen run (`research/results/phase3/`) instead.

```sh
python3 tools/build_pure_alpha_data.py ~/Final/pure-alpha /path/to/nifty50_tri_daily.csv
```

The second argument (NIFTY 50 TRI daily closes) is optional and only feeds the benchmark line.
