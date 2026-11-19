# mehrion

Static website for mehrion's apps: **https://mehrion.github.io**

It hosts the pages app stores such as Google Play need for each app listing: Privacy Policy, Terms of Service,
Account & Data Deletion, Child Safety Standards, Support/Contact, plus Home, Apps and About.

## Structure

- `site/`: everything that gets published (HTML, CSS, JS, images, `sitemap.xml`, `robots.txt`)
- `partials/`: shared header and footer, synced into every page
- `templates/`: starting points for new pages (not published)
- `scripts/site.mjs`: zero-dependency `sync` and `check` tooling
- `.github/workflows/deploy.yml`: deploys `site/` to GitHub Pages on every push to `main`

## Local preview

```
python3 -m http.server 8000 --directory site
```

Open http://localhost:8000.

## Editing shared layout

After changing `partials/header.html` or `partials/footer.html`:

```
node scripts/site.mjs sync
node scripts/site.mjs check
```

## Deployment

Pushing to `main` runs the workflow, which validates the site and publishes `site/` to GitHub Pages.
One-time setup: repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
