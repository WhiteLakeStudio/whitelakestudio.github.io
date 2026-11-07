/* WhiteLakeViz admin: edits data/projects.json + images through the GitHub API
   and regenerates every page in the browser (see build.js). No server needed. */
import { buildSite, validate, slugify, CATEGORIES, CATEGORY_LABELS } from './build.js';

const DEFAULT_REPO = 'whitelakestudio/whitelakestudio.github.io';
const BRANCH = 'main';
const TOKEN_KEY = 'wl_admin_token';   // old plain-text storage: only ever deleted now
const VAULT_KEY = 'wl_admin_vault';   // token encrypted with the owner's password
const PBKDF2_ITER = 600000;
const IDLE_LOCK_MS = 15 * 60 * 1000;
const REPO_KEY = 'wl_admin_repo';
const PAGES = ['index.html', 'ua/index.html', 'gallery.html', 'ua/gallery.html'];
const MAX_WIDTH = 2400;
const WEBP_QUALITY = 0.86;

const app = document.getElementById('app');
const msgBox = document.getElementById('msg');
const logoutBtn = document.getElementById('logout');

const state = {
  token: '', repo: DEFAULT_REPO,
  head: '', treeSha: '',
  data: null, baseJson: '',
  thumbs: new Map(),    // file name -> blob URL of just-published images (the site needs 1–2 min to show them)
  pending: new Map(),   // file name -> { blob, w, h }   (images waiting for publish)
  removed: new Set(),   // repo image files to delete on publish
  tab: 'home',
  draft: null, isNew: false, busy: false,
};

/* ------------------------------------------------------------------ utils */

const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const today = () => new Date().toISOString().slice(0, 10);
let uid = 0;

function toast(text, kind = '', ms = 6000) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  msgBox.appendChild(el);
  if (ms) setTimeout(() => el.remove(), ms);
  return el;
}

function isDirty() {
  return !!state.data && (JSON.stringify(state.data) !== state.baseJson || state.pending.size > 0 || state.removed.size > 0);
}

window.addEventListener('beforeunload', (e) => {
  if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
});

const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));

async function deriveKey(pass, salt, iter) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function sealToken(token, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt, PBKDF2_ITER);
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token)));
  return JSON.stringify({ v: 1, i: PBKDF2_ITER, s: b64(salt), n: b64(iv), c: b64(c) });
}

async function openToken(vault, pass) {
  const v = JSON.parse(vault);
  const key = await deriveKey(pass, unb64(v.s), v.i);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(v.n) }, key, unb64(v.c));
  return new TextDecoder().decode(plain);
}

const hasVault = () => !!localStorage.getItem(VAULT_KEY);

async function api(path, { method = 'GET', body, raw = false } = {}) {
  const res = await fetch('https://api.github.com' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + state.token,
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch { /* not json */ }
    const hints = {
      401: 'Токен не підійшов або втратив чинність. Створіть новий.',
      403: 'Немає прав. У токена має бути доступ «Contents: Read and write» до цього репозиторію.',
      404: 'Репозиторій або файл не знайдено (або токен не має доступу до цього репозиторію).',
      409: 'Конфлікт: репозиторій змінився. Оновіть сторінку й повторіть.',
      422: 'GitHub відхилив запит.',
    };
    const e = new Error(`GitHub ${res.status}. ${hints[res.status] || ''} ${detail}`.trim());
    e.status = res.status;
    throw e;
  }
  return raw ? res.text() : res.json();
}

const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/* ---------------------------------------------------------------- images */

async function toWebp(file) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error(`«${file.name}»: не вдалося прочитати зображення (підтримуються JPG, PNG, WebP).`); }
  let w = bmp.width, h = bmp.height;
  if (file.type === 'image/webp' && w <= MAX_WIDTH) { bmp.close?.(); return { blob: file, w, h }; }
  const k = Math.min(1, MAX_WIDTH / w);
  w = Math.round(w * k); h = Math.round(h * k);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', WEBP_QUALITY));
  if (!blob || blob.type !== 'image/webp') throw new Error('Цей браузер не вміє зберігати WebP. Скористайтесь Chrome, Edge або Firefox.');
  return { blob, w, h };
}

const kb = (n) => (n / 1024 >= 1024 ? (n / 1048576).toFixed(1) + ' МБ' : Math.round(n / 1024) + ' КБ');

/* ------------------------------------------------------------------ login */

function renderLogin(error = '') {
  logoutBtn.hidden = true;
  app.innerHTML = `
  <section class="card narrow">
    <h1>Вхід в адмінку</h1>
    <p class="muted">Вставте особистий токен GitHub. Він нікуди, крім GitHub, не надсилається. Щоб не вводити його щоразу, збережіть його на цьому пристрої: він буде зашифрований вашим паролем.</p>
    ${error ? `<p class="err">${h(error)}</p>` : ''}
    <label for="token">Токен GitHub</label>
    <input id="token" type="password" autocomplete="off" placeholder="github_pat_…">
    <label class="check"><input id="remember" type="checkbox" checked> Зберегти на цьому пристрої (зашифровано паролем)</label>
    <div id="pass-box">
      <label for="pass">Пароль адмінки (від 10 символів)</label>
      <input id="pass" type="password" autocomplete="new-password">
      <label for="pass2">Повторіть пароль</label>
      <input id="pass2" type="password" autocomplete="new-password">
      <div class="hint">Цей пароль не відновлюється: якщо забудете, просто створіть новий токен і задайте новий пароль.</div>
    </div>
    <details><summary>Додатково</summary>
      <label for="repo">Репозиторій</label>
      <input id="repo" type="text" value="${h(state.repo)}">
    </details>
    <p><button id="login" class="primary">Увійти</button></p>
    <details><summary>Як отримати токен (один раз)</summary>
      <ol>
        <li>GitHub → ваш аватар → <b>Settings</b> → <b>Developer settings</b> → <b>Personal access tokens</b> → <b>Fine-grained tokens</b> → <b>Generate new token</b>.</li>
        <li>Назва: <code>whitelake-admin</code>. Термін дії: наприклад, 90 днів.</li>
        <li><b>Repository access</b> → <i>Only select repositories</i> → оберіть <code>${h(state.repo.split('/')[1] || '')}</code>.</li>
        <li><b>Permissions</b> → <b>Repository permissions</b> → <b>Contents</b> → <i>Read and write</i>.</li>
        <li><b>Generate token</b>, скопіюйте його й вставте сюди.</li>
      </ol>
      <p class="hint">Не вводьте токен на чужих комп'ютерах. Якщо токен загубився, просто видаліть його на GitHub і створіть новий.</p>
    </details>
  </section>`;
}

async function doLogin() {
  const token = document.getElementById('token').value.trim();
  const repo = document.getElementById('repo').value.trim() || DEFAULT_REPO;
  const remember = document.getElementById('remember').checked;
  const pass = document.getElementById('pass').value;
  if (!token) return toast('Вставте токен.', 'error');
  if (remember) {
    if (pass.length < 10) return toast('Пароль має містити щонайменше 10 символів.', 'error');
    if (pass !== document.getElementById('pass2').value) return toast('Паролі не збігаються.', 'error');
  }
  state.token = token; state.repo = repo;
  try {
    const info = await api(`/repos/${repo}`);
    if (!info.permissions || !info.permissions.push) throw new Error('Токен має доступ тільки для читання. Потрібне «Contents: Read and write».');
    localStorage.setItem(REPO_KEY, repo);
    if (remember) localStorage.setItem(VAULT_KEY, await sealToken(token, pass));
    else localStorage.removeItem(VAULT_KEY);
    await loadRepo();
  } catch (e) {
    state.token = '';
    renderLogin(e.message);
  }
}

function renderUnlock(error = '') {
  logoutBtn.hidden = true;
  app.innerHTML = `
  <section class="card narrow">
    <h1>Адмінка заблокована</h1>
    <p class="muted">Введіть пароль адмінки.</p>
    ${error ? `<p class="err">${h(error)}</p>` : ''}
    <label for="unlock-pass">Пароль</label>
    <input id="unlock-pass" type="password" autocomplete="current-password">
    <p><button id="unlock" class="primary">Розблокувати</button></p>
    <p class="hint"><button id="forget" class="link" type="button">Забути цей пристрій і ввести токен заново</button></p>
  </section>`;
  document.getElementById('unlock-pass').focus();
}

async function doUnlock() {
  const pass = document.getElementById('unlock-pass').value;
  if (!pass) return;
  const btn = document.getElementById('unlock'); btn.disabled = true; btn.textContent = 'Перевіряю…';
  let token;
  try { token = await openToken(localStorage.getItem(VAULT_KEY), pass); }
  catch { return renderUnlock('Невірний пароль.'); }
  state.token = token;
  try { await loadRepo(); } catch (e) { state.token = ''; renderUnlock(e.message); }
}

function lock() {
  state.token = ''; state.data = null; state.draft = null; state.pending.clear(); state.removed.clear(); state.thumbs.clear();
  state.baseJson = '';
  if (hasVault()) renderUnlock(); else renderLogin();
}

function logout() {
  if (isDirty() && !confirm('Є неопубліковані зміни. Вийти без публікації?')) return;
  lock();
}

let idleTimer;
function armIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (state.token && !isDirty() && !state.busy) lock(); else armIdle(); }, IDLE_LOCK_MS);
}
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, armIdle, { passive: true });

/* ------------------------------------------------------------- repo load */

async function loadRepo() {
  app.innerHTML = '<p class="muted center">Завантажую проєкти з GitHub…</p>';
  const ref = await api(`/repos/${state.repo}/git/ref/heads/${BRANCH}`);
  state.head = ref.object.sha;
  const commit = await api(`/repos/${state.repo}/git/commits/${state.head}`);
  state.treeSha = commit.tree.sha;
  const text = await api(`/repos/${state.repo}/contents/data/projects.json?ref=${state.head}`, { raw: true });
  state.data = JSON.parse(text);
  state.data.sizes = state.data.sizes || {};
  state.data.order = state.data.order || { home: [], gallery: [] };
  state.baseJson = JSON.stringify(state.data);
  state.pending.clear(); state.removed.clear();
  logoutBtn.hidden = false;
  renderList();
}

/* ------------------------------------------------------------------ list */

const byTitle = (p) => (p.uk && p.uk.title) || (p.en && p.en.title) || p.slug;

function thumbOf(p) {
  const f = p.files && p.files[0];
  if (!f) return '';
  const pend = state.pending.get(f);
  if (pend) return (pend.url ||= URL.createObjectURL(pend.blob));
  return state.thumbs.get(f) || `../images/${encodeURIComponent(f)}`;
}

function card(p, tab) {
  const inHome = state.data.order.home.includes(p.slug);
  const inGal = state.data.order.gallery.includes(p.slug);
  const badges = (inHome ? '<span class="badge">головна</span>' : '') + (inGal ? '<span class="badge">галерея</span>' : '');
  const reorder = tab !== 'all'
    ? `<button class="small" data-act="up" data-slug="${h(p.slug)}" title="Вище">↑</button>
       <button class="small" data-act="down" data-slug="${h(p.slug)}" title="Нижче">↓</button>`
    : '';
  const remove = tab !== 'all' ? `<button class="small" data-act="unlist" data-slug="${h(p.slug)}">Прибрати зі сторінки</button>` : '';
  const thumb = thumbOf(p);
  return `<li class="pcard">
    ${thumb ? `<img class="thumb" src="${h(thumb)}" alt="" loading="lazy">` : '<div class="thumb"></div>'}
    <div class="info"><strong>${h(byTitle(p))}${badges}</strong>
      <span>${h(CATEGORY_LABELS[p.category] || '')} · ${p.files.length ? p.files.length + ' фото' : 'відео'} · /projects/${h(p.slug)}.html</span></div>
    <div class="acts">${reorder}<button class="small" data-act="edit" data-slug="${h(p.slug)}">Редагувати</button>${remove}</div>
  </li>`;
}

function renderList() {
  const d = state.data;
  const tab = state.tab;
  const bySlug = new Map(d.projects.map((p) => [p.slug, p]));
  let shown, hidden = [];
  if (tab === 'all') {
    shown = d.projects;
  } else {
    shown = d.order[tab].map((s) => bySlug.get(s)).filter(Boolean);
    hidden = d.projects.filter((p) => !d.order[tab].includes(p.slug) && (tab === 'home' || p.files.length));
  }
  const dirty = isDirty();
  const changes = [];
  if (JSON.stringify(d) !== state.baseJson) changes.push('дані проєктів');
  if (state.pending.size) changes.push(`нових фото: ${state.pending.size}`);
  if (state.removed.size) changes.push(`фото на видалення: ${state.removed.size}`);

  app.innerHTML = `
  <div class="toolbar">
    <h1>Проєкти</h1>
    <div class="actions">
      <button data-act="new" class="primary">+ Новий проєкт</button>
      <button data-act="sizes" title="Один раз: прочитати розміри наявних фото, щоб сторінки не «стрибали» під час завантаження">Оновити розміри фото</button>
    </div>
  </div>
  <div class="tabs" role="group" aria-label="Розділ">
    <button data-act="tab" data-tab="home" aria-pressed="${tab === 'home'}">Головна</button>
    <button data-act="tab" data-tab="gallery" aria-pressed="${tab === 'gallery'}">Галерея</button>
    <button data-act="tab" data-tab="all" aria-pressed="${tab === 'all'}">Усі проєкти (${d.projects.length})</button>
  </div>
  <p class="muted">${tab === 'home' ? 'Порядок робіт на головній. Перша робота показується окремо й великою.' :
    tab === 'gallery' ? 'Порядок карток у галереї. Галерея лишається такою, як ви її зробили, змінюється лише набір і порядок.' :
      'Усі проєкти, навіть ті, що не показані на головній чи в галереї.'}</p>
  <ul class="cards">${shown.map((p) => card(p, tab)).join('') || '<li class="muted">Тут поки порожньо.</li>'}</ul>
  ${hidden.length ? `<h2>Не показано тут</h2><ul class="cards">${hidden.map((p) => `<li class="pcard">
      ${thumbOf(p) ? `<img class="thumb" src="${h(thumbOf(p))}" alt="">` : '<div class="thumb"></div>'}
      <div class="info"><strong>${h(byTitle(p))}</strong><span>${h(CATEGORY_LABELS[p.category] || '')}</span></div>
      <div class="acts"><button class="small" data-act="list" data-slug="${h(p.slug)}">Додати на цю сторінку</button></div></li>`).join('')}</ul>` : ''}
  <div class="sticky">
    <button class="primary" data-act="publish" ${dirty && !state.busy ? '' : 'disabled'}>Опублікувати на сайті</button>
    <button data-act="discard" ${dirty && !state.busy ? '' : 'disabled'}>Скасувати всі зміни</button>
    <span class="muted self-center">${dirty ? 'Неопубліковано: ' + changes.join(', ') : 'Усе опубліковано'}</span>
  </div>
  <div id="log" class="log" hidden></div>`;
}

function moveInOrder(tab, slug, delta) {
  const arr = state.data.order[tab];
  const i = arr.indexOf(slug);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  renderList();
}

/* ---------------------------------------------------------------- editor */

function newDraft() {
  return {
    slug: '', category: 'interior', software: '', video: '',
    en: { title: '', short: '', lead: '', alt: '' },
    uk: { title: '', short: '', lead: '', alt: '' },
    imgs: [], inHome: true, inGallery: true,
  };
}

function draftFrom(p) {
  const imgs = p.files.map((f) => {
    const pend = state.pending.get(f);
    return pend
      ? { file: f, blob: pend.blob, w: pend.w, h: pend.h, url: (pend.url ||= URL.createObjectURL(pend.blob)), staged: true }
      : { file: f, url: `../images/${encodeURIComponent(f)}`, existing: true };
  });
  return {
    slug: p.slug, category: p.category, software: p.software || '', video: p.video || '',
    en: { title: '', short: '', lead: '', alt: '', ...(p.en || {}) },
    uk: { title: '', short: '', lead: '', alt: '', ...(p.uk || {}) },
    imgs, inHome: state.data.order.home.includes(p.slug), inGallery: state.data.order.gallery.includes(p.slug),
    ogImage: p.ogImage, original: clone(p),
  };
}

function langFields(lang, label) {
  const d = state.draft[lang];
  return `<fieldset><legend>${label}</legend>
    <label for="${lang}-title">Назва</label>
    <input id="${lang}-title" type="text" value="${h(d.title)}">
    <label for="${lang}-short">Коротка назва <span class="muted">(необов'язково, для посилань і підказок)</span></label>
    <input id="${lang}-short" type="text" value="${h(d.short)}">
    <label for="${lang}-lead">Опис проєкту</label>
    <textarea id="${lang}-lead">${h(d.lead)}</textarea>
    <div class="hint">Порожній рядок між абзацами робить новий абзац. Чим більше справжніх деталей (завдання, матеріали, світло), тим краще для Google і клієнтів.</div>
    <label for="${lang}-alt">Підпис до першого фото <span class="muted">(необов'язково)</span></label>
    <input id="${lang}-alt" type="text" value="${h(d.alt)}">
    <div class="hint">Одне речення про те, що зображено. Якщо порожньо, підпис складеться сам.</div>
  </fieldset>`;
}

function renderEditor() {
  const d = state.draft;
  app.innerHTML = `
  <div class="toolbar"><h1>${state.isNew ? 'Новий проєкт' : 'Редагування: ' + h(byTitle(d))}</h1>
    <button data-act="cancel-edit">← До списку</button></div>
  <div class="card">
    <div class="grid2">
      <div>
        <label for="category">Категорія</label>
        <select id="category">${CATEGORIES.map((c) => `<option value="${c}" ${d.category === c ? 'selected' : ''}>${h(CATEGORY_LABELS[c])}</option>`).join('')}</select>
      </div>
      <div>
        <label for="slug">Адреса сторінки</label>
        <input id="slug" type="text" value="${h(d.slug)}" ${state.isNew ? '' : 'readonly'} placeholder="наприклад, loft-living-room">
        <div class="hint">${state.isNew ? 'Латиниця, цифри, дефіси. Після публікації не змінюється.' : 'Після публікації не змінюється.'} Сторінка буде: <code>/projects/<span id="slug-preview">${h(d.slug || '…')}</span>.html</code></div>
      </div>
    </div>
    <div class="grid2 mt">${langFields('en', 'English')}${langFields('uk', 'Українська')}</div>
    <p class="hint">Якщо заповнена лише одна мова, у другій версії сайту покажеться той самий текст. Краще заповнити обидві.</p>
    <div class="grid2">
      <div><label for="software">Програми <span class="muted">(необов'язково)</span></label>
        <input id="software" type="text" value="${h(d.software)}" placeholder="3ds Max, Corona Renderer"></div>
      <div><label for="video">Файл відео <span class="muted">(необов'язково, лише якщо немає фото)</span></label>
        <input id="video" type="text" value="${h(d.video)}" placeholder="porsche_911.webm">
        <div class="hint">Відео завантажте в папку images вручну й вкажіть тут назву файлу.</div></div>
    </div>
    <label class="check"><input id="in-home" type="checkbox" ${d.inHome ? 'checked' : ''}> Показувати на головній</label>
    <label class="check"><input id="in-gallery" type="checkbox" ${d.inGallery ? 'checked' : ''}> Показувати в галереї (потрібні фото)</label>

    <h2>Фото</h2>
    <div id="drop" class="drop">Перетягніть фото сюди або <button type="button" data-act="pick" class="small">оберіть файли</button>
      <div class="hint">JPG, PNG або WebP. Вони самі стиснуться у WebP (до ${MAX_WIDTH}px по ширині). Перше фото — обкладинка.</div>
      <input id="file" type="file" accept="image/*" multiple hidden></div>
    <div id="imgs" class="tiles"></div>
  </div>
  <div class="sticky">
    <button class="primary" data-act="save-draft">Зберегти зміни</button>
    <button data-act="cancel-edit">Скасувати</button>
    ${state.isNew ? '' : '<button class="danger" data-act="delete">Видалити проєкт</button>'}
  </div>`;
  renderImgs();
  const slugEl = document.getElementById('slug');
  let touched = !state.isNew;
  slugEl.addEventListener('input', () => { touched = true; document.getElementById('slug-preview').textContent = slugEl.value || '…'; });
  document.getElementById('en-title').addEventListener('input', (e) => {
    if (state.isNew && !touched) { slugEl.value = slugify(e.target.value); document.getElementById('slug-preview').textContent = slugEl.value || '…'; }
  });
  const drop = document.getElementById('drop');
  const input = document.getElementById('file');
  input.addEventListener('change', () => { addFiles([...input.files]); input.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => addFiles([...e.dataTransfer.files]));
}

function renderImgs() {
  const box = document.getElementById('imgs');
  if (!box) return;
  const imgs = state.draft.imgs;
  box.innerHTML = imgs.map((im, i) => `<div class="tile ${i === 0 ? 'cover' : ''}">
      <img src="${h(im.url)}" alt="">
      <div class="meta">${i === 0 ? '<span class="tag">Обкладинка</span> · ' : ''}${h(im.file || 'нове фото')}${im.blob ? ` · ${im.w}×${im.h} · ${kb(im.blob.size)}` : ''}</div>
      <div class="btns">
        <button type="button" data-act="img-left" data-i="${i}" title="Ліворуч">◀</button>
        <button type="button" data-act="img-right" data-i="${i}" title="Праворуч">▶</button>
        <button type="button" data-act="img-del" data-i="${i}" class="danger" title="Прибрати">✕</button>
      </div></div>`).join('') || '<p class="muted">Фото ще немає.</p>';
}

async function addFiles(files) {
  const images = files.filter((f) => f.type.startsWith('image/'));
  if (!images.length) return toast('Оберіть зображення (JPG, PNG, WebP).', 'error');
  const note = toast('Стискаю фото…', '', 0);
  try {
    for (const f of images) {
      const { blob, w, h: hh } = await toWebp(f);
      state.draft.imgs.push({ blob, w, h: hh, url: URL.createObjectURL(blob), src: f.name });
      renderImgs();
    }
  } catch (e) { toast(e.message, 'error'); }
  note.remove();
}

function readForm() {
  const d = state.draft;
  const v = (id) => document.getElementById(id).value.trim();
  d.category = v('category');
  if (state.isNew) d.slug = v('slug');
  for (const lang of ['en', 'uk']) for (const k of ['title', 'short', 'lead', 'alt']) d[lang][k] = v(`${lang}-${k}`);
  d.software = v('software'); d.video = v('video');
  d.inHome = document.getElementById('in-home').checked;
  d.inGallery = document.getElementById('in-gallery').checked;
}

function saveDraft() {
  readForm();
  const d = state.draft;
  const data = state.data;
  if (state.isNew) {
    if (!d.slug) d.slug = slugify(d.en.title || d.uk.title);
    if (!d.slug) return toast('Вкажіть назву або адресу сторінки.', 'error');
  }
  if (!d.en.title && !d.uk.title) return toast('Потрібна назва (хоча б однією мовою).', 'error');
  if (!d.imgs.length && !d.video) return toast('Додайте хоча б одне фото або вкажіть файл відео.', 'error');
  if (state.isNew && data.projects.some((p) => p.slug === d.slug)) return toast(`Адреса «${d.slug}» уже зайнята.`, 'error');

  // name the new files
  const used = new Set([...state.pending.keys(), ...data.projects.flatMap((p) => p.files)]);
  let n = 1;
  for (const im of d.imgs) {
    if (im.file) continue;
    while (used.has(`${d.slug}-${n}.webp`)) n++;
    im.file = `${d.slug}-${n}.webp`;
    used.add(im.file);
  }
  const files = d.imgs.map((im) => im.file);
  const prevFiles = state.isNew ? [] : state.data.projects.find((p) => p.slug === d.slug).files;

  for (const f of prevFiles) {           // images removed from the project
    if (files.includes(f)) continue;
    if (state.pending.has(f)) state.pending.delete(f); else state.removed.add(f);
    delete data.sizes[f];
  }
  for (const im of d.imgs) {              // images added now
    if (im.blob && !state.pending.has(im.file)) {
      state.pending.set(im.file, { blob: im.blob, w: im.w, h: im.h, url: im.url });
      data.sizes[im.file] = [im.w, im.h];
    }
  }

  const project = {
    slug: d.slug, category: d.category, files, video: files.length ? '' : d.video,
    ...(d.software ? { software: d.software } : {}),
    ...(d.ogImage ? { ogImage: d.ogImage } : {}),
    updated: today(),
    en: { ...d.en }, uk: { ...d.uk },
  };
  const idx = data.projects.findIndex((p) => p.slug === d.slug);
  if (idx >= 0) data.projects[idx] = project; else data.projects.unshift(project);

  const sync = (key, wanted) => {
    const arr = data.order[key];
    const at = arr.indexOf(d.slug);
    if (wanted && at < 0) arr.unshift(d.slug);
    if (!wanted && at >= 0) arr.splice(at, 1);
  };
  sync('home', d.inHome);
  sync('gallery', d.inGallery && files.length > 0);

  const errors = validate(data);
  if (errors.length) { toast(errors.join('\n'), 'error', 9000); return; }
  state.draft = null;
  renderList();
  toast('Збережено в чернетку. Щоб зміни з\'явились на сайті, натисніть «Опублікувати».', 'ok');
}

function deleteProject() {
  const d = state.draft;
  const p = state.data.projects.find((x) => x.slug === d.slug);
  if (!p || !confirm(`Видалити проєкт «${byTitle(p)}»? Його сторінки зникнуть із сайту після публікації.`)) return;
  const alsoFiles = p.files.length > 0 && confirm('Видалити також файли фото цього проєкту з репозиторію?\nОК — видалити, Скасувати — залишити в папці images.');
  state.data.projects = state.data.projects.filter((x) => x.slug !== p.slug);
  for (const k of ['home', 'gallery']) state.data.order[k] = state.data.order[k].filter((s) => s !== p.slug);
  for (const f of p.files) {
    if (state.pending.has(f)) { state.pending.delete(f); delete state.data.sizes[f]; }
    else if (alsoFiles) { state.removed.add(f); delete state.data.sizes[f]; }
  }
  state.draft = null;
  renderList();
}

/* ------------------------------------------------------------- image sizes */

async function scanSizes() {
  const todo = state.data.projects.flatMap((p) => p.files).filter((f) => !state.data.sizes[f] && !state.pending.has(f));
  if (!todo.length) return toast('Розміри всіх фото вже відомі.', 'ok');
  const note = toast('', '', 0);
  let ok = 0; const failed = [];
  for (let i = 0; i < todo.length; i++) {
    note.textContent = `Читаю розміри фото: ${i + 1} з ${todo.length}…`;
    try {
      const res = await fetch(`../images/${encodeURIComponent(todo[i])}`);
      if (!res.ok) throw new Error(String(res.status));
      const bmp = await createImageBitmap(await res.blob());
      state.data.sizes[todo[i]] = [bmp.width, bmp.height]; bmp.close?.(); ok++;
    } catch { failed.push(todo[i]); }
  }
  note.remove();
  renderList();
  toast(`Розміри прочитано: ${ok}.` + (failed.length ? `\nНе вдалося (файл відсутній?): ${failed.join(', ')}` : '\nТепер натисніть «Опублікувати».'), failed.length ? 'error' : 'ok', 10000);
}

/* ---------------------------------------------------------------- publish */

async function publish() {
  const errors = validate(state.data);
  if (errors.length) return toast(errors.join('\n'), 'error', 9000);
  state.busy = true; renderList();
  const log = document.getElementById('log');
  const say = (t) => { log.hidden = false; log.textContent += (log.textContent ? '\n' : '') + t; };
  try {
    const repo = state.repo;
    say('Перевіряю стан репозиторію…');
    const ref = await api(`/repos/${repo}/git/ref/heads/${BRANCH}`);
    if (ref.object.sha !== state.head) throw new Error('Репозиторій змінили з моменту завантаження (інший пристрій чи коміт). Щоб нічого не затерти, оновіть сторінку й повторіть правки.');

    say('Читаю шаблони сторінок…');
    const files = {};
    for (const rel of PAGES) files[rel] = await api(`/repos/${repo}/contents/${enc(rel)}?ref=${state.head}`, { raw: true });
    const tree = await api(`/repos/${repo}/git/trees/${state.treeSha}?recursive=1`);
    const existing = new Set(tree.tree.filter((t) => t.type === 'blob').map((t) => t.path));

    say('Генерую сторінки…');
    const data = clone(state.data);
    const { out, generated } = buildSite(data, files);

    const entries = [];
    let n = 0;
    for (const [name, p] of state.pending) {
      say(`Завантажую фото ${++n} з ${state.pending.size}: ${name}`);
      const blob = await api(`/repos/${repo}/git/blobs`, { method: 'POST', body: { content: await blobToBase64(p.blob), encoding: 'base64' } });
      entries.push({ path: `images/${name}`, mode: '100644', type: 'blob', sha: blob.sha });
    }
    for (const [path, content] of Object.entries(out)) entries.push({ path, mode: '100644', type: 'blob', content });
    entries.push({ path: 'data/projects.json', mode: '100644', type: 'blob', content: JSON.stringify(data, null, 2) + '\n' });
    for (const path of existing) {
      const stale = (path.startsWith('projects/') || path.startsWith('ua/projects/')) && path.endsWith('.html') && !generated.has(path);
      if (stale) entries.push({ path, mode: '100644', type: 'blob', sha: null });
    }
    for (const f of state.removed) if (existing.has(`images/${f}`)) entries.push({ path: `images/${f}`, mode: '100644', type: 'blob', sha: null });

    say('Створюю коміт…');
    const newTree = await api(`/repos/${repo}/git/trees`, { method: 'POST', body: { base_tree: state.treeSha, tree: entries } });
    const summary = [];
    if (state.pending.size) summary.push(`${state.pending.size} фото`);
    const msg = `Адмінка: оновлення проєктів${summary.length ? ' (' + summary.join(', ') + ')' : ''}`;
    const commit = await api(`/repos/${repo}/git/commits`, { method: 'POST', body: { message: msg, tree: newTree.sha, parents: [state.head] } });
    await api(`/repos/${repo}/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: { sha: commit.sha, force: false } });

    state.head = commit.sha; state.treeSha = newTree.sha;
    state.data = data; state.baseJson = JSON.stringify(data);
    for (const [name, p] of state.pending) state.thumbs.set(name, (p.url ||= URL.createObjectURL(p.blob)));
    state.pending.clear(); state.removed.clear();
    state.busy = false;
    renderList();
    toast('Опубліковано! GitHub Pages оновить сайт за 1–2 хвилини (іноді трохи довше). Потім зробіть Ctrl+F5 на сайті.', 'ok', 15000);
  } catch (e) {
    state.busy = false;
    renderList();
    const l = document.getElementById('log'); l.hidden = false; l.textContent = log.textContent;
    toast('Не вдалося опублікувати.\n' + e.message, 'error', 15000);
  }
}

/* ----------------------------------------------------------------- events */

app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  const slug = b.dataset.slug;
  const find = () => state.data.projects.find((p) => p.slug === slug);
  const i = Number(b.dataset.i);
  switch (act) {
    case 'tab': state.tab = b.dataset.tab; renderList(); break;
    case 'up': moveInOrder(state.tab, slug, -1); break;
    case 'down': moveInOrder(state.tab, slug, 1); break;
    case 'unlist': state.data.order[state.tab] = state.data.order[state.tab].filter((s) => s !== slug); renderList(); break;
    case 'list': state.data.order[state.tab].push(slug); renderList(); break;
    case 'new': state.draft = newDraft(); state.isNew = true; renderEditor(); break;
    case 'edit': state.draft = draftFrom(find()); state.isNew = false; renderEditor(); break;
    case 'sizes': scanSizes(); break;
    case 'publish': publish(); break;
    case 'discard':
      if (confirm('Скасувати всі неопубліковані зміни?')) loadRepo().catch((err) => toast(err.message, 'error'));
      break;
    case 'pick': document.getElementById('file').click(); break;
    case 'img-left': if (i > 0) { const a = state.draft.imgs; [a[i - 1], a[i]] = [a[i], a[i - 1]]; renderImgs(); } break;
    case 'img-right': { const a = state.draft.imgs; if (i < a.length - 1) { [a[i + 1], a[i]] = [a[i], a[i + 1]]; renderImgs(); } break; }
    case 'img-del': state.draft.imgs.splice(i, 1); renderImgs(); break;
    case 'save-draft': saveDraft(); break;
    case 'cancel-edit': state.draft = null; renderList(); break;
    case 'delete': deleteProject(); break;
    default: break;
  }
});

app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && ['token', 'pass', 'pass2'].includes(e.target.id)) doLogin();
  if (e.key === 'Enter' && e.target.id === 'unlock-pass') doUnlock();
});
app.addEventListener('click', (e) => {
  if (e.target.id === 'login') doLogin();
  if (e.target.id === 'unlock') doUnlock();
  if (e.target.id === 'forget' && confirm('Видалити збережений токен з цього пристрою? Вам знадобиться токен, щоб увійти знову.')) {
    localStorage.removeItem(VAULT_KEY); renderLogin();
  }
});
app.addEventListener('change', (e) => {
  if (e.target.id === 'remember') document.getElementById('pass-box').hidden = !e.target.checked;
});
logoutBtn.addEventListener('click', logout);

/* ------------------------------------------------------------------ start */

(function start() {
  state.repo = localStorage.getItem(REPO_KEY) || DEFAULT_REPO;
  localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY);   // never keep a plain-text token
  if (hasVault()) renderUnlock(); else renderLogin();
})();
