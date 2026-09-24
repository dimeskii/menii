// Render menu sections + the drinks photo gallery from MENU_ITEMS (see menu-data.js).
// A <section class="menu-popular" data-title="…" data-menu="food.popular" …> is all
// a page needs — no more hand-written .menu-item markup per dish/drink.
function renderMenus(){
  const money = (price, nested) => nested ? `${price}<span>ден</span>` : `${price}ден`;

  const getMenuList = (path) =>
    path.split('.').reduce((data, key) => data && data[key], MENU_ITEMS);

  const renderMenuItem = ({ name, price, desc }, nested) => `
    <div class="menu-item">
      <h3>${name}</h3>
      <span class="item-price">${money(price, nested)}</span>
      <span class="item-desc">${desc}</span>
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

  const gallery = document.querySelector('.drink-gallery[data-gallery]');
  if (gallery) {
    const items = getMenuList(gallery.dataset.gallery) || [];
    gallery.innerHTML = items.map(({ name, price, image }) => `
      <div class="photo-drink" data-bg="${image}">
        <h3>${name}</h3>
        <span class="photo-item-price">${price}<span>ден</span></span>
      </div>`).join('');

    // These background photos are heavy — only fetch each one once it's about
    // to scroll into view, instead of downloading all 4 upfront.
    const photoEls = gallery.querySelectorAll('.photo-drink');
    if ('IntersectionObserver' in window) {
      const lazyBg = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.style.setProperty('--photo-bg', `url('${entry.target.dataset.bg}')`);
          observer.unobserve(entry.target);
        });
      }, { rootMargin: '200px 0px' });
      photoEls.forEach(el => lazyBg.observe(el));
    } else {
      photoEls.forEach(el => el.style.setProperty('--photo-bg', `url('${el.dataset.bg}')`));
    }
  }
}

renderMenus();

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

menuArrow();

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

randomizedBg();

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

        if (!dataSearchMatches) {
          image.style.display = "none";
        }
        else if (dataSearchMatches) {
          image.style.display = "block";
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

search();

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

detectSection();


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

headerAndPill();

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

mobileNav();
