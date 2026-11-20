# mehrion

Static website for **mehrion** and **Ivory**, a family of simple Android apps with no ads, no account and no internet permission: **https://mehrion.github.io**

It hosts a page per app (for example `/calculator/`), plus the pages app stores such as Google Play need for each listing: Privacy Policy, Terms of Service, Account & Data Deletion, Child Safety Standards, Support/Contact, plus Home, Apps and About.

## Structure

- `site/`: everything that gets published (HTML, CSS, JS, images, `sitemap.xml`, `robots.txt`, `llms.txt`)
- `site/<app>/index.html`: one page per app, served at `/<app>/`
- `partials/`: shared header and footer, synced into every page
- `templates/`: starting points for new pages (not published)
- `scripts/site.mjs`: zero-dependency `sync` and `check` tooling (also checks SEO tags and JSON-LD)
- `.github/workflows/deploy.yml`: deploys `site/` to GitHub Pages on every push to `main`

## Local preview

```
python3 -m http.server 8000 --directory site
```

Open http://localhost:8000.

## Last-updated dates

A pre-commit hook (`.githooks/pre-commit`) runs `sync`, sets every "last updated" date on the site to today
(visible "Last updated" lines, JSON-LD `dateModified`, sitemap `lastmod`, `llms-full.txt`), stages the changed
files and runs `check`. Enable it once per clone:

```
git config core.hooksPath .githooks
```

Run it by hand with `node scripts/site.mjs stamp`.

## Editing shared layout

After changing `partials/header.html` or `partials/footer.html`:

```
node scripts/site.mjs sync
node scripts/site.mjs check
```

## Deployment

Pushing to `main` runs the workflow, which validates the site and publishes `site/` to GitHub Pages.
One-time setup: repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
