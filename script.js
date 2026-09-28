// Render the text menu sections from a MENU_ITEMS-shaped
// object: { food: { popular: [...], pizza: [...] }, drinks: { ... } }.
// That object now comes from Supabase (see loadMenuItems below) instead of
// a hardcoded file — a <section class="menu-popular" data-title="…"
// data-menu="food.popular" …> is all a page needs either way.
function renderMenus(menuItems){
  const money = (price, nested) => nested ? `${price}<span>ден</span>` : `${price}ден`;

  const getMenuList = (path) =>
    path.split('.').reduce((data, key) => data && data[key], menuItems);

  const renderMenuItem = ({ name, price, description }, nested) => `
    <div class="menu-item">
      <h3>${name}</h3>
      <span class="item-price">${money(price, nested)}</span>
      ${description ? `<span class="item-desc">${description}</span>` : ''}
    </div>`;

  document.querySelectorAll('.menu-popular[data-title]').forEach(section => {
    const { title, img, imgAlt, caption, menu, currencyNested, tagline } = section.dataset;
    const items = menu ? (getMenuList(menu) || []) : [];

    const popularImg = img
      ? `<div class="popular-img"><img src="${img}" alt="${imgAlt || ''}" loading="lazy" decoding="async"><p>${caption || ''}</p></div>`
      : '';

    // Each section can set its own line under the title via data-tagline.
    // Omit the attribute to keep the default text below, or set data-tagline="" for none.
    const taglineText = tagline ?? 'to begin the tale';

    section.innerHTML = `
      ${popularImg}
      <div class="menu-head">
        <h2>${title}</h2>
        <span></span>
        ${taglineText ? `<p>${taglineText}</p>` : ''}
      </div>
      <span class="start-the-menu"></span>
      ${items.map(item => renderMenuItem(item, currencyNested === 'true')).join('')}`;
  });
}

// The drinks photo gallery is plain markup in drinks.html (each .photo-drink
// carries its own image path in data-bg) — no database involved. These photos
// are heavy, so each one is only fetched once it's about to scroll into view.
function initGalleryImages(){
  const photoEls = document.querySelectorAll('.drink-gallery .photo-drink[data-bg]');
  if (!photoEls.length) return;

  const load = (el) => el.style.setProperty('--photo-bg', `url('${el.dataset.bg}')`);

  if ('IntersectionObserver' in window) {
    const lazyBg = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        load(entry.target);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '200px 0px' });
    photoEls.forEach(el => lazyBg.observe(el));
  } else {
    photoEls.forEach(load);
  }
}

// Shown the instant the page loads, before the Supabase fetch resolves, so
// visitors see something other than blank sections.
function showLoadingState(){
  document.querySelectorAll('.menu-popular[data-title]').forEach(section => {
    section.innerHTML = `
      <div class="menu-head">
        <h2>${section.dataset.title}</h2>
        <span></span>
      </div>
      <p class="menu-loading">Loading menu…</p>`;
  });
}

// ---------------------------------------------------------------------------
// Menu data: cache/fallback-first, so weak mobile connections never block
// the first paint of the menu on a live database round-trip.
//
// Strategy on every page load:
//   1. Render instantly from whatever we have for free — the last menu we
//      successfully fetched (cached in localStorage), or the bundled
//      FALLBACK_MENU_ITEMS on a first-ever visit. Zero network cost.
//   2. Kick off the real menu fetch in the background, trying two live
//      sources in order (see fetchLiveMenu). If it comes back with
//      something different, quietly swap it in. If both fail (offline,
//      Supabase down, weak signal timing out), the visitor never even
//      notices — they're already looking at a perfectly good menu.
// ---------------------------------------------------------------------------

const MENU_CACHE_KEY = 'voi_menu_cache_v1';

// Bump this if the cached shape ever changes (e.g. a new field renderMenus()
// starts relying on). A mismatched version is treated as no cache at all,
// rather than handing renderMenus() something it doesn't understand.
const MENU_CACHE_SCHEMA = 2; // 2: images are no longer part of the menu data

// How long a single request is allowed to hang before we give up on it.
// Doesn't affect first paint (that already happens from cache/fallback
// before any of this starts) — it just stops a stalled request on a bad
// connection from sitting open indefinitely.
const FETCH_TIMEOUT_MS = 8000;

// A small JSON file kept in sync with menu_items automatically — a Database
// Webhook fires the "sync-menu-snapshot" Edge Function on every insert/
// update/delete, which rewrites this file within a few seconds. Unlike
// menu-data.js, nothing here ever needs a manual redeploy: it's live data,
// not a bundled file, so a brand-new visitor's very first page load can get
// an accurate menu without waiting on a full database round-trip. See the
// Edge Function setup notes for how this is wired up.
const MENU_SNAPSHOT_URL = () => `${SUPABASE_URL}/storage/v1/object/public/menu-cache/menu.json`;

// Reads the last menu we successfully fetched. Returns null if there's
// nothing cached yet, it's from an old schema, or storage isn't available
// (private browsing, storage disabled, quota issues) — callers just fall
// back gracefully.
function getCachedMenu(){
  try {
    const raw = localStorage.getItem(MENU_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schema !== MENU_CACHE_SCHEMA || !parsed.data) return null;
    return parsed.data;
  } catch (err) {
    return null;
  }
}

function setCachedMenu(data){
  try {
    localStorage.setItem(MENU_CACHE_KEY, JSON.stringify({ schema: MENU_CACHE_SCHEMA, data, cachedAt: Date.now() }));
  } catch (err) {
    // Storage full/unavailable — not worth failing the page over, just skip it.
  }
}

// Fast path: a single small JSON file over plain fetch — no client library,
// no auth headers, no database round-trip. Throws on anything that isn't a
// clean 200 with real data, so the caller falls through to the slower but
// always-authoritative direct query below.
async function fetchMenuFromSnapshot(){
  if (typeof SUPABASE_URL === 'undefined' || SUPABASE_URL.includes('YOUR-PROJECT')) {
    throw new Error('supabase-config.js has not been filled in yet');
  }
  const res = await fetch(MENU_SNAPSHOT_URL(), {
    cache: 'no-store',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Snapshot request failed: ${res.status}`);
  const menuItems = await res.json();
  if (!menuItems || Object.keys(menuItems).length === 0) throw new Error('Snapshot was empty');
  return menuItems;
}

// Tries the fast snapshot first, falls through to the direct table query if
// that fails for any reason (snapshot not set up yet, briefly out of sync,
// storage hiccup, etc.) — either way the caller just gets a menu or a
// clear failure, never has to know which source actually answered.
async function fetchLiveMenu(){
  try {
    return await fetchMenuFromSnapshot();
  } catch (err) {
    console.warn('Menu snapshot unavailable, trying the direct query:', err.message);
    return await fetchMenuFromSupabase();
  }
}

// Pure Supabase fetch — throws on any failure instead of silently falling
// back, so callers can decide for themselves what "failure" should mean.
// Reshapes rows into the { section: { category: [items] } } tree
// renderMenus() expects — the same shape the old menu-data.js exported by hand.
async function fetchMenuFromSupabase(){
  if (typeof supabase === 'undefined') {
    throw new Error('Supabase client library did not load');
  }
  if (typeof SUPABASE_URL === 'undefined' || SUPABASE_URL.includes('YOUR-PROJECT')) {
    throw new Error('supabase-config.js has not been filled in yet');
  }

  const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await client
    .from('menu_items')
    .select('*')
    .order('sort_order', { ascending: true })
    // If AbortSignal.timeout isn't supported by an ancient browser, this
    // throws synchronously and init()'s try/catch falls back the same way
    // a network failure would — never a reason to skip the timeout.
    .abortSignal(AbortSignal.timeout(FETCH_TIMEOUT_MS));

  if (error) throw error;
  if (!data || data.length === 0) throw new Error('menu_items table is empty');

  const menuItems = {};
  data.forEach(row => {
    (menuItems[row.section] ??= {});
    (menuItems[row.section][row.category] ??= []).push({
      name: row.name,
      price: row.price,
      description: row.description,
    });
  });
  return menuItems;
}

// Menu nav arrow scrolling
function menuArrow(){
  const menuNav = document.querySelector('.menu-nav');
  const arrowLeft = document.querySelector('.menu-nav-arrow-left');
  const arrowRight = document.querySelector('.menu-nav-arrow-right');

  const SCROLL_AMOUNT = 150;

  if (menuNav && arrowLeft && arrowRight) {
    arrowLeft.addEventListener('click', () => {
      menuNav.scrollBy({ left: -SCROLL_AMOUNT, behavior: 'smooth' });
    });

    arrowRight.addEventListener('click', () => {
      menuNav.scrollBy({ left: SCROLL_AMOUNT, behavior: 'smooth' });
    });

    // Disable/fade arrows at scroll limits
    const updateArrowState = () => {
      const maxScroll = menuNav.scrollWidth - menuNav.clientWidth;

      // Everything fits (tablet/desktop): no arrows needed, centre the links.
      const wrap = menuNav.closest('.menu-nav-wrap');
      if (wrap) wrap.classList.toggle('is-static', maxScroll <= 1);

      arrowLeft.style.opacity = menuNav.scrollLeft <= 0 ? '0.3' : '1';
      arrowLeft.style.pointerEvents = menuNav.scrollLeft <= 0 ? 'none' : 'auto';

      arrowRight.style.opacity = menuNav.scrollLeft >= maxScroll - 1 ? '0.3' : '1';
      arrowRight.style.pointerEvents = menuNav.scrollLeft >= maxScroll - 1 ? 'none' : 'auto';
    };

    menuNav.addEventListener('scroll', updateArrowState);
    window.addEventListener('resize', updateArrowState);
    updateArrowState(); // run once on load
  }
}

// Randomized background circles for the menu section
function randomizedBg(){
  const circleContainer = document.querySelector('.menu-bg-circles');
  const menuSection = document.querySelector('#menu');

  if (circleContainer && menuSection) {
    const CIRCLE_COUNT = Math.min(22, Math.max(10, Math.round(window.innerWidth / 70)));
    const MIN_SIZE = 60;
    const MAX_SIZE = 320;

    for (let i = 0; i < CIRCLE_COUNT; i++) {
      const circle = document.createElement('span');

      const size = Math.random() * (MAX_SIZE - MIN_SIZE) + MIN_SIZE;
      const top = Math.random() * 100;
      const left = Math.random() * 100;
      const opacity = Math.random() * 0.5 + 0.2;

      circle.style.width = `${size}px`;
      circle.style.height = `${size}px`;
      circle.style.top = `${top}%`;
      circle.style.left = `${left}%`;
      circle.style.opacity = opacity;

      circleContainer.appendChild(circle);
    }

    const PARALLAX_FACTOR = 0.4;
    let ticking = false;

    function updateParallax() {
      const rect = menuSection.getBoundingClientRect();
      // rect.top is how far #menu's top is from the viewport top (negative once scrolled past)
      const drift = -rect.top * (1 - PARALLAX_FACTOR);
      circleContainer.style.transform = `translateY(${drift}px)`;
      ticking = false;
    }

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.addEventListener('scroll', () => {
        if (!ticking) {
          requestAnimationFrame(updateParallax);
          ticking = true;
        }
      }, { passive: true });
    }

    updateParallax(); // set initial position
  }
}

// Menu search
function search(){
  const searchToggle = document.getElementById('search-toggle');
  const searchPanel = document.getElementById('menu-search-panel');
  const searchInput = document.getElementById('menu-search-input');
  const searchClose = document.getElementById('search-close');
  const searchEmpty = document.getElementById('search-empty');
  const menuSection = document.getElementById('menu');

  if (searchToggle && searchPanel && searchInput) {

    function openSearch() {
      searchPanel.hidden = false;
      requestAnimationFrame(() => searchPanel.classList.add('is-open'));
      searchToggle.setAttribute('aria-expanded', 'true');
      searchInput.focus();
    }

    function closeSearch() {
      searchPanel.classList.remove('is-open');
      searchToggle.setAttribute('aria-expanded', 'false');
      searchInput.value = '';
      filterMenuItems('');
      setTimeout(() => { searchPanel.hidden = true; }, 200); // matches CSS transition
    }

    function toggleSearch() {
      const isOpen = searchToggle.getAttribute('aria-expanded') === 'true';
      isOpen ? closeSearch() : openSearch();
    }

    let hasScrolledToResults = false;

    function filterMenuItems(query) {
      const normalized = query.trim().toLowerCase();
      let totalVisible = 0;

      document.querySelectorAll('.menu-popular[data-title]').forEach(section => {
        let sectionVisible = 0;

        // Filter individual menu items by their name
        section.querySelectorAll('.menu-item').forEach(item => {
          const name =
            item.querySelector('h3')?.textContent.trim().toLowerCase() || '';

          const matches =
            normalized === '' || name.includes(normalized);

          item.classList.toggle('is-hidden', !matches);

          if (matches) {
            sectionVisible++;
          }
        });

        // Section-level search keyword
        const searchText =
          section.dataset.search?.trim().toLowerCase() || '';

        const dataSearchMatches =
          normalized === '' || searchText.includes(normalized);

        const image = section.querySelector('img');

        // Not every section has a photo (the drinks page's don't).
        if (image) {
          image.style.display = dataSearchMatches ? "block" : "none";
        }
          
        const sectionMatches =
          normalized === '' ||
          dataSearchMatches ||
          sectionVisible > 0;

        section.classList.toggle('is-hidden', !sectionMatches);

        // Optional: if the section itself matched but no item matched,
        // you may want all its items visible.
        if (dataSearchMatches && normalized !== '') {
          section.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('is-hidden');
          });

          sectionVisible = section.querySelectorAll('.menu-item').length;
        }

        totalVisible += sectionVisible;
      });

      // Gallery — same idea, name-only, hide the whole gallery if none match.
      const gallery = document.querySelector('.drink-gallery');
      if (gallery) {
        let galleryVisible = 0;

        gallery.querySelectorAll('.photo-drink').forEach(photo => {
          const name = photo.querySelector('h3')?.textContent.toLowerCase() || '';
          const matches = normalized === '' || name.includes(normalized);

          photo.classList.toggle('is-hidden', !matches);
          if (matches) galleryVisible++;
        });

        gallery.classList.toggle('is-hidden', normalized !== '' && galleryVisible === 0);
        totalVisible += galleryVisible;
      }

      searchEmpty.hidden = normalized === '' || totalVisible > 0;

      if (normalized !== '' && !hasScrolledToResults) {
        menuSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        hasScrolledToResults = true;
      }
      if (normalized === '') hasScrolledToResults = false;
    }

    searchToggle.addEventListener('click', toggleSearch);
    searchToggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleSearch();
      }
    });

    searchClose.addEventListener('click', closeSearch);
    searchInput.addEventListener('input', (e) => filterMenuItems(e.target.value));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchToggle.getAttribute('aria-expanded') === 'true') {
        closeSearch();
      }
    });

    document.addEventListener('click', (e) => {
      const isOpen = searchToggle.getAttribute('aria-expanded') === 'true';
      if (isOpen && !searchPanel.contains(e.target) && !searchToggle.contains(e.target)) {
        closeSearch();
      }
    });
  }
}

function detectSection(){
  const sections = Array.from(document.querySelectorAll('#menu > section[id]'));
  const links = document.querySelectorAll('.menu-nav a[href^="#"]');

  if (!sections.length || !links.length) return;

  window.addEventListener("scroll", () => {
    let current = "";

    sections.forEach((section) => {
      if (section.getBoundingClientRect().top <= 150) {
        current = section.id;
      }
    });

    links.forEach((link) => {
      const isActive = link.getAttribute('href') === `#${current}`;
      link.style.color = isActive ? "#f5f1ea" : "#b8b0a2";
    });
  });
}

// Header background on scroll, and hide the sticky category pill while it would
// sit on top of the drinks photo gallery. Measured from the real layout, so it
// keeps working at every screen size (the old version used fixed scroll offsets).
function headerAndPill(){
  const header = document.querySelector('header');
  const pill = document.querySelector('.menu-nav-wrap');
  const gallery = document.querySelector('.drink-gallery');
  let ticking = false;

  function update(){
    ticking = false;
    header.classList.toggle('scrolledHeader', window.scrollY >= 70);

    if (pill && gallery) {
      // the slot the pill sticks in, independent of its own hide transform
      const slotTop = header.offsetHeight + 6;
      const slotBottom = slotTop + pill.offsetHeight;
      const g = gallery.getBoundingClientRect();
      pill.classList.toggle('is-hidden', g.top < slotBottom && g.bottom > slotTop);
    }
  }

  const onScroll = () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
}

// Hamburger menu (phones + tablets; the CSS shows the links inline from 900px up)
function mobileNav(){
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('site-nav');
  if (!toggle || !nav) return;

  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  };

  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });

  document.addEventListener('click', (e) => {
    if (!nav.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });

  window.matchMedia('(min-width: 900px)').addEventListener('change', (e) => {
    if (e.matches) setOpen(false);
  });
}

// Entry point. Layout-measuring setup (menuArrow, headerAndPill) runs after
// renderMenus() has filled in the real content, so it measures final sizes
// instead of the empty/loading placeholders.
async function init(){
  // Render instantly from cache or the bundled fallback — no network wait.
  const initialMenu = getCachedMenu()
    || (typeof FALLBACK_MENU_ITEMS !== 'undefined' ? FALLBACK_MENU_ITEMS : null);

  if (initialMenu) {
    renderMenus(initialMenu);
  } else {
    // Only reachable if this is a first-ever visit AND menu-data.js failed
    // to load — genuinely nothing to show yet.
    showLoadingState();
  }

  initGalleryImages();
  menuArrow();
  randomizedBg();
  search();
  detectSection();
  headerAndPill();
  mobileNav();

  // Now fetch the live menu in the background. A weak or slow connection
  // just means this takes longer — it never blocks what the visitor already
  // sees above.
  try {
    const liveMenu = await fetchLiveMenu();
    setCachedMenu(liveMenu);

    // Don't yank the menu out from under someone mid-search.
    const searchInput = document.getElementById('menu-search-input');
    const searchIsActive = searchInput && searchInput.value.trim() !== '';

    if (!searchIsActive && JSON.stringify(liveMenu) !== JSON.stringify(initialMenu)) {
      renderMenus(liveMenu);
    }
  } catch (err) {
    console.warn('Live menu fetch failed, staying on cached/fallback menu:', err.message);
    if (!initialMenu) {
      renderMenus(typeof FALLBACK_MENU_ITEMS !== 'undefined' ? FALLBACK_MENU_ITEMS : {});
    }
  }
}

init();
