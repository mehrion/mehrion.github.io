#!/usr/bin/env node
// Zero-dependency site tooling.
//   node scripts/site.mjs sync    rewrite shared header/footer in every page from partials/
//   node scripts/site.mjs check   verify layout sync, links, SEO tags, JSON-LD, sitemap and required pages
//   node scripts/site.mjs stamp   set every "last updated" date on the site to today (pre-commit hook)
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const ORIGIN = 'https://mehrion.github.io';

// Pages Google Play expects a developer to be able to link to.
const REQUIRED_PAGES = [
    'index.html', 'privacy-policy.html', 'terms-of-service.html',
    'delete-account.html', 'child-safety.html', 'contact.html', 'about.html', 'apps.html', '404.html',
    'calculator/index.html',
];
const REQUIRED_FILES = ['robots.txt', 'sitemap.xml', 'llms.txt', 'llms-full.txt', 'favicon.svg', 'favicon.ico', 'apple-touch-icon.png'];
const NOT_IN_SITEMAP = ['404.html'];
// Pages that must stay general: they never mention one specific product (add each new product's name).
const GENERAL_PAGES = ['about.html', 'privacy-policy.html', 'terms-of-service.html', 'delete-account.html', 'child-safety.html'];
const PRODUCT_NAMES = ['calculator'];
// The contact address may appear in exactly one place (owner rule).
const EMAIL = 'arsalan.rex.cloud@gmail.com';
const EMAIL_PAGE = 'contact.html';

const read = (p) => readFileSync(p, 'utf8');

function walk(dir) {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

const pages = () => walk(SITE).filter((f) =>
    f.endsWith('.html') && !read(f).startsWith('google-site-verification: '));
const urlPath = (file) => '/' + relative(SITE, file).replaceAll('\\', '/');
// Public URL path: / for the home page, /calculator/ for calculator/index.html.
const publicPath = (file) => urlPath(file).replace(/index\.html$/, '');

function render(partialName, pagePath) {
    const html = read(join(ROOT, 'partials', `${partialName}.html`)).trimEnd();
    // Mark the link pointing at the current page.
    return html.replace(/<a ([^>]*?)href="([^"]+)"([^>]*?) data-nav>/g, (m, a, href, b) => {
        const current = href === pagePath || href === pagePath.replace(/index\.html$/, '');
        return `<a ${a}href="${href}"${b}${current ? ' aria-current="page"' : ''}>`;
    });
}

function applyLayout(file) {
    const original = read(file);
    let out = original;
    for (const name of ['header', 'footer']) {
        const re = new RegExp(`(<!-- layout:${name}:start -->)[\\s\\S]*?(<!-- layout:${name}:end -->)`);
        if (!re.test(out)) continue;
        out = out.replace(re, (_, s, e) => `${s}\n${render(name, urlPath(file))}\n${e}`);
    }
    return { original, out };
}

function sync() {
    const paths = process.argv.includes('--paths');
    const changed = [];
    for (const file of pages()) {
        const { original, out } = applyLayout(file);
        if (original !== out) {
            writeFileSync(file, out);
            changed.push(relative(ROOT, file));
            if (!paths) console.log('updated', urlPath(file));
        }
    }
    if (paths) console.log(changed.join('\n'));
    else console.log(`sync done (${changed.length} file(s) updated)`);
}

function check() {
    const errors = [];
    const files = pages();

    for (const req of REQUIRED_PAGES) {
        if (!existsSync(join(SITE, req))) errors.push(`missing required page: ${req}`);
    }
    for (const req of REQUIRED_FILES) {
        if (!existsSync(join(SITE, req))) errors.push(`missing required file: ${req}`);
    }

    for (const file of walk(SITE)) {
        if (/\.(html|txt|xml)$/.test(file) && urlPath(file) !== `/${EMAIL_PAGE}` && read(file).includes(EMAIL)) {
            errors.push(`${urlPath(file)}: contains the contact email, which may appear only on /${EMAIL_PAGE}`);
        }
    }

    for (const file of files) {
        const p = urlPath(file);
        const { original, out } = applyLayout(file);
        const html = original;
        if (original !== out) errors.push(`${p}: header/footer out of sync (run: node scripts/site.mjs sync)`);
        for (const name of ['header', 'footer']) {
            if (!html.includes(`<!-- layout:${name}:start -->`)) errors.push(`${p}: missing layout:${name} markers`);
        }
        if (!/<title>[^<]+<\/title>/.test(html)) errors.push(`${p}: missing <title>`);
        if (!/<meta name="description" content="[^"]+">/.test(html)) errors.push(`${p}: missing meta description`);
        if (!/<h1[ >]/.test(html)) errors.push(`${p}: missing <h1>`);
        if (!/<html lang="/.test(html)) errors.push(`${p}: missing html lang`);

        // Search and AI-crawler basics. The 404 page is noindex and has none of these.
        if (!NOT_IN_SITEMAP.includes(p.slice(1))) {
            const canonical = `${ORIGIN}${publicPath(file)}`;
            if (!html.includes(`<link rel="canonical" href="${canonical}">`)) errors.push(`${p}: canonical must be ${canonical}`);
            if (!html.includes(`<meta property="og:url" content="${canonical}">`)) errors.push(`${p}: og:url must be ${canonical}`);
            for (const tag of ['og:title', 'og:description', 'og:image', 'twitter:card', 'keywords', 'robots']) {
                if (!new RegExp(`<meta (?:property|name)="${tag}" content="[^"]+">`).test(html)) errors.push(`${p}: missing ${tag} meta tag`);
            }
            const title = /<title>([^<]+)<\/title>/.exec(html)?.[1] ?? '';
            if (title.length > 70) errors.push(`${p}: title is ${title.length} characters (keep it at 70 or fewer)`);
            const desc = /<meta name="description" content="([^"]+)">/.exec(html)?.[1] ?? '';
            if (desc.length > 170) errors.push(`${p}: meta description is ${desc.length} characters (keep it at 170 or fewer)`);
            if (!html.includes('application/ld+json')) errors.push(`${p}: missing JSON-LD structured data`);
        }
        for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
            try { JSON.parse(m[1]); } catch (e) { errors.push(`${p}: invalid JSON-LD (${e.message})`); }
        }
        for (const m of html.matchAll(/content="https:\/\/mehrion\.github\.io(\/assets\/[^"]+)"/g)) {
            if (!existsSync(join(SITE, m[1]))) errors.push(`${p}: social image not found ${m[1]}`);
        }

        // General pages talk about Ivory as a whole, never about one product.
        if (GENERAL_PAGES.includes(p.slice(1))) {
            for (const name of PRODUCT_NAMES) {
                if (new RegExp(name, 'i').test(html)) errors.push(`${p}: mentions a specific product (${name}); general pages must not`);
            }
        }

        // Product page structure (owner rules): phone + tablet gallery, 6 feature boxes, no policies section.
        if (/^\/[^/]+\/index\.html$/.test(p)) {
            const galleries = [...html.matchAll(/<h3 class="gallery-title">([^<]+)<\/h3>/g)].map((m) => m[1]);
            if (galleries.join('|') !== 'On a phone|On a tablet') errors.push(`${p}: gallery must be exactly "On a phone" and "On a tablet" (found: ${galleries.join(', ') || 'none'})`);
            const features = /What it does\.[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
            const boxes = (features.match(/<div class="card">/g) || []).length;
            if (boxes !== 6) errors.push(`${p}: "What it does." must have exactly 6 boxes (found ${boxes})`);
            if (/Policies &amp; support/.test(html)) errors.push(`${p}: product pages must not have a "Policies & support." section`);
            if (/tablet-10|10-inch/.test(html)) errors.push(`${p}: 10-inch tablet pictures are not used`);
        }

        // Internal link / asset targets must exist.
        for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
            const ref = m[1];
            if (/^(https?:|mailto:|tel:|#|data:)/.test(ref)) continue;
            const clean = ref.split('#')[0].split('?')[0];
            if (!clean) continue;
            let target = clean.startsWith('/') ? join(SITE, clean) : join(dirname(file), clean);
            if (clean.endsWith('/')) target = join(target, 'index.html');
            if (!existsSync(target)) errors.push(`${p}: broken reference ${ref}`);
        }
    }

    const sitemapFile = join(SITE, 'sitemap.xml');
    if (existsSync(sitemapFile)) {
        const sitemap = read(sitemapFile);
        for (const file of files) {
            const p = urlPath(file);
            if (NOT_IN_SITEMAP.includes(p.slice(1))) continue;
            const loc = `${ORIGIN}${publicPath(file)}`;
            if (!sitemap.includes(`<loc>${loc}</loc>`)) errors.push(`sitemap.xml: missing ${loc}`);
        }
    } else {
        errors.push('missing sitemap.xml');
    }

    if (errors.length) {
        console.error(errors.map((e) => ` - ${e}`).join('\n'));
        console.error(`\ncheck failed: ${errors.length} problem(s)`);
        process.exit(1);
    }
    console.log(`check passed (${files.length} pages)`);
}

// Sets every "last updated" date on the site to today: the visible "Last updated" lines,
// JSON-LD dateModified, sitemap lastmod and llms-full.txt. Run by the pre-commit hook.
function stamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const iso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const human = `${now.getDate()} ${now.toLocaleString('en-US', { month: 'long' })} ${now.getFullYear()}`;
    const targets = [...pages(), join(SITE, 'sitemap.xml'), join(SITE, 'llms-full.txt')].filter(existsSync);
    const changed = [];
    for (const file of targets) {
        const original = read(file);
        const out = original
            .replace(/(Last updated: )\d{1,2} [A-Za-z]+ \d{4}/g, `$1${human}`)
            .replace(/("dateModified": ")\d{4}-\d{2}-\d{2}/g, `$1${iso}`)
            .replace(/(<lastmod>)\d{4}-\d{2}-\d{2}/g, `$1${iso}`)
            .replace(/^(Last updated: )\d{4}-\d{2}-\d{2}/gm, `$1${iso}`);
        if (out !== original) {
            writeFileSync(file, out);
            changed.push(relative(ROOT, file));
        }
    }
    if (process.argv.includes('--paths')) console.log(changed.join('\n'));
    else console.log(`stamp done (${changed.length} file(s) set to ${iso})`);
}

const cmd = process.argv[2];
if (cmd === 'sync') sync();
else if (cmd === 'check') check();
else if (cmd === 'stamp') stamp();
else {
    console.error('usage: node scripts/site.mjs <sync|check|stamp>');
    process.exit(2);
}
