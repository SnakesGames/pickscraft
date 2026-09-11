// Shared SVG icon set, used instead of emoji so icons render
// consistently across OS/browsers and can be recolored via currentColor.
const Icons = {
  leaf:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 20A7 7 0 0 1 4 13c0-4 4-9 8-11 4 2 8 7 8 11a7 7 0 0 1-7 7"/><path d="M11 20v-9"/></svg>',
  sword:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m14.5 17.5 3-3L21 18l-3.5 3.5z"/><path d="M13 15 4 6l2-2 9 9"/><path d="m6 4-2 2"/></svg>',
  shield:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5z"/></svg>',
  crown:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18h18l-1.5-8-4.5 3-3-6-3 6-4.5-3z"/></svg>',
  megaphone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11v3a1 1 0 0 0 1 1h2l4 5V6L6 9H4a1 1 0 0 0-1 2"/><path d="M15 7a4 4 0 0 1 0 10"/><path d="M18 5a8 8 0 0 1 0 14"/></svg>',
  chat:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  'life-ring':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m4.9 4.9 4.2 4.2M14.9 14.9l4.2 4.2M19.1 4.9l-4.2 4.2M9.1 14.9l-4.2 4.2"/></svg>',
  hammer:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 12-8.5 8.5a1.5 1.5 0 0 1-2-2L13 10"/><path d="M17.5 6.5 20 4l-2-2-2.5 2.5L14 6l2 2z"/></svg>',
  key:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="15" r="4"/><path d="m10.5 12.5 8-8L21 7l-2.5 2.5L21 12l-2.5 2.5"/></svg>',
  coin:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5-1.3 2-3 2.5-3 1.1-3 2.5 1.3 2.5 3 2.5 3-1.1 3-2.5"/></svg>',
  bolt:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 3 14h8l-1 8 10-12h-8z"/></svg>',
  gift:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="13" rx="1"/><path d="M3 8h18M12 8v13M7.5 8a2.5 2.5 0 1 1 0-5C9.5 3 12 5 12 8M16.5 8a2.5 2.5 0 1 0 0-5C14.5 3 12 5 12 8"/></svg>',
  fire:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c4 0 7-2.5 7-6.5C19 12 16 9 15 6c-.5 2-2 3-2 3 0-3-1.5-5.5-4-7-.5 3-2 5-3.5 7.5C4.5 11.5 4 14 4 15.5 4 19.5 8 22 12 22"/></svg>',
  star:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3 1.2-6.9-5-4.9 6.9-1z"/></svg>',
  gear:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1"/></svg>',
  target:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>',
  moon:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5"/></svg>',
  trophy:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 4h8v6a4 4 0 0 1-8 0z"/><path d="M8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M9 20h6M12 15v5"/></svg>',
  lock:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="10" rx="1"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  check:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 5 5 9-9"/></svg>',
  close:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  warning:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/></svg>',
  globe:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18"/></svg>',
  user:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/></svg>',
  save:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4h11l3 3v13H5z"/><path d="M8 4v6h8V4M8 21v-6h8v6"/></svg>',
  chart:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M12 20V4M20 20v-7"/><path d="M2 20h20"/></svg>',
  scroll:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 4h11v14a2 2 0 0 1-2 2H7"/><path d="M7 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2M7 9h8M7 13h8"/></svg>',
  refresh:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v6h6M20 20v-6h-6"/><path d="M5.5 9A7 7 0 0 1 19 8M18.5 15A7 7 0 0 1 5 16"/></svg>',
  ballot:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="9" width="16" height="12" rx="1"/><path d="M9 9V6a3 3 0 0 1 6 0v3M9 14l2 2 4-4"/></svg>',
  'door-exit':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M14 4 7 5v14l7 1M14 4v16"/><path d="m20 12-3-3m3 3-3 3m3-3H10"/></svg>',
  gem:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18M9 3l3 6-3 12M15 3l-3 6 3 12"/></svg>',
  link:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 15 15 9"/><path d="M11 7l1.5-1.5a3.5 3.5 0 1 1 5 5L16 12M13 17l-1.5 1.5a3.5 3.5 0 1 1-5-5L8 12"/></svg>',
  tools:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 5.5 18 2l4 4-3.5 3.5M9 15l-6 6M9 15 6 12l7-7 3 3z"/></svg>',
  island:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 19c2-1 4-1 6 0s4 1 6 0 4-1 6 0"/><path d="M12 15V6M12 6c2 0 4 1 5 3-3 1-7 1-10 0 1-2 3-3 5-3"/></svg>',
  cart:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 4h2l2.5 12h11L21 8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>',
  wave:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 12V6a2 2 0 1 1 4 0v5M12 11V4a2 2 0 1 1 4 0v7M16 10a2 2 0 1 1 4 0v4a7 7 0 0 1-7 7h-1a7 7 0 0 1-6.3-4L4 12.5A1.7 1.7 0 0 1 7 11l1 1.5"/></svg>',
  spade:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3c3 4 8 7 8 11a5 5 0 0 1-8 4 5 5 0 0 1-8-4c0-4 5-7 8-11"/><path d="M12 18v3"/></svg>',
  castle:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 21V9l2-2V5h2v2l2-2v2l2-2v2l2-2v2l2 2v2l2 2v12z"/><path d="M4 21h16M8 21v-5h3v5m2-5h3v5"/></svg>',
};

function icon(name, cls = '') {
  if (name && Icons[name]) return `<span class="icon ${cls}">${Icons[name]}</span>`;
  return `<span class="icon ${cls}">${name || Icons.star}</span>`;
}

'use strict';

let RC = {
  serverName: 'Pickscraft',
  serverIP:   'play.pickscraft.net',
  discord:    'https://discord.gg/',
  tagline:    'The ultimate minecraft network.',
};

// NAV HTML
function buildNav(activeId) {
  const pages = [
    { id:'home',   href:'index.html',  label:'Home'   },
    { id:'play',   href:'play.html',   label:'Play'   },
    { id:'store',  href:'store.html',  label:'Store'  },
    { id:'vote',   href:'vote.html',   label:'Vote'   },
    { id:'forums', href:'forums.html', label:'Forums' },
    // { id:'profile', href:'player.html', label:'Profile' },
    { id:'staff',  href:'staff.html',  label:'Staff'  },
  ];
  return `
  <nav class="navbar" id="navbar">
    <div class="nav-inner">
      <a href="index.html" class="nav-logo">
        <div class="nav-logo-mark" id="nav-logo-mark">RC</div>
        <span id="nav-server-name">${RC.serverName}</span>
      </a>
      <div class="nav-links">
        ${pages.map(p => `<a href="${p.href}" class="nav-link ${activeId===p.id?'active':''}">${p.label}</a>`).join('')}
      </div>
      <div class="nav-right">
        <div class="nav-ip-pill" id="nav-status-pill">
          <span class="live-dot" id="nav-status-dot"></span>
          <span class="nav-ip-val" id="nav-ip-val">${RC.serverIP}</span>
          <button class="btn-copy" onclick="copyIP()" title="Copy IP">⧉</button>
        </div>
        <a href="store.html" class="btn-play">▶ Play Now</a>
        <button class="hamburger" onclick="toggleMob()" aria-label="Menu">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>
    <div class="mob-menu" id="mob-menu">
      ${pages.map(p => `<a href="${p.href}" class="nav-link ${activeId===p.id?'active':''}">${p.label}</a>`).join('')}
      <a href="store.html" class="nav-link" style="color:var(--jade)">▶ Play Now</a>
    </div>
  </nav>`;
}

// FOOTER HTML
function buildFooter() {
  return `
  <footer>
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="nav-logo" style="margin-bottom:0">
          <div class="nav-logo-mark" id="footer-logo-mark">RC</div>
          <span id="footer-name" style="font-size:1.05rem">${RC.serverName}</span>
        </div>
        <p id="footer-tagline">${RC.tagline}</p>
        <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">
          <a id="footer-discord" href="${RC.discord}" class="btn btn-ghost" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;font-size:.75rem">
            <!-- Discord Icon -->
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            Discord
          </a>
          
          <a href="store.html" class="btn btn-ghost" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;font-size:.75rem">
            <!-- Shopping Cart Icon -->
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="8" cy="21" r="1"></circle>
              <circle cx="19" cy="21" r="1"></circle>
              <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path>
            </svg>
            Store
          </a>
        </div>
      </div>
      <div class="footer-col">
        <h4>Navigate</h4>
        <a href="index.html">Home</a>
        <a href="play.html">Game Modes</a>
        <a href="store.html">Store</a>
        <a href="vote.html">Vote</a>
        <a href="forums.html">Forums</a>
      </div>
      <div class="footer-col">
        <h4>Community</h4>
        <a id="footer-discord-2" href="${RC.discord}">Discord Server</a>
        <a href="forums.html">Forums</a>
        <a href="#">Staff Team</a>
        <a href="#">Appeals</a>
        <a href="#">Bug Reports</a>
      </div>
      <div class="footer-col">
        <h4>Info</h4>
        <a href="#">Server Rules</a>
        <a href="#">Privacy Policy</a>
        <a href="#">Terms of Service</a>
        <a href="#">Contact</a>
        <a href="#">EULA</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© 2026 <span id="footer-copy-name">${RC.serverName}</span> · By PathumDH (Kraken Hive Labs)</span>
      <span style="display:flex;align-items:center;gap:8px">
        <span class="live-dot"></span>
        <span id="footer-ip" style="font-family:var(--f-mono);font-size:.7rem;color:var(--jade)">${RC.serverIP}</span>
      </span>
    </div>
    <div class="footer-stripe"></div>
  </footer>`;
}

// INIT PAGE
async function initPage(activeId) {
  // Inject nav + footer immediately with fallback values
  const navMount  = document.getElementById('nav-mount');
  const footMount = document.getElementById('footer-mount');
  if (navMount)  navMount.innerHTML  = buildNav(activeId);
  if (footMount) footMount.innerHTML = buildFooter();

  // Nav scroll
  window.addEventListener('scroll', () => {
    document.getElementById('navbar')?.classList.toggle('scrolled', scrollY > 40);
  }, { passive:true });

  // Scroll reveal
  initReveal();

  // Load live config — update all dynamic text once it arrives
  try {
    const { data: cfg } = await API.cachedConfig();
    applyConfig(cfg);
  } catch { /* keep fallback values */ }

  // Load live MC status for the navbar indicator
  refreshNavStatus();
  setInterval(refreshNavStatus, 60_000); // refresh every 60s
}

// APPLY CONFIG
function applyConfig(cfg) {
  if (!cfg) return;
  const s = cfg.server || {};

  // Update RC so copyIP() uses the real value
  RC.serverName = s.name    || RC.serverName;
  RC.serverIP   = s.ip      || RC.serverIP;
  RC.discord    = s.discord || RC.discord;
  RC.tagline    = s.tagline || RC.tagline;

  if (s.logoUrl) {
    for (const id of ['nav-logo-mark', 'footer-logo-mark']) {
      const el = document.getElementById(id);
      if (el) {
        el.style.background = 'none';
        el.style.clipPath = 'none';
        el.style.boxShadow = 'none';
        el.innerHTML = `<img src="${s.logoUrl}" alt="${RC.serverName} logo" style="width:100%;height:100%;object-fit:contain;border-radius:inherit"/>`;
      }
    }
  }

  // Set the browser tab icon from config. faviconUrl takes priority.
  const faviconSrc = s.faviconUrl || s.logoUrl;
  if (faviconSrc) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = faviconSrc;
  }

  // Update every element that shows server info
  setEl('nav-server-name',   RC.serverName);
  setEl('footer-name',       RC.serverName);
  setEl('footer-copy-name',  RC.serverName);
  setEl('footer-tagline',    RC.tagline);
  setEl('footer-ip',         RC.serverIP);
  setEl('nav-ip-val',        RC.serverIP);

  const disc = cfg.server?.discord;
  if (disc) {
    const d1 = document.getElementById('footer-discord');
    const d2 = document.getElementById('footer-discord-2');
    if (d1) d1.href = disc;
    if (d2) d2.href = disc;
  }

  // CSS theme overrides
  const t = cfg.theme || {};
  if (t.accentJade)  document.documentElement.style.setProperty('--jade',  t.accentJade);
  if (t.accentAmber) document.documentElement.style.setProperty('--amber', t.accentAmber);
  if (t.accentIce)   document.documentElement.style.setProperty('--ice',   t.accentIce);
  if (t.bgVoid)      document.documentElement.style.setProperty('--void',  t.bgVoid);

  // Announcement bar
  const ann = cfg.announcement || {};
  let annBar = document.getElementById('ann-bar');
  if (ann.enabled && ann.text) {
    if (!annBar) {
      annBar = document.createElement('div');
      annBar.id = 'ann-bar';
      document.body.insertAdjacentElement('afterbegin', annBar);
    }
    const colors = { info:'rgba(0,229,160,.1)', warning:'rgba(255,140,0,.1)', error:'rgba(255,63,91,.1)' };
    const borders = { info:'rgba(0,229,160,.3)', warning:'rgba(255,140,0,.3)', error:'rgba(255,63,91,.3)' };
    const textCol = { info:'var(--jade)', warning:'var(--amber)', error:'var(--red)' };
    const type = ann.type || 'info';
    annBar.style.cssText = `
      position:fixed;top:64px;left:0;right:0;z-index:99;
      padding:10px clamp(1rem,4vw,3rem);
      background:${colors[type]||colors.info};
      border-bottom:1px solid ${borders[type]||borders.info};
      display:flex;align-items:center;justify-content:center;gap:12px;
      font-size:.8rem;font-weight:600;color:${textCol[type]||textCol.info};
      backdrop-filter:blur(10px);
    `;
    annBar.innerHTML = `
      <span>${icon('megaphone')}</span>
      <span>${ann.text}</span>
      <button onclick="this.parentElement.remove()"
        style="margin-left:auto;background:none;border:none;cursor:pointer;color:inherit;opacity:.6;font-size:1rem;">${icon('close')}</button>
    `;
  }
}

// LIVE SERVER STATUS IN NAV
async function refreshNavStatus() {
  try {
    const { data } = await API.cachedStatus();
    const dot = document.getElementById('nav-status-dot');
    if (dot) {
      dot.style.background = data.online ? 'var(--jade)'   : '#ff3f5b';
      dot.style.boxShadow  = data.online ? '0 0 8px var(--jade)' : '0 0 8px #ff3f5b';
    }
    // Show live count in nav if online
    const ipEl = document.getElementById('nav-ip-val');
    if (ipEl && data.online && data.players.online > 0) {
      ipEl.title = `${data.players.online}/${data.players.max} online`;
    }
  } catch { /* silent */ }
}

// COPY IP
function copyIP() {
  navigator.clipboard.writeText(RC.serverIP)
    .then(() => showToast(`Copied: ${RC.serverIP}`, '⧉'))
    .catch(() => showToast('Copy failed — select manually.', Icons.warning));
}

// MOBILE MENU
function toggleMob() { document.getElementById('mob-menu')?.classList.toggle('open'); }

// TOAST
let _toastT = null;
function showToast(msg, iconHtml=Icons.check, dur=2800) {
  let el = document.getElementById('rc-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'rc-toast';
    el.className = 'toast';
    el.innerHTML = `<span class="toast-icon icon" id="rc-toast-icon"></span><span id="rc-toast-msg"></span>`;
    document.body.appendChild(el);
  }
  document.getElementById('rc-toast-icon').innerHTML = iconHtml;
  document.getElementById('rc-toast-msg').textContent  = msg;
  el.classList.add('show');
  clearTimeout(_toastT);
  _toastT = setTimeout(() => el.classList.remove('show'), dur);
}

// SCROLL REVEAL
function initReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold:0.07, rootMargin:'0px 0px -16px 0px' });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

// COUNT UP
function countUp(el, target, dur=1200) {
  if (!el) return;
  const step = target / (dur / 16); let cur = 0;
  const tick = () => { cur = Math.min(cur+step,target); el.textContent = Math.round(cur).toLocaleString(); if(cur<target) requestAnimationFrame(tick); };
  tick();
}

// BAR ANIMATION
function animateBar(id, pct, delay=400) {
  setTimeout(() => { const el=document.getElementById(id); if(el) el.style.width=pct+'%'; }, delay);
}

// DOM HELPER
function setEl(id, val) { const el=document.getElementById(id); if(el) el.textContent=String(val||''); }