/* WhiteLakeViz page generator.
 *
 * One module, two users:
 *   - the browser admin (/admin/) calls buildSite() and commits the result to GitHub;
 *   - `node tools/build.mjs` calls the same function on local files.
 *
 * It never touches anything outside what it generates:
 *   projects/*.html and ua/projects/*.html        (fully generated, do not edit by hand)
 *   sitemap.xml                                    (fully generated)
 *   the blocks between  <!-- projects:home:start --> ... <!-- projects:home:end -->
 *   and                 <!-- projects:gallery:start --> ... <!-- projects:gallery:end -->
 *   inside index.html, ua/index.html, gallery.html, ua/gallery.html
 */

const BASE = 'https://studiowhitelake.xyz';

export const CATEGORIES = ['interior', 'exterior', 'automotive'];

const CAT = {
  en: { interior: 'Interior visualization', exterior: 'Exterior visualization', automotive: 'Automotive CGI' },
  uk: { interior: "Візуалізація інтер'єру", exterior: "Візуалізація екстер'єру", automotive: 'Автомобільний CGI' },
};
export const CATEGORY_LABELS = CAT.uk;

const T = {
  en: {
    home: 'Home', gallery: 'Gallery', about: 'About', works: 'Works', contact: 'Contact', menu: 'Menu', up: 'Back to top',
    prev: 'Previous project', nxt: 'Next project', view: 'View project', cta_btn: 'Get a quote',
    proj_cta1: 'Want a visualization like this?', proj_cta2: 'Tell us about your project.',
    software: 'Software', view_n: 'view',
  },
  uk: {
    home: 'Головна', gallery: 'Галерея', about: 'Про Нас', works: 'Роботи', contact: 'Контакти', menu: 'Меню', up: 'Нагору',
    prev: 'Попередній проєкт', nxt: 'Наступний проєкт', view: 'Дивитись проєкт', cta_btn: 'Отримати розрахунок',
    proj_cta1: 'Хочете таку візуалізацію?', proj_cta2: 'Розкажіть про свій проєкт.',
    software: 'Програми', view_n: 'ракурс',
  },
};

const SAME_AS = [
  'https://www.instagram.com/whitelakeviz/',
  'https://t.me/whitelakestudio_art',
  'https://www.behance.net/studiowhitelake',
];

const JS_FAILSAFE = '<script>(function(d){d.classList.add("js");addEventListener("load",function(){' +
  'setTimeout(function(){window.__wl||d.classList.remove("js")},3000)})})(document.documentElement)</script>';

const SVG_BARS = '<svg class="ic ic_bars" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';
const SVG_CLOSE = '<svg class="ic ic_close" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>';
const SVG_UP = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';

const FIELDS = ['title', 'short', 'lead', 'alt'];

/* ------------------------------------------------------------------ helpers */

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const UK_TO_LAT = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ъ: '',
};

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[а-яіїєґыэъ]/g, (c) => UK_TO_LAT[c] ?? '')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const isCrlf = (t) => (t.match(/\r\n/g) || []).length > (t.match(/(?<!\r)\n/g) || []).length;
const lf = (t) => t.replace(/\r\n/g, '\n');
const withEol = (t, crlf) => (crlf ? t.replace(/\n/g, '\r\n') : t);

function tr(p, lang) {
  const other = lang === 'en' ? 'uk' : 'en';
  const c = {};
  for (const k of FIELDS) c[k] = (p[lang] && p[lang][k]) || (p[other] && p[other][k]) || '';
  c.short = c.short || c.title;
  return c;
}

const projPath = (p, lang) => `${lang === 'uk' ? '/ua' : ''}/projects/${p.slug}.html`;
const projUrl = (p, lang) => BASE + projPath(p, lang);

function dims(data, file) {
  const s = data.sizes && data.sizes[file];
  return s && s[0] && s[1] ? `width="${s[0]}" height="${s[1]}" ` : '';
}

function coverOf(p) {
  return p.files && p.files.length ? p.files[0] : '';
}

function defaultAlt(c, cat, n) {
  const base = `${c.short}: ${cat.toLowerCase()}`;
  return n ? `${base}, ${n.label} ${n.i}` : base;
}

function altFor(p, lang, file, index, data) {
  const c = tr(p, lang);
  const cat = CAT[lang][p.category] || '';
  if (index === 0) return c.alt || defaultAlt(c, cat);
  return defaultAlt(c, cat, { label: T[lang].view_n, i: index + 1 });
}

function metaDesc(lead) {
  const text = String(lead || '').replace(/\s+/g, ' ').trim();
  if (text.length <= 158) return text;
  const first = text.split(/(?<=[.!?])\s/)[0];
  if (first.length >= 70 && first.length <= 158) return first;
  return text.slice(0, 155).replace(/\s+\S*$/, '') + '…';
}

function ordered(data) {
  const bySlug = new Map(data.projects.map((p) => [p.slug, p]));
  const seen = new Set();
  const list = [];
  const take = (slug) => {
    const p = bySlug.get(slug);
    if (p && !seen.has(slug)) { seen.add(slug); list.push(p); }
  };
  (data.order && data.order.home || []).forEach(take);
  (data.order && data.order.gallery || []).forEach(take);
  data.projects.forEach((p) => take(p.slug));
  return list;
}

/* --------------------------------------------------- shared chunks (GTM, footer) */

function sharedChunks(galleryText) {
  const g = lf(galleryText);
  const gtm = g.match(/<script>\(function\(w,d,s,l,i\)[\s\S]*?<\/script>/);
  const noscript = g.match(/<noscript><iframe src="https:\/\/www\.googletagmanager\.com[\s\S]*?<\/noscript>/);
  const foot = g.match(/<div class="contact">[\s\S]*?<\/footer>/);
  if (!gtm || !noscript || !foot) throw new Error('gallery.html: не знайдено GTM або футер');
  return { gtm: gtm[0], noscript: noscript[0], footer: foot[0].replace(/src="icons\//g, 'src="/icons/') };
}

/* ------------------------------------------------------------------ project page */

function ctaBand(t, c1, c2, btn) {
  return `    <section class="cta_band">\n      <p class="cta_big">${esc(c1)}<span>${esc(c2)}</span></p>\n` +
    `      <a class="btn" href="#contact">${esc(btn)}</a>\n    </section>\n\n`;
}

function buildProject(p, i, list, lang, chunks, data) {
  const t = T[lang];
  const c = tr(p, lang);
  const url = projUrl(p, lang);
  const enUrl = projUrl(p, 'en');
  const ukUrl = projUrl(p, 'uk');
  const cat = CAT[lang][p.category] || '';
  const title = `${c.short}: ${cat} | WhiteLakeViz`;
  const desc = metaDesc(c.lead);
  const ogFile = p.ogImage || coverOf(p) || 'bedroom_2_fin.webp';
  const root = lang === 'uk' ? '/ua' : '';
  const files = p.files || [];

  const frames = [];
  const ldImages = [];
  let wrapperCls;
  if (!files.length && p.video) {
    frames.push(`<figure><video src="/images/${esc(p.video)}" controls muted loop playsinline preload="metadata" aria-label="${esc(c.title)}"></video></figure>`);
    wrapperCls = 'project_frames';
  } else {
    wrapperCls = 'project_frames img_container';
    files.forEach((f, n) => {
      const alt = altFor(p, lang, f, n, data);
      const attrs = n === 0 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy" decoding="async"';
      frames.push(`<figure><img src="/images/${esc(f)}" alt="${esc(alt)}" ${dims(data, f)}${attrs}></figure>`);
      ldImages.push({ '@type': 'ImageObject', contentUrl: `${BASE}/images/${f}`, name: c.title, caption: alt });
    });
  }

  const prevP = list[(i - 1 + list.length) % list.length];
  const nextP = list[(i + 1) % list.length];
  const meta = p.software
    ? `<dl class="project_meta"><div><dt>${t.software}:</dt><dd>${esc(p.software)}</dd></div></dl>\n      `
    : '';
  const lead = String(c.lead || '').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)
    .map((s) => `<p class="project_lead">${esc(s)}</p>`).join('\n      ');

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization', '@id': `${BASE}/#organization`, name: 'WhiteLakeViz', url: `${BASE}/`,
        logo: `${BASE}/icons/studiologo_page.png`, image: `${BASE}/images/bedroom_2_fin.webp`,
        email: 'whitelakestudio@proton.me', sameAs: SAME_AS,
      },
      {
        '@type': 'CreativeWork', '@id': `${url}#work`, name: c.title, description: c.lead, url,
        inLanguage: lang, genre: cat, creator: { '@id': `${BASE}/#organization` },
        image: ldImages.length ? ldImages : `${BASE}/images/${ogFile}`,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: t.home, item: `${BASE}${root}/` },
          { '@type': 'ListItem', position: 2, name: t.gallery, item: `${BASE}${root}/gallery.html` },
          { '@type': 'ListItem', position: 3, name: c.title, item: url },
        ],
      },
    ],
  };

  const [ogLoc, ogAlt] = lang === 'en' ? ['en_US', 'uk_UA'] : ['uk_UA', 'en_US'];
  const nav = `<li><a href="${root}/#about">${t.about}</a></li>\n` +
    `    <li><a href="${root}/#work">${t.works}</a></li>\n` +
    `    <li><a href="${root}/gallery.html">${t.gallery}</a></li>\n` +
    `    <li><a href="#contact">${t.contact}</a></li>`;
  const [enCls, ukCls] = lang === 'en' ? ['lang-btn active', 'lang-btn'] : ['lang-btn', 'lang-btn active'];
  const sw = `<a href="${projPath(p, 'en')}" class="${enCls}" data-lang="en">EN</a>\n` +
    `        <span class="lang-divider">|</span>\n` +
    `        <a href="${projPath(p, 'uk')}" class="${ukCls}" data-lang="ua">UA</a>`;
  const ogImgAlt = ogFile === coverOf(p) ? altFor(p, lang, ogFile, 0, data) : '';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${JS_FAILSAFE}
    ${chunks.gtm}
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <link rel="canonical" href="${url}">
    <link rel="alternate" hreflang="en" href="${enUrl}">
    <link rel="alternate" hreflang="uk" href="${ukUrl}">
    <link rel="alternate" hreflang="x-default" href="${enUrl}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="WhiteLakeViz">
    <meta property="og:locale" content="${ogLoc}">
    <meta property="og:locale:alternate" content="${ogAlt}">
    <meta property="og:url" content="${url}">
    <meta property="og:title" content="${esc(c.title)} | WhiteLakeViz">
    <meta property="og:description" content="${esc(desc)}">
    <meta property="og:image" content="${BASE}/images/${esc(ogFile)}">
${ogImgAlt ? `    <meta property="og:image:alt" content="${esc(ogImgAlt)}">\n` : ''}    <meta name="twitter:card" content="summary_large_image">
    <link rel="stylesheet" href="/styles.css">
    <link rel="icon" href="/icons/studiologo.png" type="image/png">
    <script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
    </script>
</head>

<body>
    ${chunks.noscript}
    <header id="home">
      <div class="navbar">
        <div class="logo">
          <a href="${root}/">
            <img src="/icons/studiologo_page.png" alt="WhiteLakeViz Logo" style="height: 50px;">
          </a>
        </div>
          <ul class="links">
    ${nav}
    <li class="lang-switcher">
        ${sw}
    </li>
</ul>
          <div class="toggle_btn" role="button" tabindex="0" aria-expanded="false" aria-label="${t.menu}">
            ${SVG_BARS}${SVG_CLOSE}
          </div>
      </div>

      <div class="dropdown_menu">
    ${nav}
    <li class="dropdown-lang-switcher">
        ${sw}
    </li>
</div>
    </header>

    <main class="project">
      <p class="crumbs"><a href="${root}/">${t.home}</a><span>/</span><a href="${root}/gallery.html">${t.gallery}</a><span>/</span>${esc(c.short)}</p>
      <p class="eyebrow">${esc(cat)}</p>
      <h1 class="project_title">${esc(c.title)}</h1>
      ${lead}
      ${meta}<p class="project_cta"><a class="btn" href="#contact">${esc(t.cta_btn)}</a></p>

      <div class="${wrapperCls}">
        ${frames.join('\n        ')}
      </div>

      <nav class="project_nav" aria-label="${esc(t.nxt)}">
        <a href="${projPath(prevP, lang)}">&larr; ${esc(t.prev)}<span>${esc(tr(prevP, lang).short)}</span></a>
        <a class="next" href="${projPath(nextP, lang)}">${esc(t.nxt)} &rarr;<span>${esc(tr(nextP, lang).short)}</span></a>
      </nav>
    </main>

${ctaBand(t, t.proj_cta1, t.proj_cta2, t.cta_btn)}    <div id="imageModal" class="modal">
      <span class="close">&times;</span>
      <img class="modal-content" id="modalImage" alt="">
    </div>

    <a href="#home" class="back-to-top" aria-label="${t.up}">
      ${SVG_UP}
    </a>

    ${chunks.footer}

    <script src="/script.js"></script>
    <script src="/modal.js"></script>
    <script src="/site.js" defer></script>
</body>
</html>
`;
}

/* ------------------------------------------------ home + gallery blocks */

function homeFigure(p, lang, data) {
  const c = tr(p, lang);
  const t = T[lang];
  const link = `<a class="project_link" href="${projPath(p, lang)}">${esc(t.view)}</a>`;
  let media;
  if (p.files && p.files.length) {
    const f = p.files[0];
    media = `<img src="/images/${esc(f)}" alt="${esc(altFor(p, lang, f, 0, data))}" ${dims(data, f)}loading="lazy" decoding="async" style="width:100%">`;
  } else if (p.video) {
    media = `<video src="/images/${esc(p.video)}" autoplay loop muted playsinline style="width:100%" aria-label="${esc(c.title)}"></video>`;
  } else {
    media = '';
  }
  return `        <figure>\n        ${media}\n        <figcaption>${esc(c.title)}</figcaption>\n        ${link}\n        </figure>`;
}

function homeBlock(data, lang) {
  const bySlug = new Map(data.projects.map((p) => [p.slug, p]));
  const list = (data.order.home || []).map((s) => bySlug.get(s)).filter(Boolean);
  const rows = [];
  let i = 0;
  if (list.length) { rows.push([list[0]]); i = 1; } // first work is shown alone, large
  while (i < list.length) { rows.push(list.slice(i, i + 2)); i += 2; }
  return rows
    .map((r) => `    <div class="img_container">\n${r.map((p) => homeFigure(p, lang, data)).join('\n')}\n    </div>`)
    .join('\n\n');
}

function galleryBlock(data, lang) {
  const bySlug = new Map(data.projects.map((p) => [p.slug, p]));
  const list = (data.order.gallery || []).map((s) => bySlug.get(s)).filter((p) => p && p.files && p.files.length);
  return list.map((p, idx) => {
    const c = tr(p, lang);
    const cover = p.files[0];
    const lazy = idx < 6 ? '' : ' loading="lazy" decoding="async"';
    return `        <div class="gallery-item" data-project-images="${p.files.map((f) => '/images/' + esc(f)).join(',')}">\n` +
      `            <img src="/images/${esc(cover)}" alt="${esc(altFor(p, lang, cover, 0, data))}" ${dims(data, cover)}class="gallery-img"${lazy}>\n` +
      `            <div class="gallery-caption">${esc(c.title)}</div>\n` +
      `        </div>`;
  }).join('\n\n');
}

function replaceRegion(text, name, inner, rel) {
  const re = new RegExp(`(<!-- projects:${name}:start -->)[\\s\\S]*?(<!-- projects:${name}:end -->)`);
  if (!re.test(text)) throw new Error(`${rel}: немає маркерів <!-- projects:${name}:start/end -->`);
  return text.replace(re, (_m, a, b) => `${a}\n${inner}\n        ${b}`);
}

/* --------------------------------------------------------------------- sitemap */

function sitemap(data, list) {
  const last = list.reduce((m, p) => (p.updated && p.updated > m ? p.updated : m), '2026-11-01');
  const pages = [
    [`${BASE}/`, `${BASE}/`, `${BASE}/ua/`, last],
    [`${BASE}/ua/`, `${BASE}/`, `${BASE}/ua/`, last],
    [`${BASE}/gallery.html`, `${BASE}/gallery.html`, `${BASE}/ua/gallery.html`, last],
    [`${BASE}/ua/gallery.html`, `${BASE}/gallery.html`, `${BASE}/ua/gallery.html`, last],
  ];
  for (const p of list) {
    const en = projUrl(p, 'en');
    const uk = projUrl(p, 'uk');
    const d = p.updated || '2026-11-01';
    pages.push([en, en, uk, d], [uk, en, uk, d]);
  }
  const out = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">'];
  for (const [loc, en, uk, d] of pages) {
    out.push('  <url>', `    <loc>${loc}</loc>`, `    <lastmod>${d}</lastmod>`,
      `    <xhtml:link rel="alternate" hreflang="en" href="${en}"/>`,
      `    <xhtml:link rel="alternate" hreflang="uk" href="${uk}"/>`,
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${en}"/>`, '  </url>');
  }
  out.push('</urlset>');
  return out.join('\n') + '\n';
}

/* ---------------------------------------------------------------- validation */

export function validate(data) {
  const errors = [];
  const slugs = new Set();
  for (const p of data.projects) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug || '')) errors.push(`«${p.slug}»: адреса (slug) має бути з латинських літер, цифр і дефісів`);
    if (slugs.has(p.slug)) errors.push(`«${p.slug}»: така адреса вже є`);
    slugs.add(p.slug);
    if (!CATEGORIES.includes(p.category)) errors.push(`«${p.slug}»: не обрано категорію`);
    if (!(p.en && p.en.title) && !(p.uk && p.uk.title)) errors.push(`«${p.slug}»: потрібна назва`);
    if (!(p.files && p.files.length) && !p.video) errors.push(`«${p.slug}»: потрібне хоча б одне фото або відео`);
  }
  for (const k of ['home', 'gallery']) {
    for (const s of (data.order && data.order[k]) || []) {
      if (!slugs.has(s)) errors.push(`порядок «${k}»: невідомий проєкт «${s}»`);
    }
  }
  return errors;
}

/* ------------------------------------------------------------------ main entry */

/**
 * @param data   parsed data/projects.json
 * @param files  { 'index.html': text, 'ua/index.html': text, 'gallery.html': text, 'ua/gallery.html': text }
 * @returns { out: {path: text}, generated: Set<path> }  paths are relative, no leading slash
 */
export function buildSite(data, files) {
  const errors = validate(data);
  if (errors.length) throw new Error(errors.join('\n'));
  data.order = data.order || { home: [], gallery: [] };
  const list = ordered(data);
  const out = {};
  const generated = new Set();

  const chunks = {
    en: sharedChunks(files['gallery.html']),
    uk: sharedChunks(files['ua/gallery.html']),
  };
  list.forEach((p, i) => {
    for (const lang of ['en', 'uk']) {
      const path = projPath(p, lang).slice(1);
      out[path] = buildProject(p, i, list, lang, chunks[lang], data);
      generated.add(path);
    }
  });

  const targets = [
    ['index.html', 'en', 'home'], ['ua/index.html', 'uk', 'home'],
    ['gallery.html', 'en', 'gallery'], ['ua/gallery.html', 'uk', 'gallery'],
  ];
  for (const [rel, lang, kind] of targets) {
    const raw = files[rel];
    const crlf = isCrlf(raw);
    const inner = kind === 'home' ? homeBlock(data, lang) : galleryBlock(data, lang);
    out[rel] = withEol(replaceRegion(lf(raw), kind, inner, rel), crlf);
  }
  out['sitemap.xml'] = sitemap(data, list);
  return { out, generated };
}
