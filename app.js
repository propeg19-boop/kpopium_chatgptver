// app.js — everything that isn't playback logic: routing between the home
// and station views, rendering station cards / playlist / queue from
// Player's state, and the small UI-only effects (wordmark flicker, bass hit).

const LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>';
const PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const GRIP_SVG = '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="8" cy="6" r="1.6" fill="currentColor"/><circle cx="8" cy="12" r="1.6" fill="currentColor"/><circle cx="8" cy="18" r="1.6" fill="currentColor"/><circle cx="16" cy="6" r="1.6" fill="currentColor"/><circle cx="16" cy="12" r="1.6" fill="currentColor"/><circle cx="16" cy="18" r="1.6" fill="currentColor"/></svg>';

const viewHome = document.getElementById("view-home");
const viewStation = document.getElementById("view-station");
const stationGrid = document.getElementById("station-grid");
const playerSlotHome = document.getElementById("player-slot-home");
const playerSlotStation = document.getElementById("player-slot-station");
const playerEl = document.getElementById("player");
const stationBg = document.getElementById("station-bg");
const stationEyebrow = document.getElementById("station-eyebrow");
const wordmarkEl = document.getElementById("wordmark");
const stationTagline = document.getElementById("station-tagline");
const backBtn = document.getElementById("back-btn");
const playlistList = document.getElementById("playlist-list");
const queueList = document.getElementById("queue-list");
const playQueueBtn = document.getElementById("play-queue-btn");
const clearQueueBtn = document.getElementById("clear-queue-btn");
const playerTitle = document.getElementById("player-title");
const playerSubtitle = document.getElementById("player-subtitle");
const playerProgressFill = document.getElementById("player-progress-fill");
const btnPlay = document.getElementById("btn-play");
const btnShuffle = document.getElementById("btn-shuffle");
const btnRepeat = document.getElementById("btn-repeat");
const repeatOneBadge = document.getElementById("repeat-one-badge");
const btnBass = document.getElementById("btn-bass");
const btnCancel = document.getElementById("btn-cancel");
const bassFlash = document.getElementById("bass-flash");

let activeStationId = null;

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
}

// ---- routing ---------------------------------------------------------

function stationFromPath(pathname) {
  const id = pathname.replace(/^\/+|\/+$/g, "");
  const s = STATIONS[id];
  return s && !s.locked ? s : null;
}

function movePlayerTo(slot) { slot.appendChild(playerEl); }

function showHome({ pushState }) {
  viewHome.hidden = false;
  viewStation.hidden = true;
  movePlayerTo(playerSlotHome);
  playerEl.classList.add("is-mini");
  if (pushState) history.pushState({}, "", "/");
}

function showStation(station, { pushState }) {
  viewHome.hidden = true;
  viewStation.hidden = false;

  stationBg.src = station.background;
  stationEyebrow.textContent = station.eyebrow;
  wordmarkEl.textContent = station.name;
  stationTagline.textContent = station.tagline;

  document.documentElement.style.setProperty("--violet", station.colors.violet);
  document.documentElement.style.setProperty("--pink", station.colors.pink);
  document.documentElement.style.setProperty("--violet-glow", hexToRgba(station.colors.violet, 0.35));
  document.documentElement.style.setProperty("--violet-ring", hexToRgba(station.colors.violet, 0.12));

  // Station page keeps the player in normal document flow (not fixed), so it
  // scrolls with the page instead of following — moving the node (not
  // destroying it) keeps the YouTube iframe alive either way.
  movePlayerTo(playerSlotStation);
  playerEl.classList.remove("is-mini");

  if (pushState) history.pushState({}, "", "/" + station.id);

  // Only (re)init playback if this is actually a different station than
  // what's already loaded — re-entering the same station (e.g. home, then
  // back) must not restart the current track.
  if (activeStationId !== station.id) {
    activeStationId = station.id;
    Player.initForStation(station);
  }
}

window.addEventListener("popstate", () => {
  const s = stationFromPath(window.location.pathname);
  if (s) showStation(s, { pushState: false });
  else showHome({ pushState: false });
});

// ---- home grid ---------------------------------------------------------

function renderStationGrid() {
  stationGrid.innerHTML = "";
  STATION_ORDER.forEach((id) => {
    const s = STATIONS[id];
    const card = document.createElement(s.locked ? "div" : "button");
    card.className = "station-card" + (s.locked ? " is-locked" : " is-active-bg");
    card.style.setProperty("--card-violet", s.colors.violet);
    card.style.setProperty("--card-pink", s.colors.pink);
    card.style.setProperty("--card-image", "url(" + s.background + ")");

    const body = document.createElement("div");
    body.className = "station-card-body";
    const name = document.createElement("p");
    name.className = "station-card-name";
    name.textContent = s.name;
    const tagline = document.createElement("p");
    tagline.className = "station-card-tagline";
    tagline.textContent = s.tagline;
    body.appendChild(name);
    body.appendChild(tagline);
    card.appendChild(body);

    if (s.locked) {
      const badge = document.createElement("div");
      badge.className = "lock-badge";
      badge.innerHTML = LOCK_SVG;
      card.appendChild(badge);
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-label", s.name + " — locked");
      const nudge = () => {
        card.classList.remove("is-nudged");
        void card.offsetWidth;
        card.classList.add("is-nudged");
      };
      card.addEventListener("click", nudge);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); nudge(); }
      });
    } else {
      card.type = "button";
      card.setAttribute("aria-label", s.name);
      card.addEventListener("click", () => showStation(s, { pushState: true }));
    }

    stationGrid.appendChild(card);
  });
}

// ---- playlist / queue rendering ---------------------------------------

function renderPlaylist(snap) {
  playlistList.innerHTML = "";
  if (!snap.library.length) {
    playlistList.innerHTML = '<p class="queue-empty">Loading playlist…</p>';
    return;
  }
  snap.library.forEach((track) => {
    const row = document.createElement("div");
    row.className = "track-row" + (track.videoId === snap.currentVideoId ? " is-current" : "");

    const main = document.createElement("button");
    main.type = "button";
    main.className = "track-row-main";
    main.innerHTML =
      '<img class="track-thumb" src="' + (track.thumb || "") + '" alt="" loading="lazy">' +
      '<div class="track-info">' +
        '<div class="track-title">' + escapeHtml(track.title) + "</div>" +
        '<div class="track-channel">' + escapeHtml(track.channel) + "</div>" +
      "</div>";
    main.addEventListener("click", () => Player.playFromPlaylist(track.videoId));

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "track-add-btn";
    addBtn.setAttribute("aria-label", "Add to queue");
    addBtn.innerHTML = PLUS_SVG;
    addBtn.addEventListener("click", () => Player.addToQueue(track.videoId));

    row.appendChild(main);
    row.appendChild(addBtn);
    playlistList.appendChild(row);
  });
}

function renderQueue(snap) {
  queueList.innerHTML = "";
  if (!snap.queue.length) {
    queueList.innerHTML = '<p class="queue-empty">LATE NIGHTS · LOUD MUSIC · EMPTY HEARTS</p>';
    return;
  }
  snap.queue.forEach((item, idx) => {
    const track = snap.library.find((t) => t.videoId === item.videoId);
    const row = document.createElement("div");
    row.className = "track-row" + (idx === snap.queuePointer ? " is-current" : "");
    row.draggable = true;

    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.setAttribute("aria-hidden", "true");
    handle.innerHTML = GRIP_SVG;

    const main = document.createElement("button");
    main.type = "button";
    main.className = "track-row-main";
    main.innerHTML =
      '<img class="track-thumb" src="' + (track ? track.thumb : "") + '" alt="" loading="lazy">' +
      '<div class="track-info">' +
        '<div class="track-title">' + escapeHtml(track ? track.title : item.videoId) + "</div>" +
        '<div class="track-channel">' + escapeHtml(track ? track.channel : "") + "</div>" +
      "</div>";
    main.addEventListener("click", () => Player.playQueueIndex(idx));

    row.appendChild(handle);
    row.appendChild(main);

    row.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", String(idx));
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      const fromIdx = parseInt(e.dataTransfer.getData("text/plain"), 10);
      Player.reorderQueue(fromIdx, idx);
    });

    queueList.appendChild(row);
  });
}

// ---- player UI ---------------------------------------------------------

function renderPlayer(snap) {
  const track = snap.library.find((t) => t.videoId === snap.currentVideoId);

  if (snap.isIdle) {
    playerTitle.textContent = "Nothing playing";
    playerSubtitle.textContent = "Pick a station to start";
    playerEl.classList.add("is-idle");
  } else {
    playerTitle.textContent = track ? track.title : "Loading…";
    playerSubtitle.textContent = track ? track.channel : "";
    playerEl.classList.remove("is-idle");
  }

  btnPlay.querySelector(".icon-play").hidden = snap.isPlaying;
  btnPlay.querySelector(".icon-pause").hidden = !snap.isPlaying;
  btnPlay.setAttribute("aria-label", snap.isPlaying ? "Pause" : "Play");

  btnShuffle.classList.toggle("is-active", snap.shuffleOn);
  btnShuffle.setAttribute("aria-pressed", String(snap.shuffleOn));

  btnRepeat.classList.toggle("is-active", snap.repeatMode !== "off");
  btnRepeat.setAttribute("aria-pressed", String(snap.repeatMode !== "off"));
  repeatOneBadge.hidden = snap.repeatMode !== "one";

  renderPlaylist(snap);
  renderQueue(snap);
}

Player.subscribe(renderPlayer);
Player.onProgress((ratio) => {
  playerProgressFill.style.width = Math.max(0, Math.min(1, ratio)) * 100 + "%";
});

btnPlay.addEventListener("click", () => Player.togglePlayPause());
document.getElementById("btn-next").addEventListener("click", () => Player.next());
document.getElementById("btn-prev").addEventListener("click", () => Player.prev());
btnShuffle.addEventListener("click", () => Player.toggleShuffle());
btnRepeat.addEventListener("click", () => Player.cycleRepeat());
btnCancel.addEventListener("click", () => Player.stop());
playQueueBtn.addEventListener("click", () => Player.playQueueFromStart());
clearQueueBtn.addEventListener("click", () => Player.clearQueue());
backBtn.addEventListener("click", () => showHome({ pushState: true }));

// Bass hit — visual only (shake + flash pulse), no audio.
btnBass.addEventListener("click", () => {
  btnBass.classList.remove("is-hit");
  void btnBass.offsetWidth;
  btnBass.classList.add("is-hit");

  bassFlash.classList.remove("is-active");
  void bassFlash.offsetWidth;
  bassFlash.classList.add("is-active");
});

// Wordmark flicker — click-triggered.
wordmarkEl.addEventListener("click", () => {
  wordmarkEl.classList.remove("is-flickering");
  void wordmarkEl.offsetWidth;
  wordmarkEl.classList.add("is-flickering");
});

// ---- boot ---------------------------------------------------------------

renderStationGrid();
const initialStation = stationFromPath(window.location.pathname);
if (initialStation) showStation(initialStation, { pushState: false });
else showHome({ pushState: false });
