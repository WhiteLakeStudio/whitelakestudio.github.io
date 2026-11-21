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
export const SHOP_LABELS = { free: 'Безкоштовно', link: 'За посиланням', soon: 'Скоро на сайті' };

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
  const nav = navHtml(lang, root);
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
    const lazy = idx < 3 ? '' : ' loading="lazy" decoding="async"';
    return `        <article class="reel_panel">\n` +
      `            <a class="reel_frame" href="${projPath(p, lang)}" aria-label="${esc(c.title)}">\n` +
      `                <img class="reel_img" src="/images/${esc(cover)}" alt="${esc(altFor(p, lang, cover, 0, data))}" ${dims(data, cover)}${lazy.trim()}>\n` +
      `            </a>\n` +
      `            <div class="reel_meta"><small>${esc(CAT[lang][p.category] || '')}</small><h2>${esc(c.title)}</h2></div>\n` +
      `            <span class="reel_big" aria-hidden="true">${String(idx + 1).padStart(2, '0')}</span>\n` +
      `        </article>`;
  }).join('\n');
}

function replaceRegion(text, name, inner, rel) {
  const re = new RegExp(`(<!-- projects:${name}:start -->)[\\s\\S]*?(<!-- projects:${name}:end -->)`);
  if (!re.test(text)) throw new Error(`${rel}: немає маркерів <!-- projects:${name}:start/end -->`);
  return text.replace(re, (_m, a, b) => `${a}\n${inner}\n        ${b}`);
}

/* --------------------------------------------------------------------- sitemap */

function sitemap(data, list, extra = []) {
  const last = list.reduce((m, p) => (p.updated && p.updated > m ? p.updated : m), '2026-11-01');
  const pages = [
    [`${BASE}/`, `${BASE}/`, `${BASE}/ua/`, last],
    [`${BASE}/ua/`, `${BASE}/`, `${BASE}/ua/`, last],
    [`${BASE}/gallery.html`, `${BASE}/gallery.html`, `${BASE}/ua/gallery.html`, last],
    [`${BASE}/ua/gallery.html`, `${BASE}/gallery.html`, `${BASE}/ua/gallery.html`, last],
  ];
  for (const [path, d] of extra) pages.push([BASE + path.en, BASE + path.en, BASE + path.uk, d], [BASE + path.uk, BASE + path.en, BASE + path.uk, d]);
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
  const pslugs = new Set();
  for (const p of data.posts || []) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug || '')) errors.push(`допис «${p.slug}»: адреса має бути з латинських літер, цифр і дефісів`);
    if (pslugs.has(p.slug)) errors.push(`допис «${p.slug}»: така адреса вже є`);
    pslugs.add(p.slug);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) errors.push(`допис «${p.slug}»: вкажіть дату`);
    if (!(p.en && p.en.title) && !(p.uk && p.uk.title)) errors.push(`допис «${p.slug}»: потрібен заголовок`);
    if (!(p.en && p.en.body) && !(p.uk && p.uk.body)) errors.push(`допис «${p.slug}»: потрібен текст`);
  }
  const sslugs = new Set();
  for (const p of (data.shop && data.shop.items) || []) {
    const n = `набір «${p.slug}»`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug || '')) errors.push(`${n}: адреса має бути з латинських літер, цифр і дефісів`);
    if (sslugs.has(p.slug)) errors.push(`${n}: така адреса вже є`);
    sslugs.add(p.slug);
    if (!SHOP_STATUSES.includes(p.status)) errors.push(`${n}: оберіть статус`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) errors.push(`${n}: вкажіть дату`);
    if (!(p.en && p.en.title) && !(p.uk && p.uk.title)) errors.push(`${n}: потрібна назва`);
    if ((p.status === 'free' || p.status === 'link') && !/^https?:\/\/[^\s"'<>]+$/i.test(p.url || '')) errors.push(`${n}: вкажіть посилання, що починається з https://`);
    for (const cur of ['eur', 'uah']) {
      const v = p[cur];
      if (v !== '' && v != null && !(isFinite(Number(String(v).replace(/\s/g, '').replace(',', '.'))) && Number(String(v).replace(/\s/g, '').replace(',', '.')) >= 0)) errors.push(`${n}: ціна (${cur === 'eur' ? '€' : 'грн'}) має бути числом`);
    }
  }
  for (const k of ['home', 'gallery']) {
    for (const s of (data.order && data.order[k]) || []) {
      if (!slugs.has(s)) errors.push(`порядок «${k}»: невідомий проєкт «${s}»`);
    }
  }
  return errors;
}

/* ------------------------------------------- services, blog, shared page shell */

let NAV_FLAGS = { services: false, blog: false, shop: false };

const X = {
  en: {
    services: 'Services', blog: 'Blog',
    svc_eyebrow: 'Services & pricing', svc_h1: 'Services and pricing',
    svc_lead: 'What we do, how long it usually takes and what it costs. Every project is different, so the final price is agreed after the brief.',
    svc_meta_title: 'Services & Pricing: 3D Visualization | WhiteLakeViz',
    svc_meta_desc: 'Interior, exterior and automotive 3D visualization: services, typical turnaround and starting prices in euros.',
    from: 'from', req: 'Price on request', turnaround: 'Typical turnaround', revisions: 'Revisions included',
    svc_cta1: 'Not sure what you need?', svc_cta2: 'Tell us about your project and we will suggest a format.',
    blog_eyebrow: 'Blog', blog_h1: 'Blog',
    blog_lead: 'Behind the scenes, practical advice for clients and notes on how our visualizations are made.',
    blog_meta_title: 'Blog: 3D Visualization Notes & Advice | WhiteLakeViz',
    blog_meta_desc: 'Behind-the-scenes breakdowns, practical advice for clients and notes on 3D architectural visualization.',
    blog_empty: 'The first articles are coming soon.', read: 'Read article', all_posts: 'All articles',
    post_cta1: 'Have a project in mind?', post_cta2: 'Tell us about it.',
    shop: 'Shop', shop_eyebrow: 'Shop', shop_h1: 'Shop',
    shop_lead: 'Ready-made sets and resources from our studio: free downloads, paid sets and what is coming next.',
    shop_meta_title: 'Shop: Sets & Resources for 3D Artists | WhiteLakeViz',
    shop_meta_desc: 'Ready-made sets and resources from WhiteLakeViz: free downloads, paid sets and upcoming releases.',
    shop_empty: 'The first sets are coming soon.', all_items: 'All sets',
    f_all: 'All', f_free: 'Free', f_link: 'Available', f_soon: 'Coming soon', f_none: 'Nothing found. Try another search or filter.',
    tags_h: 'Tags', formats_h: 'Available formats', search_ph: 'Search sets', close: 'Close', prev: 'Previous set', next: 'Next set',
    st_free: 'Free', st_link: 'Available', st_soon: 'Coming soon',
    btn_free: 'Download free', btn_link: 'Get this set', btn_soon: 'Coming soon', details: 'Details',
    shop_cta1: 'Need something made for your project?', shop_cta2: 'Tell us about it.',
  },
  uk: {
    services: 'Послуги', blog: 'Блог',
    svc_eyebrow: 'Послуги та ціни', svc_h1: 'Послуги та ціни',
    svc_lead: 'Що ми робимо, скільки це зазвичай триває і скільки коштує. Кожен проєкт різний, тому остаточну вартість узгоджуємо після брифу.',
    svc_meta_title: 'Послуги та ціни: 3D-візуалізація | WhiteLakeViz',
    svc_meta_desc: 'Візуалізація інтер\'єрів, екстер\'єрів та авто: послуги, типові терміни й орієнтовні ціни в гривнях.',
    from: 'від', req: 'Ціна за запитом', turnaround: 'Типовий термін', revisions: 'Правок у вартості',
    svc_cta1: 'Не впевнені, що саме потрібно?', svc_cta2: 'Розкажіть про проєкт, і ми запропонуємо формат.',
    blog_eyebrow: 'Блог', blog_h1: 'Блог',
    blog_lead: 'Закулісся, практичні поради для клієнтів і нотатки про те, як створюються наші візуалізації.',
    blog_meta_title: 'Блог: нотатки та поради про 3D-візуалізацію | WhiteLakeViz',
    blog_meta_desc: 'Розбори проєктів, практичні поради для клієнтів і нотатки про архітектурну 3D-візуалізацію.',
    blog_empty: 'Перші статті з\'являться найближчим часом.', read: 'Читати статтю', all_posts: 'Усі статті',
    post_cta1: 'Маєте проєкт?', post_cta2: 'Розкажіть про нього.',
    shop: 'Магазин', shop_eyebrow: 'Магазин', shop_h1: 'Магазин',
    shop_lead: 'Готові набори та ресурси від нашої студії: безкоштовні завантаження, платні набори й те, що з\'явиться далі.',
    shop_meta_title: 'Магазин: набори та ресурси для 3D-художників | WhiteLakeViz',
    shop_meta_desc: 'Готові набори та ресурси від WhiteLakeViz: безкоштовні завантаження, платні набори й майбутні релізи.',
    shop_empty: 'Перші набори з\'являться найближчим часом.', all_items: 'Усі набори',
    f_all: 'Усі', f_free: 'Безкоштовні', f_link: 'Доступні', f_soon: 'Скоро', f_none: 'Нічого не знайдено. Спробуйте інший запит або фільтр.',
    tags_h: 'Теги', formats_h: 'Доступні формати', search_ph: 'Пошук по наборах', close: 'Закрити', prev: 'Попередній набір', next: 'Наступний набір',
    st_free: 'Безкоштовно', st_link: 'Доступно', st_soon: 'Скоро на сайті',
    btn_free: 'Завантажити безкоштовно', btn_link: 'Отримати набір', btn_soon: 'Скоро', details: 'Докладніше',
    shop_cta1: 'Потрібне щось під ваш проєкт?', shop_cta2: 'Розкажіть про нього.',
  },
};

const servicesOn = (data) => !!(data.services && (data.services.items || []).some((s) => s.active !== false));
const livePosts = (data) => (data.posts || []).filter((p) => p.published !== false && p.slug)
  .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

const svcPath = (lang) => (lang === 'uk' ? '/ua/services.html' : '/services.html');
const blogPath = (lang) => (lang === 'uk' ? '/ua/blog.html' : '/blog.html');
const postPath = (p, lang) => `${lang === 'uk' ? '/ua' : ''}/blog/${p.slug}.html`;
const shopPath = (lang) => (lang === 'uk' ? '/ua/shop.html' : '/shop.html');
const itemPath = (p, lang) => `${lang === 'uk' ? '/ua' : ''}/shop/${p.slug}.html`;
export const SHOP_STATUSES = ['free', 'link', 'soon'];
const liveShop = (data) => ((data.shop && data.shop.items) || []).filter((p) => p.published !== false && p.slug)
  .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

function extraNav(lang) {
  const x = X[lang];
  const li = [];
  if (NAV_FLAGS.services) li.push(`<li><a href="${svcPath(lang)}">${x.services}</a></li>`);
  if (NAV_FLAGS.blog) li.push(`<li><a href="${blogPath(lang)}">${x.blog}</a></li>`);
  if (NAV_FLAGS.shop) li.push(`<li><a href="${shopPath(lang)}">${x.shop}</a></li>`);
  return li.join('\n    ');
}

function navHtml(lang, root) {
  const t = T[lang];
  const extra = extraNav(lang);
  return `<li><a href="${root}/#about">${t.about}</a></li>\n` +
    `    <li><a href="${root}/#work">${t.works}</a></li>\n` +
    `    <li><a href="${root}/gallery.html">${t.gallery}</a></li>\n` +
    (extra ? `    ${extra}\n` : '') +
    `    <li><a href="#contact">${t.contact}</a></li>`;
}

function fmtDate(date, lang) {
  const d = new Date(`${date}T12:00:00Z`);
  if (isNaN(d)) return '';
  return d.toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function pick(o, lang, k) {
  const other = lang === 'en' ? 'uk' : 'en';
  return (o[lang] && o[lang][k]) || (o[other] && o[other][k]) || '';
}

/** one generic page: head, header, <main>, footer. */
function shell({ lang, title, desc, canonical, enUrl, ukUrl, ld, ogImage, ogType = 'website', robots, swEn, swUk, main, chunks, cta }) {
  const t = T[lang];
  const root = lang === 'uk' ? '/ua' : '';
  const nav = navHtml(lang, root);
  const [ogLoc, ogAlt] = lang === 'en' ? ['en_US', 'uk_UA'] : ['uk_UA', 'en_US'];
  const [enCls, ukCls] = lang === 'en' ? ['lang-btn active', 'lang-btn'] : ['lang-btn', 'lang-btn active'];
  const sw = `<a href="${swEn}" class="${enCls}" data-lang="en">EN</a>\n` +
    `        <span class="lang-divider">|</span>\n` +
    `        <a href="${swUk}" class="${ukCls}" data-lang="ua">UA</a>`;
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${JS_FAILSAFE}
    ${chunks.gtm}
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}">
    <meta name="robots" content="${robots || 'index, follow, max-image-preview:large'}">
    <link rel="canonical" href="${canonical}">
${enUrl ? `    <link rel="alternate" hreflang="en" href="${enUrl}">\n    <link rel="alternate" hreflang="uk" href="${ukUrl}">\n    <link rel="alternate" hreflang="x-default" href="${enUrl}">\n` : ''}    <meta property="og:type" content="${ogType}">
    <meta property="og:site_name" content="WhiteLakeViz">
    <meta property="og:locale" content="${ogLoc}">
    <meta property="og:locale:alternate" content="${ogAlt}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:title" content="${esc(title.replace(/ \| WhiteLakeViz$/, ''))} | WhiteLakeViz">
    <meta property="og:description" content="${esc(desc)}">
    <meta property="og:image" content="${BASE}/images/${esc(ogImage)}">
    <meta name="twitter:card" content="summary_large_image">
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

${main}

${ctaBand(t, cta[0], cta[1], t.cta_btn)}    <a href="#home" class="back-to-top" aria-label="${t.up}">
      ${SVG_UP}
    </a>

    ${chunks.footer}

    <script src="/script.js"></script>
    <script src="/site.js" defer></script>
</body>
</html>
`;
}

const orgLd = () => ({
  '@type': 'Organization', '@id': `${BASE}/#organization`, name: 'WhiteLakeViz', url: `${BASE}/`,
  logo: `${BASE}/icons/studiologo_page.png`, email: 'whitelakestudio@proton.me', sameAs: SAME_AS,
});

function crumbsLd(lang, items) {
  const root = lang === 'uk' ? '/ua' : '';
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [{ '@type': 'ListItem', position: 1, name: T[lang].home, item: `${BASE}${root}/` },
      ...items.map((it, i) => ({ '@type': 'ListItem', position: i + 2, name: it[0], item: it[1] }))],
  };
}

function priceOf(s, lang) {
  const raw = lang === 'uk' ? s.uah : s.eur;
  const n = Number(String(raw ?? '').replace(/\s/g, '').replace(',', '.'));
  return raw !== '' && raw != null && isFinite(n) && n > 0 ? n : null;
}

function fmtPrice(n, lang, unit) {
  const x = X[lang];
  const num = n.toLocaleString(lang === 'uk' ? 'uk-UA' : 'en-US', { maximumFractionDigits: 2 });
  const money = lang === 'uk' ? `${num} грн` : `€${num}`;
  return `${x.from} ${money}${unit ? ' ' + unit : ''}`;
}

function buildServices(data, lang, chunks) {
  const x = X[lang];
  const sv = data.services;
  const items = (sv.items || []).filter((s) => s.active !== false);
  const root = lang === 'uk' ? '/ua' : '';
  const url = BASE + svcPath(lang);
  const intro = (sv.intro && (sv.intro[lang] || sv.intro[lang === 'en' ? 'uk' : 'en'])) || x.svc_lead;
  const note = sv.note && (sv.note[lang] || sv.note[lang === 'en' ? 'uk' : 'en']);
  const cards = items.map((s, i) => {
    const title = pick(s, lang, 'title');
    const price = priceOf(s, lang);
    const unit = pick(s, lang, 'unit');
    const days = (s[lang] && s[lang].days) || '';
    const rev = (s[lang] && s[lang].revisions) || '';
    const terms = [days && `<div><dt>${x.turnaround}:</dt><dd>${esc(days)}</dd></div>`,
      rev && `<div><dt>${x.revisions}:</dt><dd>${esc(rev)}</dd></div>`].filter(Boolean).join('');
    return `      <li class="price_card">
        <span class="num">${String(i + 1).padStart(2, '0')}</span>
        <h2>${esc(title)}</h2>
        <p class="price_desc">${esc(pick(s, lang, 'desc'))}</p>
        <p class="price_value${price ? '' : ' is_req'}">${esc(price ? fmtPrice(price, lang, unit) : x.req)}</p>
        ${terms ? `<dl class="project_meta price_terms">${terms}</dl>` : ''}
        <a class="btn_ghost" href="#contact">${esc(T[lang].cta_btn)}</a>
      </li>`;
  }).join('\n');
  const main = `    <main class="project page_services">
      <p class="crumbs"><a href="${root}/">${T[lang].home}</a><span>/</span>${x.services}</p>
      <p class="eyebrow">${x.svc_eyebrow}</p>
      <h1 class="project_title">${x.svc_h1}</h1>
      <p class="project_lead">${esc(intro)}</p>
      <ul class="price_list">
${cards}
      </ul>
${note ? `      <p class="price_note">${esc(note)}</p>\n` : ''}    </main>`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [orgLd(), crumbsLd(lang, [[x.services, url]]), {
      '@type': 'ItemList', name: x.svc_h1, url,
      itemListElement: items.map((s, i) => {
        const price = priceOf(s, lang);
        return {
          '@type': 'ListItem', position: i + 1,
          item: {
            '@type': 'Service', name: pick(s, lang, 'title'), description: pick(s, lang, 'desc'),
            provider: { '@id': `${BASE}/#organization` }, inLanguage: lang,
            ...(price ? { offers: { '@type': 'Offer', priceCurrency: lang === 'uk' ? 'UAH' : 'EUR', priceSpecification: { '@type': 'PriceSpecification', minPrice: price, priceCurrency: lang === 'uk' ? 'UAH' : 'EUR' } } } : {}),
          },
        };
      }),
    }],
  };
  return shell({
    lang, title: x.svc_meta_title, desc: x.svc_meta_desc, canonical: url,
    enUrl: BASE + svcPath('en'), ukUrl: BASE + svcPath('uk'), ld, ogImage: 'bedroom_2_fin.webp',
    swEn: svcPath('en'), swUk: svcPath('uk'), main, chunks, cta: [x.svc_cta1, x.svc_cta2],
  });
}

/* tiny, safe text format for blog bodies: paragraphs, "## heading", "- list", **bold**, [text](https://...) */
function inline(s) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)\s]+)\)/g, (_m, a, b) => `<a href="${b.replace(/"/g, '%22')}">${a}</a>`);
}

function renderBody(text) {
  const blocks = String(text || '').replace(/\r\n/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((b) => {
    if (/^##\s+/.test(b)) return `<h2>${inline(b.replace(/^##\s+/, ''))}</h2>`;
    if (b.split('\n').every((l) => /^-\s+/.test(l))) return `<ul>${b.split('\n').map((l) => `<li>${inline(l.replace(/^-\s+/, ''))}</li>`).join('')}</ul>`;
    return `<p>${inline(b).replace(/\n/g, '<br>')}</p>`;
  }).join('\n      ');
}

function buildBlogIndex(data, lang, chunks, posts) {
  const x = X[lang];
  const root = lang === 'uk' ? '/ua' : '';
  const url = BASE + blogPath(lang);
  const cards = posts.map((p) => {
    const cover = (p.files || [])[0];
    const title = pick(p, lang, 'title');
    return `      <li class="post_card"><a href="${postPath(p, lang)}">
        ${cover ? `<img src="/images/${esc(cover)}" alt="${esc(title)}" ${dims(data, cover)}loading="lazy" decoding="async">` : ''}
        <time datetime="${esc(p.date)}">${esc(fmtDate(p.date, lang))}</time>
        <h2>${esc(title)}</h2>
        <p>${esc(metaDesc(pick(p, lang, 'lead')))}</p>
        <span class="project_link">${x.read}</span>
      </a></li>`;
  }).join('\n');
  const main = `    <main class="project page_blog">
      <p class="crumbs"><a href="${root}/">${T[lang].home}</a><span>/</span>${x.blog}</p>
      <p class="eyebrow">${x.blog_eyebrow}</p>
      <h1 class="project_title">${x.blog_h1}</h1>
      <p class="project_lead">${x.blog_lead}</p>
${posts.length ? `      <ul class="post_list">\n${cards}\n      </ul>` : `      <p class="project_lead">${x.blog_empty}</p>`}
    </main>`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [orgLd(), crumbsLd(lang, [[x.blog, url]]), { '@type': 'Blog', name: `WhiteLakeViz ${x.blog}`, url, inLanguage: lang, publisher: { '@id': `${BASE}/#organization` } }],
  };
  const firstCover = posts.map((p) => (p.files || [])[0]).find(Boolean);
  return shell({
    lang, title: x.blog_meta_title, desc: x.blog_meta_desc, canonical: url,
    enUrl: BASE + blogPath('en'), ukUrl: BASE + blogPath('uk'), ld, ogImage: firstCover || 'bedroom_2_fin.webp',
    swEn: blogPath('en'), swUk: blogPath('uk'), main, chunks, cta: [x.post_cta1, x.post_cta2],
    robots: posts.length ? undefined : 'noindex, follow',
  });
}

function buildPost(data, p, lang, chunks) {
  const x = X[lang];
  const root = lang === 'uk' ? '/ua' : '';
  const url = BASE + postPath(p, lang);
  const title = pick(p, lang, 'title');
  const lead = pick(p, lang, 'lead');
  const body = pick(p, lang, 'body');
  const files = p.files || [];
  const fig = (f, n) => `<figure><img src="/images/${esc(f)}" alt="${esc(title)}${n ? ` (${n + 1})` : ''}" ${dims(data, f)}${n ? 'loading="lazy" decoding="async"' : 'loading="eager" fetchpriority="high"'}></figure>`;
  const rest = files.slice(1).map((f, i) => fig(f, i + 1));
  const main = `    <main class="project page_post">
      <p class="crumbs"><a href="${root}/">${T[lang].home}</a><span>/</span><a href="${blogPath(lang)}">${x.blog}</a><span>/</span>${esc(title)}</p>
      <p class="eyebrow"><time datetime="${esc(p.date)}">${esc(fmtDate(p.date, lang))}</time></p>
      <h1 class="project_title">${esc(title)}</h1>
      ${String(lead).split(/\n{2,}/).map((s) => s.trim()).filter(Boolean).map((s) => `<p class="project_lead">${esc(s)}</p>`).join('\n      ')}
${files[0] ? `      <div class="post_cover">${fig(files[0], 0)}</div>\n` : ''}      <div class="post_body">
      ${renderBody(body)}
      </div>
${rest.length ? `      <div class="project_frames img_container post_images">\n        ${rest.join('\n        ')}\n      </div>\n` : ''}      <nav class="project_nav" aria-label="${esc(x.all_posts)}">
        <a href="${blogPath(lang)}">&larr; ${esc(x.all_posts)}</a>
      </nav>
    </main>`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [orgLd(), crumbsLd(lang, [[x.blog, BASE + blogPath(lang)], [title, url]]), {
      '@type': 'BlogPosting', '@id': `${url}#post`, headline: title, description: metaDesc(lead || body), url,
      inLanguage: lang, datePublished: p.date, dateModified: p.updated || p.date,
      author: { '@id': `${BASE}/#organization` }, publisher: { '@id': `${BASE}/#organization` },
      mainEntityOfPage: url, ...(files[0] ? { image: `${BASE}/images/${files[0]}` } : {}),
    }],
  };
  return shell({
    lang, title: `${title} | WhiteLakeViz`, desc: metaDesc(lead || body), canonical: url,
    enUrl: BASE + postPath(p, 'en'), ukUrl: BASE + postPath(p, 'uk'), ld, ogImage: files[0] || 'bedroom_2_fin.webp', ogType: 'article',
    swEn: postPath(p, 'en'), swUk: postPath(p, 'uk'), main, chunks, cta: [x.post_cta1, x.post_cta2],
  });
}

/* ------------------------------------------------------------------ shop */

function moneyOf(p, lang) {
  const raw = lang === 'uk' ? p.uah : p.eur;
  const n = Number(String(raw ?? '').replace(/\s/g, '').replace(',', '.'));
  return raw !== '' && raw != null && isFinite(n) && n > 0 ? n : null;
}

function fmtMoney(n, lang) {
  const num = n.toLocaleString(lang === 'uk' ? 'uk-UA' : 'en-US', { maximumFractionDigits: 2 });
  return lang === 'uk' ? `${num} грн` : `€${num}`;
}

const stLabel = (p, lang) => X[lang]['st_' + p.status] || '';
const btnLabel = (p, lang) => {
  if (p[lang] && p[lang].button) return p[lang].button;
  const store = p.status === 'link' ? storeName(p.url) : '';
  if (store) return (lang === 'uk' ? 'Отримати на ' : 'Get on ') + store;
  return X[lang]['btn_' + p.status] || '';
};
/* Google Drive share link of a single file -> direct download link; everything else is used as typed */
export function downloadUrl(u) {
  const m = String(u || '').match(/^https?:\/\/(?:drive|docs)\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]{10,})/i);
  return m ? `https://drive.google.com/uc?export=download&id=${m[1]}` : String(u || '');
}

const STORES = { 'cgtrader.com': 'CGTrader', 'gumroad.com': 'Gumroad', 'artstation.com': 'ArtStation', 'payhip.com': 'Payhip', 'itch.io': 'itch.io', 'sellfy.com': 'Sellfy', 'boosty.to': 'Boosty', 'patreon.com': 'Patreon', 'turbosquid.com': 'TurboSquid', 'fab.com': 'Fab', '3ddd.ru': '3ddd', 'greatcatalog.net': 'The Great Catalog' };
function storeName(u) {
  try {
    const host = new URL(u).hostname.toLowerCase().replace(/^www\./, '');
    const key = Object.keys(STORES).find((k) => host === k || host.endsWith('.' + k));
    return key ? STORES[key] : '';
  } catch { return ''; }
}
const extHref = (p) => esc(p.status === 'free' ? downloadUrl(p.url) : p.url);

function shopPrice(p, lang) {
  if (p.status === 'free') return X[lang].st_free;
  if (p.status === 'soon') return '';
  const n = moneyOf(p, lang);
  return n ? fmtMoney(n, lang) : '';
}

function actionHtml(p, lang, cls = 'btn') {
  if (p.status === 'soon') return `<span class="shop_soon">${esc(X[lang].btn_soon)}</span>`;
  return `<a class="${cls}" href="${extHref(p)}" target="_blank" rel="noopener noreferrer nofollow">${esc(btnLabel(p, lang))}</a>`;
}

const csv = (s, max = 30) => String(s || '').split(/[,;\n]/).map((t) => t.trim().slice(0, 40)).filter(Boolean).slice(0, max);

const SVG = (inner) => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICON = {
  software: SVG('<path d="M8 1.5 14 4.7v6.6L8 14.5 2 11.3V4.7z"/><path d="M2 4.7 8 8l6-3.3M8 8v6.5"/>'),
  specs: SVG('<path d="M2 11 11 2l3 3-9 9z"/><path d="M5 8l1.5 1.5M7 6l1.5 1.5M9 4l1.5 1.5"/>'),
  license: SVG('<path d="M8 1.5 13.5 3.5v4c0 3.2-2.3 5.6-5.5 7-3.2-1.4-5.5-3.8-5.5-7v-4z"/>'),
  search: SVG('<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/>'),
  close: SVG('<path d="M3 3l10 10M13 3 3 13"/>'),
  prev: SVG('<path d="M10 3 5 8l5 5"/>'),
  next: SVG('<path d="M6 3l5 5-5 5"/>'),
};

function metaOf(p, lang) {
  return {
    kind: pick(p, lang, 'kind'), software: String(p.software || '').trim(), specs: pick(p, lang, 'specs'),
    license: pick(p, lang, 'license'), tags: csv(pick(p, lang, 'tags')), formats: csv(p.formats),
  };
}

/* meta rows + tags + formats: used on the set page (the pop-up fills the same structure from JSON) */
function metaHtml(m, x) {
  const rows = ['software', 'specs', 'license'].filter((k) => m[k]).map((k) => `<li>${ICON[k]}<span>${esc(m[k])}</span></li>`).join('');
  const group = (h, arr) => (arr.length ? `<div class="set_group"><p class="set_h">${h}</p><ul class="set_tags">${arr.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : '');
  return `${rows ? `<ul class="set_meta">${rows}</ul>` : ''}${group(x.tags_h, m.tags)}${group(x.formats_h, m.formats)}`;
}

/* everything the pop-up needs for one set, in the page language */
function modalData(data, p, lang) {
  const m = metaOf(p, lang);
  return {
    slug: p.slug, status: p.status, statusLabel: stLabel(p, lang), href: itemPath(p, lang),
    title: pick(p, lang, 'title'), lead: pick(p, lang, 'lead'),
    kind: m.kind, software: m.software, specs: m.specs, license: m.license, tags: m.tags, formats: m.formats,
    price: p.status === 'link' ? shopPrice(p, lang) : '',
    url: p.status === 'soon' ? '' : (p.status === 'free' ? downloadUrl(p.url) : p.url),
    button: p.status === 'soon' ? X[lang].btn_soon : btnLabel(p, lang),
    images: (p.files || []).map((f) => { const s = data.sizes && data.sizes[f]; return { src: `/images/${f}`, w: s ? s[0] : 0, h: s ? s[1] : 0 }; }),
  };
}

const jsonForScript = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028').replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029');

const SHOP_JS = String.raw`(function () {
  var dataEl = document.getElementById('shop-data');
  var list = document.querySelector('.shop_list');
  if (!dataEl || !list) return;
  var items = JSON.parse(dataEl.textContent), by = {};
  items.forEach(function (it) { by[it.slug] = it; });
  var cards = [].slice.call(list.querySelectorAll('.shop_card'));
  var q = document.getElementById('shop-q'), none = document.getElementById('shop-none');
  var chips = [].slice.call(document.querySelectorAll('.shop_filters button'));
  var filter = 'all';
  function apply() {
    var s = q ? q.value.trim().toLowerCase() : '', n = 0;
    cards.forEach(function (c) {
      var ok = (filter === 'all' || c.getAttribute('data-status') === filter) && (!s || c.getAttribute('data-search').indexOf(s) > -1);
      c.hidden = !ok; if (ok) n++;
    });
    if (none) none.hidden = n > 0;
  }
  chips.forEach(function (b) {
    b.addEventListener('click', function () {
      filter = b.getAttribute('data-f');
      chips.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      apply();
    });
  });
  if (q) q.addEventListener('input', apply);

  var dlg = document.getElementById('shop-modal');
  if (!dlg || typeof dlg.showModal !== 'function') return;
  function $(s) { return dlg.querySelector(s); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var cur = null;

  function setImage(it, i) {
    var stage = $('.sm_stage'), im = it.images[i];
    stage.textContent = '';
    if (!im) { stage.appendChild(el('span', 'sm_ph')); return; }
    var img = el('img'); img.src = im.src; img.alt = it.title + (i ? ' (' + (i + 1) + ')' : '');
    if (im.w && im.h) { img.width = im.w; img.height = im.h; }
    stage.appendChild(img);
    [].forEach.call($('.sm_thumbs').children, function (t, k) { t.setAttribute('aria-current', k === i ? 'true' : 'false'); });
  }
  function fillTags(sel, arr) {
    var ul = $(sel); ul.textContent = '';
    arr.forEach(function (t) { ul.appendChild(el('li', null, t)); });
    ul.parentNode.hidden = !arr.length;
  }
  function show(it) {
    cur = it;
    dlg.setAttribute('data-status', it.status);
    $('.sm_kind').textContent = it.kind; $('.sm_kind').hidden = !it.kind;
    $('.sm_title').textContent = it.title;
    $('.sm_state').textContent = it.statusLabel;
    var lead = $('.sm_lead'); lead.textContent = '';
    String(it.lead || '').split(/\n{2,}/).forEach(function (t) { t = t.trim(); if (t) lead.appendChild(el('p', null, t)); });
    ['software', 'specs', 'license'].forEach(function (k) {
      var li = $('[data-k="' + k + '"]'); li.querySelector('span').textContent = it[k]; li.hidden = !it[k];
    });
    $('.sm_meta').hidden = !(it.software || it.specs || it.license);
    fillTags('.sm_tags', it.tags); fillTags('.sm_formats', it.formats);
    var th = $('.sm_thumbs'); th.textContent = '';
    if (it.images.length > 1) {
      it.images.forEach(function (im, i) {
        var b = el('button'); b.type = 'button'; b.setAttribute('aria-label', String(i + 1));
        var t = el('img'); t.src = im.src; t.alt = ''; t.loading = 'lazy'; b.appendChild(t);
        b.addEventListener('click', function () { setImage(it, i); });
        th.appendChild(b);
      });
    }
    th.hidden = it.images.length < 2;
    setImage(it, 0);
    var a = $('.sm_cta'), soon = $('.sm_soon');
    a.hidden = !it.url; soon.hidden = !!it.url;
    if (it.url) { a.href = it.url; a.textContent = it.button; } else { soon.textContent = it.button; }
    $('.sm_price').textContent = it.price; $('.sm_price').hidden = !it.price;
    $('.sm_body').scrollTop = 0;
  }
  function open(slug) {
    var it = by[slug]; if (!it) return;
    show(it);
    if (!dlg.open) { dlg.showModal(); document.documentElement.classList.add('has_modal'); }
    try { history.replaceState(null, '', '#' + it.slug); } catch (e) {}
  }
  function step(d) {
    var vis = cards.filter(function (c) { return !c.hidden; });
    var i = vis.map(function (c) { return c.getAttribute('data-slug'); }).indexOf(cur && cur.slug);
    if (vis.length > 1 && i > -1) open(vis[(i + d + vis.length) % vis.length].getAttribute('data-slug'));
  }
  list.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest('a.shop_open'); if (!a) return;
    e.preventDefault(); open(a.closest('.shop_card').getAttribute('data-slug'));
  });
  $('.sm_close').addEventListener('click', function () { dlg.close(); });
  $('.sm_prev').addEventListener('click', function () { step(-1); });
  $('.sm_next').addEventListener('click', function () { step(1); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  });
  dlg.addEventListener('close', function () {
    document.documentElement.classList.remove('has_modal');
    if (location.hash) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
  });
  function fromHash() {
    var h = decodeURIComponent(location.hash.slice(1));
    if (h && by[h]) open(h); else if (!h && dlg.open) dlg.close();
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();`;

function modalShell(x) {
  const row = (k) => `<li data-k="${k}" hidden>${ICON[k]}<span></span></li>`;
  return `      <dialog class="shop_modal" id="shop-modal" aria-labelledby="sm-title">
        <div class="sm_wrap">
          <button type="button" class="sm_close" aria-label="${esc(x.close)}">${ICON.close}</button>
          <div class="sm_media">
            <div class="sm_stage"></div>
            <button type="button" class="sm_nav sm_prev" aria-label="${esc(x.prev)}">${ICON.prev}</button>
            <button type="button" class="sm_nav sm_next" aria-label="${esc(x.next)}">${ICON.next}</button>
            <div class="sm_thumbs" hidden></div>
          </div>
          <div class="sm_body">
            <p class="sm_kind" hidden></p>
            <p class="sm_title" id="sm-title" role="heading" aria-level="2"></p>
            <p class="sm_status"><span class="sm_state"></span></p>
            <div class="sm_lead"></div>
            <ul class="set_meta sm_meta" hidden>${row('software')}${row('specs')}${row('license')}</ul>
            <div class="set_group" hidden><p class="set_h">${x.tags_h}</p><ul class="set_tags sm_tags"></ul></div>
            <div class="set_group" hidden><p class="set_h">${x.formats_h}</p><ul class="set_tags sm_formats"></ul></div>
            <div class="sm_buy">
              <span class="sm_price" hidden></span>
              <a class="sm_cta" target="_blank" rel="noopener noreferrer nofollow" hidden></a>
              <span class="sm_soon" hidden></span>
            </div>
          </div>
        </div>
      </dialog>`;
}

function buildShopIndex(data, lang, chunks, items) {
  const x = X[lang];
  const root = lang === 'uk' ? '/ua' : '';
  const url = BASE + shopPath(lang);
  const cards = items.map((p, i) => {
    const cover = (p.files || [])[0];
    const title = pick(p, lang, 'title');
    const m = metaOf(p, lang);
    const media = cover
      ? `<img src="/images/${esc(cover)}" alt="" ${dims(data, cover)}${i < 5 ? 'loading="eager"' : 'loading="lazy" decoding="async"'}>`
      : '<span class="shop_ph" aria-hidden="true"></span>';
    const price = p.status === 'free' ? x.st_free : p.status === 'soon' ? x.st_soon : shopPrice(p, lang);
    const search = [title, m.kind, m.software, ...m.tags, ...m.formats].join(' ').toLowerCase();
    return `        <li class="shop_card is_${p.status}" data-slug="${esc(p.slug)}" data-status="${p.status}" data-search="${esc(search)}">
          <a class="shop_media shop_open" href="${itemPath(p, lang)}" tabindex="-1" aria-hidden="true">${media}</a>
          <p class="shop_name"><a class="shop_open" href="${itemPath(p, lang)}">${esc(title)}</a></p>
          <p class="shop_sub"><span>${esc(m.kind || stLabel(p, lang))}</span>${price ? `<span class="shop_pr">${esc(price)}</span>` : ''}</p>
        </li>`;
  }).join('\n');
  const present = ['free', 'link', 'soon'].filter((s) => items.some((p) => p.status === s));
  const filters = items.length > 1 && present.length > 1
    ? `<div class="shop_filters" role="group" aria-label="${esc(x.shop)}">
          <button type="button" data-f="all" aria-pressed="true">${x.f_all}<span>${items.length}</span></button>
${present.map((s) => `          <button type="button" data-f="${s}" aria-pressed="false">${x['f_' + s]}<span>${items.filter((p) => p.status === s).length}</span></button>`).join('\n')}
        </div>` : '';
  const search = items.length >= 6
    ? `<label class="shop_search">${ICON.search}<input id="shop-q" type="search" placeholder="${esc(x.search_ph)}" aria-label="${esc(x.search_ph)}" autocomplete="off"></label>` : '';
  const bar = search || filters ? `      <div class="shop_bar">\n        ${search}\n        ${filters}\n      </div>\n` : '';
  const main = `    <main class="project page_shop">
      <p class="crumbs"><a href="${root}/">${T[lang].home}</a><span>/</span>${x.shop}</p>
      <h1 class="project_title">${x.shop_h1}</h1>
      <p class="project_lead">${x.shop_lead}</p>
${items.length ? `${bar}      <p class="shop_none" id="shop-none" hidden>${x.f_none}</p>
      <ul class="shop_list">
${cards}
      </ul>
${modalShell(x)}
      <script type="application/json" id="shop-data">${jsonForScript(items.map((p) => modalData(data, p, lang)))}</script>
      <script>${SHOP_JS}</script>
` : `      <p class="project_lead">${x.shop_empty}</p>
`}    </main>`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [orgLd(), crumbsLd(lang, [[x.shop, url]]), {
      '@type': 'CollectionPage', name: x.shop_h1, url, inLanguage: lang, publisher: { '@id': `${BASE}/#organization` },
    }],
  };
  const firstCover = items.map((p) => (p.files || [])[0]).find(Boolean);
  return shell({
    lang, title: x.shop_meta_title, desc: x.shop_meta_desc, canonical: url,
    enUrl: BASE + shopPath('en'), ukUrl: BASE + shopPath('uk'), ld, ogImage: firstCover || 'bedroom_2_fin.webp',
    swEn: shopPath('en'), swUk: shopPath('uk'), main, chunks, cta: [x.shop_cta1, x.shop_cta2],
    robots: items.length ? undefined : 'noindex, follow',
  });
}

function buildShopItem(data, p, lang, chunks) {
  const x = X[lang];
  const root = lang === 'uk' ? '/ua' : '';
  const url = BASE + itemPath(p, lang);
  const title = pick(p, lang, 'title');
  const lead = pick(p, lang, 'lead');
  const body = pick(p, lang, 'body');
  const files = p.files || [];
  const price = shopPrice(p, lang);
  const m = metaOf(p, lang);
  const fig = (f, n) => `<figure><img src="/images/${esc(f)}" alt="${esc(title)}${n ? ` (${n + 1})` : ''}" ${dims(data, f)}${n ? 'loading="lazy" decoding="async"' : 'loading="eager" fetchpriority="high"'}></figure>`;
  const rest = files.slice(1).map((f, i) => fig(f, i + 1));
  const leadHtml = String(lead).split(/\n{2,}/).map((s) => s.trim()).filter(Boolean).map((s) => `<p class="project_lead">${esc(s)}</p>`).join('\n        ');
  const main = `    <main class="project page_item is_${p.status}">
      <p class="crumbs"><a href="${root}/">${T[lang].home}</a><span>/</span><a href="${shopPath(lang)}">${x.shop}</a><span>/</span>${esc(title)}</p>
      <div class="item_top${files[0] ? '' : ' no_cover'}">
        <div class="item_info">
          <p class="shop_status">${esc(m.kind ? `${m.kind} · ${stLabel(p, lang)}` : stLabel(p, lang))}</p>
          <h1 class="project_title">${esc(title)}</h1>
        ${leadHtml}
          ${metaHtml(m, x)}
          <div class="shop_buy">
            ${price && p.status === 'link' ? `<span class="shop_price">${esc(price)}</span>` : ''}
            ${actionHtml(p, lang)}
          </div>
        </div>
${files[0] ? `        <div class="item_cover">${fig(files[0], 0)}</div>\n` : ''}      </div>
${body ? `      <div class="post_body">\n      ${renderBody(body)}\n      </div>\n` : ''}${rest.length ? `      <div class="project_frames img_container post_images">\n        ${rest.join('\n        ')}\n      </div>\n` : ''}      <nav class="project_nav" aria-label="${esc(x.all_items)}">
        <a href="${shopPath(lang)}">&larr; ${esc(x.all_items)}</a>
      </nav>
    </main>`;
  const cur = lang === 'uk' ? 'UAH' : 'EUR';
  const amount = p.status === 'free' ? 0 : moneyOf(p, lang);
  const product = {
    '@type': 'Product', '@id': `${url}#product`, name: title, description: metaDesc(lead || body), url, inLanguage: lang,
    brand: { '@id': `${BASE}/#organization` },
    ...(files[0] ? { image: `${BASE}/images/${files[0]}` } : {}),
    ...(m.kind ? { category: m.kind } : {}),
    ...(p.status !== 'soon' && amount != null ? { offers: { '@type': 'Offer', price: amount, priceCurrency: cur, url: p.status === 'free' ? downloadUrl(p.url) : p.url, availability: 'https://schema.org/InStock' } } : {}),
  };
  const ld = { '@context': 'https://schema.org', '@graph': [orgLd(), crumbsLd(lang, [[x.shop, BASE + shopPath(lang)], [title, url]]), product] };
  return shell({
    lang, title: `${title} | WhiteLakeViz`, desc: metaDesc(lead || body), canonical: url,
    enUrl: BASE + itemPath(p, 'en'), ukUrl: BASE + itemPath(p, 'uk'), ld, ogImage: files[0] || 'bedroom_2_fin.webp',
    swEn: itemPath(p, 'en'), swUk: itemPath(p, 'uk'), main, chunks, cta: [x.shop_cta1, x.shop_cta2],
  });
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
  const posts = livePosts(data);
  const shopItems = liveShop(data);
  NAV_FLAGS = { services: servicesOn(data), blog: posts.length > 0, shop: shopItems.length > 0 };

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
    let text = replaceRegion(lf(raw), kind, inner, rel);
    text = text.replace(/(<!-- nav:extra:start -->)[\s\S]*?(<!-- nav:extra:end -->)/g, (_m, a, b) => `${a}${extraNav(lang) ? '\n    ' + extraNav(lang) + '\n    ' : ''}${b}`);
    out[rel] = withEol(text, crlf);
  }

  const extra = [];
  const last = list.reduce((m, p) => (p.updated && p.updated > m ? p.updated : m), '2026-11-01');
  if (NAV_FLAGS.services) {
    for (const lang of ['en', 'uk']) { const path = svcPath(lang).slice(1); out[path] = buildServices(data, lang, chunks[lang]); generated.add(path); }
    extra.push([{ en: svcPath('en'), uk: svcPath('uk') }, (data.services.updated || last)]);
  }
  for (const lang of ['en', 'uk']) {
    const path = blogPath(lang).slice(1);
    out[path] = buildBlogIndex(data, lang, chunks[lang], posts); generated.add(path);
    for (const p of posts) { const pp = postPath(p, lang).slice(1); out[pp] = buildPost(data, p, lang, chunks[lang]); generated.add(pp); }
  }
  if (posts.length) {
    const newest = posts[0].updated || posts[0].date;
    extra.push([{ en: blogPath('en'), uk: blogPath('uk') }, newest]);
    for (const p of posts) extra.push([{ en: postPath(p, 'en'), uk: postPath(p, 'uk') }, p.updated || p.date]);
  }
  for (const lang of ['en', 'uk']) {
    const path = shopPath(lang).slice(1);
    out[path] = buildShopIndex(data, lang, chunks[lang], shopItems); generated.add(path);
    for (const p of shopItems) { const ip = itemPath(p, lang).slice(1); out[ip] = buildShopItem(data, p, lang, chunks[lang]); generated.add(ip); }
  }
  if (shopItems.length) {
    extra.push([{ en: shopPath('en'), uk: shopPath('uk') }, shopItems[0].updated || shopItems[0].date]);
    for (const p of shopItems) extra.push([{ en: itemPath(p, 'en'), uk: itemPath(p, 'uk') }, p.updated || p.date]);
  }
  out['sitemap.xml'] = sitemap(data, list, extra);
  return { out, generated };
}
