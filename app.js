// View router — switches between the home (station picker) and station
// views without ever reloading the page, so player.js's YT.Player instance
// (and whatever's playing) survives the switch untouched.

const appEls = {
  viewHome: document.getElementById("view-home"),
  viewStation: document.getElementById("view-station"),
  stationsGrid: document.getElementById("stations-grid"),
  headerLeft: document.getElementById("header-left"),
  headerRight: document.getElementById("header-right"),
  player: document.getElementById("player"),
  heroBg: document.getElementById("hero-bg"),
  heroSignage: document.getElementById("hero-signage"),
  stationEyebrow: document.getElementById("station-eyebrow"),
  stationName: document.getElementById("station-name"),
  stationTagline: document.getElementById("station-tagline"),
  footerStationTag: document.getElementById("footer-station-tag"),
  fxPulse: document.getElementById("fx-pulse"),
};

let hasEverLoadedAStation = false;

function findStation(id) {
  return STATIONS.find(s => s.id === id && !s.locked);
}

function applyStationTheme(station) {
  document.documentElement.style.setProperty("--neon-violet", station.colors.violet);
  document.documentElement.style.setProperty("--neon-pink", station.colors.pink);
  appEls.heroBg.style.backgroundImage = `url('${station.background}')`;
  appEls.heroSignage.textContent = station.signage;
  appEls.stationEyebrow.textContent = station.eyebrow;
  appEls.stationName.textContent = station.name;
  appEls.stationTagline.textContent = station.tagline;
  appEls.footerStationTag.textContent = station.tagline.toUpperCase();
  document.title = `${station.name} — GHOST SIGNAL`;
}

function mountStation(station, { pushState = true } = {}) {
  applyStationTheme(station);
  initForStation(station); // player.js — no-ops if this station is already loaded

  appEls.viewHome.hidden = true;
  appEls.viewStation.hidden = false;
  appEls.player.classList.remove("is-mini");
  appEls.player.classList.remove("is-hidden");
  appEls.player.classList.remove("player-scrolled-away");
  window.scrollTo(0, 0);

  appEls.headerLeft.innerHTML = `<button id="btn-back-home" class="header-back">‹ ALL STATIONS</button>`;
  appEls.headerRight.innerHTML = `<span class="on-air"><span class="dot"></span>ON AIR</span>`;
  document.getElementById("btn-back-home").addEventListener("click", () => mountHome());

  hasEverLoadedAStation = true;

  if (pushState) history.pushState({ stationId: station.id }, "", `/${station.id}`);
}

function mountHome({ pushState = true } = {}) {
  appEls.viewStation.hidden = true;
  appEls.viewHome.hidden = false;
  document.title = "GHOST SIGNAL";

  if (hasEverLoadedAStation) {
    appEls.player.classList.add("is-mini");
    appEls.player.classList.remove("is-hidden");
  } else {
    appEls.player.classList.add("is-hidden");
  }

  appEls.headerLeft.innerHTML = "";
  appEls.headerRight.innerHTML = "";

  renderStationCards();

  if (pushState) history.pushState({}, "", "/");
}

function renderStationCards() {
  appEls.stationsGrid.innerHTML = STATIONS.map(station => {
    if (station.locked) {
      return `
        <div class="station-card is-locked">
          <div class="station-card-thumb station-card-thumb-locked">
            <svg class="lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/></svg>
          </div>
          <p class="station-card-name">${station.name}</p>
          <p class="station-card-tagline">${station.tagline}</p>
        </div>
      `;
    }
    return `
      <button class="station-card" data-station="${station.id}">
        <div class="station-card-thumb" style="background-image:url('${station.background}')"></div>
        <p class="station-card-name">${station.name}</p>
        <p class="station-card-tagline">${station.tagline}</p>
      </button>
    `;
  }).join("");

  appEls.stationsGrid.querySelectorAll("[data-station]").forEach(card => {
    card.addEventListener("click", () => {
      const station = findStation(card.dataset.station);
      if (station) mountStation(station);
    });
  });
}

// ---------- interactive extras ----------

function triggerWordmarkFlicker() {  appEls.stationName.classList.remove("is-flickering");
  void appEls.stationName.offsetWidth; // restart animation
  appEls.stationName.classList.add("is-flickering");
}

function triggerBassShake() {
  document.body.classList.remove("is-shaking");
  appEls.fxPulse.classList.remove("is-active");
  void document.body.offsetWidth;
  document.body.classList.add("is-shaking");
  appEls.fxPulse.classList.add("is-active");
}

appEls.stationName.addEventListener("click", triggerWordmarkFlicker);
document.getElementById("btn-bass-shake").addEventListener("click", triggerBassShake);

// Full-mode player only "lives" in the hero — fade it out once the hero
// scrolls out of view instead of letting it follow the scroll. Never touches
// the player's DOM position (that can reset YouTube's iframe), only opacity.
const heroObserver = new IntersectionObserver(
  ([entry]) => {
    if (appEls.player.classList.contains("is-mini")) return;
    appEls.player.classList.toggle("player-scrolled-away", !entry.isIntersecting);
  },
  { threshold: 0.15 }
);
heroObserver.observe(document.querySelector(".hero"));

document.getElementById("btn-player-close").addEventListener("click", () => {
  if (playerState.player && playerState.player.pauseVideo) playerState.player.pauseVideo();
  appEls.player.classList.add("is-hidden");
});

// ---------- routing ----------

function routeFromLocation() {
  const path = location.pathname.replace(/^\/|\/$/g, "");
  const station = path ? findStation(path) : null;
  if (station) mountStation(station, { pushState: false });
  else mountHome({ pushState: false });
}

window.addEventListener("popstate", routeFromLocation);
document.addEventListener("DOMContentLoaded", routeFromLocation);
