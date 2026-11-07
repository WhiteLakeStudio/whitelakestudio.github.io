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
  for (const k of ['home', 'gallery']) {
    for (const s of (data.order && data.order[k]) || []) {
      if (!slugs.has(s)) errors.push(`порядок «${k}»: невідомий проєкт «${s}»`);
    }
  }
  return errors;
}

/* ------------------------------------------- services, blog, shared page shell */

let NAV_FLAGS = { services: false, blog: false };

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
  },
};

const servicesOn = (data) => !!(data.services && (data.services.items || []).some((s) => s.active !== false));
const livePosts = (data) => (data.posts || []).filter((p) => p.published !== false && p.slug)
  .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

const svcPath = (lang) => (lang === 'uk' ? '/ua/services.html' : '/services.html');
const blogPath = (lang) => (lang === 'uk' ? '/ua/blog.html' : '/blog.html');
const postPath = (p, lang) => `${lang === 'uk' ? '/ua' : ''}/blog/${p.slug}.html`;

function extraNav(lang) {
  const x = X[lang];
  const li = [];
  if (NAV_FLAGS.services) li.push(`<li><a href="${svcPath(lang)}">${x.services}</a></li>`);
  if (NAV_FLAGS.blog) li.push(`<li><a href="${blogPath(lang)}">${x.blog}</a></li>`);
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
  NAV_FLAGS = { services: servicesOn(data), blog: posts.length > 0 };

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
  out['sitemap.xml'] = sitemap(data, list, extra);
  return { out, generated };
}
