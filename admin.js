// VOI menu editor.
//
// Talks to the same `menu_items` table the public site reads (see
// supabase/schema.sql). Reads are open to anyone; writes require the signed
// -in session this page creates, which is why nothing renders until
// checkSession() / the login form confirms one.
//
// Layout mirrors how the menu actually appears on the site: a fixed list of
// chapters (section + category), each holding its items in sort_order.
// Adding an entirely new category isn't supported here on purpose — it
// needs a matching <section data-menu="…"> added to index.html/drinks.html,
// which is a code change, not a data change.

const CHAPTERS = [
  { section: 'food',   category: 'popular',    label: 'Popular',    parent: 'Food'   },
  { section: 'food',   category: 'pizza',      label: 'Pizza',      parent: 'Food'   },
  { section: 'food',   category: 'hamburgers', label: 'Hamburgers', parent: 'Food'   },
  { section: 'drinks', category: 'popular',    label: 'Popular',    parent: 'Drinks' },
  { section: 'drinks', category: 'coffee',     label: 'Coffee',     parent: 'Drinks' },
  { section: 'drinks', category: 'cocktails',  label: 'Cocktails',  parent: 'Drinks' },
];

// The photo gallery isn't managed from this editor — it's photo-driven, not
// text-driven, and this tool has no way to upload or change images. Its rows
// stay exactly as they are in Supabase and keep rendering fine on the live
// site (script.js reads them directly); this just keeps them out of view
// here so nobody edits a gallery item's name/price expecting it to do
// something it can't.
const HIDDEN_CATEGORIES = new Set(['drinks.gallery']);

const TABLE = 'menu_items';

const els = {
  authGate: document.getElementById('auth-gate'),
  loginForm: document.getElementById('login-form'),
  loginEmail: document.getElementById('login-email'),
  loginPassword: document.getElementById('login-password'),
  loginSubmit: document.getElementById('login-submit'),
  loginError: document.getElementById('login-error'),

  admin: document.getElementById('admin'),
  accountEmail: document.getElementById('account-email'),
  signOut: document.getElementById('sign-out'),

  ledgerLoading: document.getElementById('ledger-loading'),
  ledgerError: document.getElementById('ledger-error'),
  retryLoad: document.getElementById('retry-load'),
  ledger: document.getElementById('ledger'),

  toast: document.getElementById('toast'),
};

let client = null;
let items = [];            // flat rows from Supabase
let collapsed = new Set(); // chapter keys ("food.pizza") the owner has collapsed
let toastTimer = null;

const chapterKey = (section, category) => `${section}.${category}`;
const escapeHtml = (str) =>
  String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
const findChapterMeta = (section, category) =>
  CHAPTERS.find((c) => c.section === section && c.category === category)
  || { section, category, label: category, parent: section };

const iconChevron = `<svg class="chapter-chevron" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const iconUp = `<svg viewBox="0 0 12 12" fill="none"><path d="M2 7l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const iconDown = `<svg viewBox="0 0 12 12" fill="none"><path d="M2 5l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function showToast(message, { danger = false } = {}) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.toggle('is-danger', danger);
  els.toast.hidden = false;
  // restart the entrance animation on repeated toasts
  els.toast.style.animation = 'none';
  els.toast.offsetHeight; // eslint-disable-line no-unused-expressions
  els.toast.style.animation = '';
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2600);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function initClient() {
  if (typeof supabase === 'undefined') {
    els.loginError.textContent = 'Could not load the Supabase library. Check your connection and reload.';
    els.loginError.hidden = false;
    return false;
  }
  if (typeof SUPABASE_URL === 'undefined' || SUPABASE_URL.includes('YOUR-PROJECT')) {
    els.loginError.textContent = 'supabase-config.js hasn\u2019t been filled in yet — see step 1\u2019s setup guide.';
    els.loginError.hidden = false;
    return false;
  }
  client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return true;
}

function showSignedIn(session) {
  els.authGate.hidden = true;
  els.admin.hidden = false;
  els.accountEmail.textContent = session.user.email || '';
  loadAndRender();
}

function showSignedOut() {
  els.admin.hidden = true;
  els.authGate.hidden = false;
  els.loginSubmit.disabled = false;
  els.loginSubmit.textContent = 'Sign in';
}

async function handleLogin(e) {
  e.preventDefault();

  if (!client) {
    els.loginError.textContent = 'Supabase isn\u2019t configured yet \u2014 check supabase-config.js.';
    els.loginError.hidden = false;
    return;
  }

  els.loginError.hidden = true;
  els.loginSubmit.disabled = true;
  els.loginSubmit.textContent = 'Signing in\u2026';

  // Wrapped in try/catch/finally so the button is *always* returned to a
  // clickable state — previously, anything other than a normal rejected
  // login (a network failure, a wrong project URL, a blocked request)
  // threw past the old error check entirely and left "Signing in…"
  // stuck on screen with no way to retry and no clue what went wrong.
  try {
    const { error } = await client.auth.signInWithPassword({
      email: els.loginEmail.value.trim(),
      password: els.loginPassword.value,
    });

    if (error) {
      els.loginError.textContent = error.message === 'Invalid login credentials'
        ? 'Wrong email or password.'
        : error.message;
      els.loginError.hidden = false;
    }
    // no error: onAuthStateChange picks up the new session and calls showSignedIn().
  } catch (err) {
    console.error('Sign-in request failed:', err);
    els.loginError.textContent = 'Couldn\u2019t reach Supabase. Check your internet connection and that the URL in supabase-config.js is correct.';
    els.loginError.hidden = false;
  } finally {
    els.loginSubmit.disabled = false;
    els.loginSubmit.textContent = 'Sign in';
  }
}

async function handleSignOut() {
  await client.auth.signOut();
  els.loginEmail.value = '';
  els.loginPassword.value = '';
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadAndRender() {
  els.ledger.hidden = true;
  els.ledgerError.hidden = true;
  els.ledgerLoading.hidden = false;

  const { data, error } = await client
    .from(TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  els.ledgerLoading.hidden = true;

  if (error) {
    console.error(error);
    els.ledgerError.hidden = false;
    return;
  }

  items = data || [];
  renderLedger();
  els.ledger.hidden = false;
}

function itemsFor(section, category) {
  return items
    .filter((i) => i.section === section && i.category === category)
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderLedger() {
  els.ledger.innerHTML = CHAPTERS.map(renderChapter).join('');

  // Anything sitting in a section/category this page doesn't recognise
  // (e.g. added directly in Supabase) still needs to be visible, or an
  // owner could lose track of it entirely.
  const known = new Set(CHAPTERS.map((c) => chapterKey(c.section, c.category)));
  const orphanKeys = [...new Set(
    items
      .filter((i) => {
        const key = chapterKey(i.section, i.category);
        return !known.has(key) && !HIDDEN_CATEGORIES.has(key);
      })
      .map((i) => chapterKey(i.section, i.category))
  )];
  orphanKeys.forEach((key) => {
    const [section, category] = key.split('.');
    els.ledger.insertAdjacentHTML('beforeend', renderChapter(findChapterMeta(section, category)));
  });

  els.ledger.querySelectorAll('.chapter').forEach(bindChapterEvents);
}

function renderChapter(chapter) {
  const { section, category, label, parent } = chapter;
  const key = chapterKey(section, category);
  const list = itemsFor(section, category);
  const isCollapsed = collapsed.has(key);

  return `
    <section class="chapter${isCollapsed ? ' is-collapsed' : ''}" data-key="${key}">
      <button class="chapter-head" type="button" aria-expanded="${!isCollapsed}">
        <h2>${escapeHtml(label)}</h2>
        <span class="chapter-parent">${escapeHtml(parent)}</span>
        <span class="chapter-count">${list.length}</span>
        ${iconChevron}
      </button>
      <div class="chapter-body">
        ${list.length
          ? `<ul class="item-list">${list.map((item, i) => renderRow(item, i, list.length)).join('')}</ul>`
          : `<p class="chapter-empty">Nothing here yet.</p>`}
        <div class="add-item-row">
          <button class="add-item" type="button" data-add="${key}">+ Add item</button>
        </div>
      </div>
    </section>`;
}

function renderRow(item, index, total) {
  return `
    <li class="item-row" data-id="${item.id}">
      <div class="item-row-main">
        <div class="item-order">
          <button type="button" data-move="up" aria-label="Move up" ${index === 0 ? 'disabled' : ''}>${iconUp}</button>
          <button type="button" data-move="down" aria-label="Move down" ${index === total - 1 ? 'disabled' : ''}>${iconDown}</button>
        </div>
        <button class="item-summary" type="button" data-toggle-edit>
          <span class="item-name">${escapeHtml(item.name)}</span>
          <span class="item-price">${item.price}<span class="unit">\u0434\u0435\u043d</span></span>
          <span class="item-edit-hint">Edit</span>
        </button>
      </div>
      ${renderEditor(item)}
    </li>`;
}

function renderEditor(item) {
  return `
    <form class="item-editor" hidden>
      <label class="field">
        <span>Name</span>
        <input name="name" value="${escapeHtml(item.name)}" autocomplete="off" required>
      </label>
      <label class="field field-price">
        <span>Price (\u0434\u0435\u043d)</span>
        <input name="price" type="number" min="0" step="1" value="${item.price}" autocomplete="off" required>
      </label>
      <label class="field">
        <span>Description</span>
        <textarea name="description" rows="2" autocomplete="off">${escapeHtml(item.description || '')}</textarea>
      </label>
      <div class="item-editor-actions" data-actions>
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn btn-secondary" data-cancel>Cancel</button>
        <span class="spacer"></span>
        <button type="button" class="btn-danger-text" data-delete>Delete</button>
      </div>
    </form>`;
}

function renderNewRowEditor(section, category) {
  const form = document.createElement('form');
  form.className = 'item-editor';
  form.dataset.new = 'true';
  form.innerHTML = `
    <label class="field">
      <span>Name</span>
      <input name="name" autocomplete="off" required>
    </label>
    <label class="field field-price">
      <span>Price (\u0434\u0435\u043d)</span>
      <input name="price" type="number" min="0" step="1" autocomplete="off" required>
    </label>
    <label class="field">
      <span>Description</span>
      <textarea name="description" rows="2" autocomplete="off"></textarea>
    </label>
    <div class="item-editor-actions">
      <button type="submit" class="btn btn-primary">Add to menu</button>
      <button type="button" class="btn btn-secondary" data-cancel-new>Cancel</button>
    </div>`;

  form.querySelector('[data-cancel-new]').addEventListener('click', () => form.remove());
  form.addEventListener('submit', (e) => handleSaveNew(e, form, section, category));
  return form;
}

// ---------------------------------------------------------------------------
// Event binding
//
// Every action that changes the list (add / delete / reorder) re-renders
// just the one affected chapter and rebinds only that chapter's listeners,
// rather than the whole ledger — so repeated actions never pile up
// duplicate handlers on rows nobody touched.
// ---------------------------------------------------------------------------

function bindChapterEvents(chapterEl) {
  const head = chapterEl.querySelector('.chapter-head');
  head.addEventListener('click', () => {
    const key = chapterEl.dataset.key;
    const willCollapse = !chapterEl.classList.contains('is-collapsed');
    chapterEl.classList.toggle('is-collapsed', willCollapse);
    head.setAttribute('aria-expanded', String(!willCollapse));
    willCollapse ? collapsed.add(key) : collapsed.delete(key);
  });

  chapterEl.querySelectorAll('[data-toggle-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.item-row');
      const editor = row.querySelector('.item-editor');
      const opening = editor.hidden;
      closeAllEditors(); // only one row editable at a time
      editor.hidden = !opening;
      if (opening) editor.querySelector('input[name="name"]').focus();
    });
  });

  chapterEl.querySelectorAll('.item-editor:not([data-new])').forEach(bindEditorEvents);

  chapterEl.querySelectorAll('[data-move]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.closest('.item-row').dataset.id;
      const item = items.find((i) => String(i.id) === id);
      if (item) moveItem(item, btn.dataset.move);
    });
  });

  chapterEl.querySelector('[data-add]').addEventListener('click', (e) => handleAddClick(e.currentTarget));
}

function bindEditorEvents(form) {
  form.addEventListener('submit', (e) => handleSaveExisting(e, form));
  form.querySelector('[data-cancel]').addEventListener('click', () => { form.hidden = true; });
  form.querySelector('[data-delete]').addEventListener('click', () => promptDelete(form));
}

function closeAllEditors() {
  els.ledger.querySelectorAll('.item-editor').forEach((f) => {
    if (f.dataset.new === 'true') {
      f.remove();
      return;
    }
    const actions = f.querySelector('[data-actions]');
    if (actions?.dataset.confirming) {
      // A delete was mid-confirmation when something else got clicked —
      // rebuild this one editor cleanly rather than leaving the
      // confirmation UI stranded inside a hidden form.
      const row = f.closest('.item-row');
      const item = items.find((i) => String(i.id) === row.dataset.id);
      f.outerHTML = renderEditor(item);
      bindEditorEvents(row.querySelector('.item-editor'));
    }
    f.hidden = true;
  });
}

// ---------------------------------------------------------------------------
// Save / delete / reorder
// ---------------------------------------------------------------------------

async function handleSaveExisting(e, form) {
  e.preventDefault();
  const row = form.closest('.item-row');
  const id = row.dataset.id;
  const item = items.find((i) => String(i.id) === id);
  const saveBtn = form.querySelector('button[type="submit"]');

  const patch = readFormValues(form);
  if (patch === null) return; // validation failed, browser already flagged it

  setSaving(saveBtn, true, 'Save');
  const { error } = await client.from(TABLE).update(patch).eq('id', id);
  setSaving(saveBtn, false, 'Save');

  if (error) {
    console.error(error);
    showToast('Couldn\u2019t save \u2014 try again.', { danger: true });
    return;
  }

  Object.assign(item, patch);
  form.hidden = true;
  row.querySelector('.item-name').textContent = item.name;
  row.querySelector('.item-price').innerHTML = `${item.price}<span class="unit">\u0434\u0435\u043d</span>`;
  showToast(`Saved ${item.name}.`);
}

function readFormValues(form) {
  const name = form.name.value.trim();
  const price = Number(form.price.value);
  if (!name || Number.isNaN(price) || price < 0) return null;

  const patch = { name, price };
  if (form.description) patch.description = form.description.value.trim() || null;
  return patch;
}

function setSaving(button, saving, label) {
  button.disabled = saving;
  button.textContent = saving ? 'Saving\u2026' : label;
}

function promptDelete(form) {
  const row = form.closest('.item-row');
  const item = items.find((i) => String(i.id) === row.dataset.id);
  const actions = form.querySelector('[data-actions]');
  if (actions.dataset.confirming) return;
  actions.dataset.confirming = 'true';

  const original = actions.innerHTML;
  actions.innerHTML = `
    <div class="confirm-delete">
      <span>Delete <strong>${escapeHtml(item.name)}</strong>? This can\u2019t be undone.</span>
      <button type="button" class="btn btn-danger" data-confirm-delete>Yes, delete</button>
      <button type="button" class="btn btn-secondary" data-cancel-delete>Cancel</button>
    </div>`;

  actions.querySelector('[data-cancel-delete]').addEventListener('click', () => {
    actions.innerHTML = original;
    delete actions.dataset.confirming;
    // the buttons just re-parsed from `original` need fresh listeners;
    // the <form>'s own submit listener was never touched.
    actions.querySelector('[data-cancel]').addEventListener('click', () => { form.hidden = true; });
    actions.querySelector('[data-delete]').addEventListener('click', () => promptDelete(form));
  });
  actions.querySelector('[data-confirm-delete]').addEventListener('click', () => deleteItem(item, row));
}

async function deleteItem(item, row) {
  const confirmBtn = row.querySelector('[data-confirm-delete]');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Deleting\u2026';

  const { error } = await client.from(TABLE).delete().eq('id', item.id);

  if (error) {
    console.error(error);
    showToast('Couldn\u2019t delete \u2014 try again.', { danger: true });
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Yes, delete';
    return;
  }

  items = items.filter((i) => i.id !== item.id);
  replaceChapter(item.section, item.category);
  showToast(`Removed ${item.name}.`);
}

async function moveItem(item, direction) {
  const list = itemsFor(item.section, item.category);
  const idx = list.findIndex((i) => i.id === item.id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return;

  const other = list[swapIdx];
  const a = item.sort_order;
  const b = other.sort_order;
  item.sort_order = b;
  other.sort_order = a;

  replaceChapter(item.section, item.category);

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    client.from(TABLE).update({ sort_order: item.sort_order }).eq('id', item.id),
    client.from(TABLE).update({ sort_order: other.sort_order }).eq('id', other.id),
  ]);

  if (e1 || e2) {
    console.error(e1 || e2);
    showToast('Couldn\u2019t reorder \u2014 try again.', { danger: true });
    await loadAndRender();
  }
}

function handleAddClick(btn) {
  const key = btn.dataset.add;
  const [section, category] = key.split('.');

  const addRow = btn.closest('.add-item-row');
  const existing = addRow.previousElementSibling;
  if (existing && existing.matches('.item-editor[data-new="true"]')) {
    existing.querySelector('input[name="name"]').focus();
    return;
  }

  closeAllEditors();
  const form = renderNewRowEditor(section, category);
  addRow.before(form);
  form.querySelector('input[name="name"]').focus();
}

async function handleSaveNew(e, form, section, category) {
  e.preventDefault();
  const values = readFormValues(form);
  if (values === null) return;

  const list = itemsFor(section, category);
  const nextSort = list.length ? Math.max(...list.map((i) => i.sort_order)) + 10 : 0;
  const saveBtn = form.querySelector('button[type="submit"]');

  setSaving(saveBtn, true, 'Add to menu');
  const { data, error } = await client
    .from(TABLE)
    .insert({ section, category, sort_order: nextSort, ...values })
    .select()
    .single();
  setSaving(saveBtn, false, 'Add to menu');

  if (error) {
    console.error(error);
    showToast('Couldn\u2019t add that item \u2014 try again.', { danger: true });
    return;
  }

  items.push(data);
  replaceChapter(section, category);
  showToast(`Added ${data.name}.`);
}

// Re-renders one chapter in place and (re)binds only its own listeners —
// the shared fix behind delete / reorder / add-new all staying cheap even
// after many edits in a long session.
function replaceChapter(section, category) {
  const key = chapterKey(section, category);
  const chapterEl = els.ledger.querySelector(`.chapter[data-key="${key}"]`);
  if (!chapterEl) return;
  chapterEl.outerHTML = renderChapter(findChapterMeta(section, category));
  bindChapterEvents(els.ledger.querySelector(`.chapter[data-key="${key}"]`));
}

// ---------------------------------------------------------------------------
// Wire-up
// ---------------------------------------------------------------------------

els.loginForm.addEventListener('submit', handleLogin);
els.signOut.addEventListener('click', handleSignOut);
els.retryLoad.addEventListener('click', loadAndRender);

if (initClient()) {
  client.auth.onAuthStateChange((_event, session) => {
    session ? showSignedIn(session) : showSignedOut();
  });
}
