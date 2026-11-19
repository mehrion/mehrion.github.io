#!/usr/bin/env node
// Zero-dependency site tooling.
//   node scripts/site.mjs sync    rewrite shared header/footer in every page from partials/
//   node scripts/site.mjs check   verify layout sync, links, sitemap and required Play Store pages
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
];
const NOT_IN_SITEMAP = ['404.html'];

const read = (p) => readFileSync(p, 'utf8');

function walk(dir) {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

const pages = () => walk(SITE).filter((f) => f.endsWith('.html'));
const urlPath = (file) => '/' + relative(SITE, file).replaceAll('\\', '/');

function render(partialName, pagePath) {
    const html = read(join(ROOT, 'partials', `${partialName}.html`)).trimEnd();
    // Mark the link pointing at the current page.
    return html.replace(/<a ([^>]*?)href="([^"]+)"([^>]*?) data-nav>/g, (m, a, href, b) => {
        const current = href === pagePath || (href === '/' && pagePath === '/index.html');
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
    let changed = 0;
    for (const file of pages()) {
        const { original, out } = applyLayout(file);
        if (original !== out) {
            writeFileSync(file, out);
            changed++;
            console.log('updated', urlPath(file));
        }
    }
    console.log(`sync done (${changed} file(s) updated)`);
}

function check() {
    const errors = [];
    const files = pages();

    for (const req of REQUIRED_PAGES) {
        if (!existsSync(join(SITE, req))) errors.push(`missing required page: ${req}`);
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
            const loc = p === '/index.html' ? `${ORIGIN}/` : `${ORIGIN}${p}`;
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

const cmd = process.argv[2];
if (cmd === 'sync') sync();
else if (cmd === 'check') check();
else {
    console.error('usage: node scripts/site.mjs <sync|check>');
    process.exit(2);
}
