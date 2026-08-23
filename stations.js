// Playback engine — station-agnostic. Every bit of queue/shuffle/repeat/
// manual-navigation logic here is unchanged from the single-station build;
// the only addition is initForStation() to swap playlists, and the tape
// -insert hook on manually-picked tracks.

const FALLBACK_COLORS = ["#b985ff,#241238", "#ff5ec4,#3a0f3a", "#5c7bff,#1a1a4a", "#4cc9ff,#0f2a3a"];
const TAPE_INSERT_DELAY_MS = 400; // tune this to match the real clip's length

const playerState = {
  player: null,
  ytReady: false,
  activeStationId: null,
  playlistIds: [],
  playlistIndex: 0,
  library: {},
  queue: [],
  queuePointer: -1,
  currentVideoId: null,
  shuffle: false,
  repeatMode: "off",
  tickHandle: null,
  draggedIndex: null,
};

const pEls = {
  playlist: document.getElementById("playlist-list"),
  trackCount: document.getElementById("track-count"),
  queueBody: document.getElementById("queue-body"),
  queueCount: document.getElementById("queue-count"),
  playerTitle: document.getElementById("player-title"),
  playerArtist: document.getElementById("player-artist"),
  barFill: document.getElementById("player-bar-fill"),
  elapsed: document.getElementById("player-elapsed"),
  total: document.getElementById("player-total"),
  btnPlay: document.getElementById("btn-play"),
  btnPrev: document.getElementById("btn-prev"),
  btnNext: document.getElementById("btn-next"),
  btnShuffle: document.getElementById("btn-shuffle"),
  btnRepeat: document.getElementById("btn-repeat"),
  sfxTape: document.getElementById("sfx-tape"),
};

function formatSeconds(total) {
  if (!isFinite(total) || total < 0) return "0:00";
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ---------- icons ----------

const ICON_PLAY = `<svg viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3" fill="currentColor"/></svg>`;
const ICON_PAUSE = `<svg viewBox="0 0 24 24"><rect x="5" y="3" width="5" height="18" rx="1.5" fill="currentColor"/><rect x="14" y="3" width="5" height="18" rx="1.5" fill="currentColor"/></svg>`;
const ICON_REPEAT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
const ICON_REPEAT_ONE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="12" y="16" font-size="8" font-family="sans-serif" text-anchor="middle" fill="currentColor" stroke="none">1</text></svg>`;

// ---------- metadata (oEmbed, no API key) ----------

async function fetchMeta(videoId) {
  if (playerState.library[videoId]) return playerState.library[videoId];
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (!res.ok) throw new Error("oEmbed failed");
    const data = await res.json();
    playerState.library[videoId] = { title: data.title, artist: data.author_name, thumbnail: data.thumbnail_url };
  } catch {
    playerState.library[videoId] = { title: "Unknown track", artist: "Unknown artist", thumbnail: null };
  }
  return playerState.library[videoId];
}

function coverStyle(videoId, fallbackIndex) {
  const meta = playerState.library[videoId];
  if (meta && meta.thumbnail) return `background-image:url('${meta.thumbnail}')`;
  const color = FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length];
  return `background: linear-gradient(135deg, ${color.split(",")[0]}, ${color.split(",")[1]})`;
}

// ---------- YouTube IFrame API ----------

// Registered at script-load time (not lazily inside initForStation) so we
// never race YouTube's async bootstrap script calling this before it exists.
let pendingStationPlaylistId = null;

window.onYouTubeIframeAPIReady = function () {
  playerState.ytReady = true;
  if (pendingStationPlaylistId) createPlayer(pendingStationPlaylistId);
};

// Called by app.js whenever a station is opened. If a different station is
// already loaded we tear its YT player down and rebuild fresh; if it's the
// same station we don't touch anything (music keeps playing).
function initForStation(station) {
  if (playerState.activeStationId === station.id) return;

  playerState.activeStationId = station.id;
  playerState.playlistIds = [];
  playerState.playlistIndex = 0;
  playerState.queue = [];
  playerState.queuePointer = -1;
  playerState.currentVideoId = null;
  clearInterval(playerState.tickHandle);

  if (playerState.player && playerState.player.destroy) {
    playerState.player.destroy();
    playerState.player = null;
  }

  pendingStationPlaylistId = station.playlistId;
  if (playerState.ytReady) createPlayer(station.playlistId);
}

function createPlayer(playlistId) {
  playerState.player = new YT.Player("yt-player", {
    height: "200",
    width: "200",
    playerVars: { listType: "playlist", list: playlistId, playsinline: 1 },
    events: { onReady, onStateChange },
  });
}

async function onReady() {
  playerState.playlistIds = playerState.player.getPlaylist() || [];
  playerState.playlistIndex = playerState.player.getPlaylistIndex() || 0;
  playerState.currentVideoId = playerState.playlistIds[playerState.playlistIndex];

  await Promise.all(playerState.playlistIds.map(fetchMeta));
  renderPlaylist();
  updateNowPlayingCard();
}

function onStateChange(e) {
  if (e.data === YT.PlayerState.PLAYING) {
    pEls.btnPlay.innerHTML = ICON_PAUSE;
    pEls.btnPlay.setAttribute("aria-label", "Pause");
    playerState.tickHandle = setInterval(tick, 500);
  } else {
    pEls.btnPlay.innerHTML = ICON_PLAY;
    pEls.btnPlay.setAttribute("aria-label", "Play");
    clearInterval(playerState.tickHandle);
  }

  if (e.data === YT.PlayerState.ENDED) handleTrackEnded();
}

function tick() {
  const current = playerState.player.getCurrentTime();
  const total = playerState.player.getDuration();
  pEls.barFill.style.width = total ? `${(current / total) * 100}%` : "0%";
  pEls.elapsed.textContent = formatSeconds(current);
  pEls.total.textContent = formatSeconds(total);
}

// ---------- playback control ----------

async function playVideoId(videoId, { manual = false } = {}) {
  await fetchMeta(videoId);
  playerState.currentVideoId = videoId;
  updateNowPlayingCard();

  if (manual) {
    try {
      pEls.sfxTape.currentTime = 0;
      await pEls.sfxTape.play();
    } catch {
      // autoplay-blocked or missing file — fall through and just play the track
    }
    setTimeout(() => {
      playerState.player.loadVideoById(videoId);
      playerState.player.playVideo();
    }, TAPE_INSERT_DELAY_MS);
  } else {
    playerState.player.loadVideoById(videoId);
    playerState.player.playVideo();
  }
}

function togglePlay() {
  if (!playerState.player) return;
  const state = playerState.player.getPlayerState();
  state === YT.PlayerState.PLAYING ? playerState.player.pauseVideo() : playerState.player.playVideo();
}

function randomIndexExcluding(exclude, length) {
  if (length <= 1) return 0;
  let idx;
  do { idx = Math.floor(Math.random() * length); } while (idx === exclude);
  return idx;
}

function goNext(fromAutoAdvance = false) {
  if (playerState.repeatMode === "one" && fromAutoAdvance) {
    return playVideoId(playerState.currentVideoId);
  }

  if (playerState.queue.length > 0) {
    const nextPointer = playerState.queuePointer + 1;
    if (nextPointer < playerState.queue.length) {
      playerState.queuePointer = nextPointer;
      renderQueue();
      return playVideoId(playerState.queue[nextPointer]);
    }
  }

  const atEnd = playerState.playlistIndex === playerState.playlistIds.length - 1;
  if (atEnd && playerState.repeatMode === "off" && fromAutoAdvance) {
    playerState.player.pauseVideo();
    return;
  }

  playerState.queuePointer = -1;
  playerState.playlistIndex = playerState.shuffle
    ? randomIndexExcluding(playerState.playlistIndex, playerState.playlistIds.length)
    : (playerState.playlistIndex + 1) % playerState.playlistIds.length;

  renderQueue();
  playVideoId(playerState.playlistIds[playerState.playlistIndex]);
}

function goPrev() {
  if (playerState.queue.length > 0 && playerState.queuePointer > 0) {
    playerState.queuePointer -= 1;
    renderQueue();
    return playVideoId(playerState.queue[playerState.queuePointer]);
  }

  playerState.queuePointer = -1;
  playerState.playlistIndex = playerState.shuffle
    ? randomIndexExcluding(playerState.playlistIndex, playerState.playlistIds.length)
    : (playerState.playlistIndex - 1 + playerState.playlistIds.length) % playerState.playlistIds.length;

  renderQueue();
  playVideoId(playerState.playlistIds[playerState.playlistIndex]);
}

function handleTrackEnded() {
  goNext(true);
}

function toggleShuffle() {
  playerState.shuffle = !playerState.shuffle;
  pEls.btnShuffle.classList.toggle("is-active", playerState.shuffle);
}

function cycleRepeat() {
  const order = ["off", "all", "one"];
  playerState.repeatMode = order[(order.indexOf(playerState.repeatMode) + 1) % order.length];
  pEls.btnRepeat.innerHTML = playerState.repeatMode === "one" ? ICON_REPEAT_ONE : ICON_REPEAT;
  pEls.btnRepeat.classList.toggle("is-active", playerState.repeatMode !== "off");
  pEls.btnRepeat.title = `Repeat: ${playerState.repeatMode}`;
}

// ---------- now playing card ----------

function updateNowPlayingCard() {
  const meta = playerState.library[playerState.currentVideoId];
  if (!meta) return;
  pEls.playerTitle.textContent = meta.title;
  pEls.playerArtist.textContent = meta.artist;
  renderPlaylist();
  renderQueue();
}

// ---------- playlist ----------

function renderPlaylist() {
  if (!pEls.trackCount) return;
  pEls.trackCount.textContent = `${playerState.playlistIds.length} tracks`;

  pEls.playlist.innerHTML = playerState.playlistIds.map((videoId, i) => {
    const meta = playerState.library[videoId] || {};
    return `
      <div class="track-item ${videoId === playerState.currentVideoId ? "is-active" : ""}" data-video-id="${videoId}">
        <span class="track-number">${String(i + 1).padStart(2, "0")}</span>
        <div class="track-cover" style="${coverStyle(videoId, i)}"></div>
        <div>
          <p class="track-title">${meta.title || "Loading…"}</p>
          <p class="track-artist">${meta.artist || ""}</p>
        </div>
        <span class="track-duration"></span>
        <button class="track-add" data-add="${videoId}" aria-label="Add to queue">+</button>
      </div>
    `;
  }).join("");
}

// ---------- queue ----------

function renderQueue() {
  if (!pEls.queueCount) return;
  pEls.queueCount.textContent = playerState.queue.length;

  if (playerState.queue.length === 0) {
    pEls.queueBody.innerHTML = `
      <div class="queue-empty">
        <p>Queue's empty. Add a track.</p>
        <span>LATE NIGHTS · LOUD MUSIC · EMPTY HEARTS</span>
      </div>
    `;
    return;
  }

  const rows = playerState.queue.map((videoId, i) => {
    const meta = playerState.library[videoId] || {};
    const isCurrent = i === playerState.queuePointer && videoId === playerState.currentVideoId;
    return `
      <div class="track-item ${isCurrent ? "is-active" : ""}" draggable="true" data-queue-index="${i}">
        <span class="track-number">⠿</span>
        <div class="track-cover" style="${coverStyle(videoId, i)}"></div>
        <div>
          <p class="track-title">${meta.title || "Loading…"}</p>
          <p class="track-artist">${meta.artist || ""}</p>
        </div>
        <span class="track-duration"></span>
        <button class="track-add" data-remove="${i}" aria-label="Remove from queue">×</button>
      </div>
    `;
  }).join("");

  pEls.queueBody.innerHTML = `
    <div class="queue-list" id="queue-list">${rows}</div>
    <div class="queue-actions">
      <button class="queue-play" id="btn-play-queue">▶ PLAY QUEUE</button>
      <button class="queue-clear" id="btn-clear-queue">🗑 CLEAR</button>
    </div>
  `;
}

async function addToQueue(videoId) {
  await fetchMeta(videoId);
  playerState.queue.push(videoId);
  renderQueue();
}

function removeFromQueue(index) {
  playerState.queue.splice(index, 1);
  if (playerState.queuePointer === index) playerState.queuePointer = -1;
  else if (playerState.queuePointer > index) playerState.queuePointer -= 1;
  renderQueue();
}

function clearQueue() {
  playerState.queue = [];
  playerState.queuePointer = -1;
  renderQueue();
}

function playQueue() {
  if (playerState.queue.length === 0) return;
  playerState.queuePointer = 0;
  renderQueue();
  playVideoId(playerState.queue[0], { manual: true });
}

function reorderQueue(fromIndex, toIndex) {
  const [moved] = playerState.queue.splice(fromIndex, 1);
  playerState.queue.splice(toIndex, 0, moved);

  if (playerState.queuePointer === fromIndex) playerState.queuePointer = toIndex;
  else if (fromIndex < playerState.queuePointer && toIndex >= playerState.queuePointer) playerState.queuePointer -= 1;
  else if (fromIndex > playerState.queuePointer && toIndex <= playerState.queuePointer) playerState.queuePointer += 1;

  renderQueue();
}

// ---------- events (bound once — the elements they're delegated on are
// persistent/reused across every station, so no rebinding needed) ----------

pEls.btnPlay.addEventListener("click", togglePlay);
pEls.btnNext.addEventListener("click", () => goNext(false));
pEls.btnPrev.addEventListener("click", goPrev);
pEls.btnShuffle.addEventListener("click", toggleShuffle);
pEls.btnRepeat.addEventListener("click", cycleRepeat);

pEls.playlist.addEventListener("click", (e) => {
  const addBtn = e.target.closest("[data-add]");
  if (addBtn) return addToQueue(addBtn.dataset.add);

  const row = e.target.closest(".track-item");
  if (row) {
    playerState.queuePointer = -1;
    playerState.playlistIndex = playerState.playlistIds.indexOf(row.dataset.videoId);
    playVideoId(row.dataset.videoId, { manual: true });
  }
});

pEls.queueBody.addEventListener("click", (e) => {
  if (e.target.id === "btn-play-queue") return playQueue();
  if (e.target.id === "btn-clear-queue") return clearQueue();

  const removeBtn = e.target.closest("[data-remove]");
  if (removeBtn) return removeFromQueue(Number(removeBtn.dataset.remove));

  const row = e.target.closest("[data-queue-index]");
  if (row) {
    const index = Number(row.dataset.queueIndex);
    playerState.queuePointer = index;
    renderQueue();
    playVideoId(playerState.queue[index], { manual: true });
  }
});

pEls.queueBody.addEventListener("dragstart", (e) => {
  const row = e.target.closest("[data-queue-index]");
  if (row) playerState.draggedIndex = Number(row.dataset.queueIndex);
});

pEls.queueBody.addEventListener("dragover", (e) => {
  if (e.target.closest("[data-queue-index]")) e.preventDefault();
});

pEls.queueBody.addEventListener("drop", (e) => {
  const row = e.target.closest("[data-queue-index]");
  if (!row || playerState.draggedIndex === null) return;
  e.preventDefault();
  const targetIndex = Number(row.dataset.queueIndex);
  if (targetIndex !== playerState.draggedIndex) reorderQueue(playerState.draggedIndex, targetIndex);
  playerState.draggedIndex = null;
});

renderQueue();
