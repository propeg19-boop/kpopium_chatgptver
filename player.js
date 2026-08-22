// player.js — the playback engine. Station-agnostic: call Player.initForStation()
// to point it at a different station's playlist. Every track change goes through
// playVideoId() — nothing here ever asks YouTube's own playlist cursor "what's next";
// that's what caused the title/audio mismatch bug earlier in this build.

const Player = (() => {
  const SFX_TAPE = "assets/sfx/tape-insert.mp3";
  const MANUAL_LOAD_DELAY = 400; // ms — room for the tape-insert clunk to play
  const PLAYLIST_POLL_MS = 300;
  const PLAYLIST_POLL_MAX_ATTEMPTS = 10;

  let yt = null;
  let ytApiReady = false;
  let pendingInitStation = null;

  let station = null;
  let library = [];            // [{videoId, title, channel, thumb}], playlist order
  let queue = [];              // [{videoId}], persists until explicit Clear
  let queuePointer = -1;       // index into `queue` currently playing, -1 = not on a queue item
  let currentVideoId = null;
  let currentSourceIndex = -1; // index into `library` for the currently playing video
  let shuffleOn = false;
  let shuffleHistory = [];     // stack of library indices, so "back" can undo shuffle jumps
  let repeatMode = "off";      // "off" | "all" | "one"
  let isPlaying = false;

  let listeners = [];
  let progressListeners = [];
  let progressTimerId = null;
  let tapeAudio = null;

  // ---- YouTube API bootstrapping -----------------------------------------
  // This MUST be assigned before the youtube iframe_api <script> in index.html
  // finishes loading — YouTube calls it the instant the API is ready, whether
  // or not a station has been chosen yet. Previously this was only registered
  // after navigating into a station, so the callback could fire into a void
  // and the player would never construct — that was the "no playlist" bug.
  window.onYouTubeIframeAPIReady = function () {
    ytApiReady = true;
    if (pendingInitStation) {
      const s = pendingInitStation;
      pendingInitStation = null;
      constructPlayer(s);
    }
  };

  function constructPlayer(newStation) {
    yt = new YT.Player("yt-player-host", {
      height: "270",
      width: "480",
      playerVars: { listType: "playlist", list: newStation.playlistId, playsinline: 1 },
      events: {
        onReady: () => schedulePlaylistIntrospection(),
        onStateChange: onPlayerStateChange,
      },
    });
  }

  function schedulePlaylistIntrospection(attempt = 0) {
    if (!yt || typeof yt.getPlaylist !== "function") return;
    const ids = yt.getPlaylist();
    if ((!ids || !ids.length) && attempt < PLAYLIST_POLL_MAX_ATTEMPTS) {
      window.setTimeout(() => schedulePlaylistIntrospection(attempt + 1), PLAYLIST_POLL_MS);
      return;
    }
    buildLibraryFromIds(ids || []);
  }

  async function buildLibraryFromIds(ids) {
    library = ids.map((id) => ({ videoId: id, title: "Loading…", channel: "", thumb: "" }));
    notify();
    for (let i = 0; i < ids.length; i++) {
      try {
        const url = "https://www.youtube.com/oembed?url=" +
          encodeURIComponent("https://www.youtube.com/watch?v=" + ids[i]) + "&format=json";
        const res = await fetch(url);
        if (res.ok) {
          const meta = await res.json();
          library[i] = {
            videoId: ids[i],
            title: meta.title || ids[i],
            channel: meta.author_name || "",
            thumb: meta.thumbnail_url || "",
          };
          notify();
        }
      } catch (e) {
        // Metadata is best-effort — the row just keeps showing the raw video ID.
      }
    }
  }

  function onPlayerStateChange(e) {
    if (e.data === YT.PlayerState.PLAYING) {
      isPlaying = true;
      startProgressTimer();
      notify();
    } else if (e.data === YT.PlayerState.PAUSED) {
      isPlaying = false;
      stopProgressTimer();
      notify();
    } else if (e.data === YT.PlayerState.ENDED) {
      stopProgressTimer();
      onTrackEnd();
    }
  }

  function onTrackEnd() {
    if (repeatMode === "one") {
      playVideoId(currentVideoId, { manual: false, queuePointerValue: queuePointer });
      return;
    }
    step(1, false);
  }

  // ---- station switching ---------------------------------------------------

  function initForStation(newStation) {
    station = newStation;
    library = [];
    queue = [];
    queuePointer = -1;
    currentVideoId = null;
    currentSourceIndex = -1;
    isPlaying = false;
    shuffleOn = false;
    shuffleHistory = [];
    repeatMode = "off";
    notify();

    if (!newStation.playlistId) return; // locked / not-yet-configured station

    if (!yt) {
      if (ytApiReady) constructPlayer(newStation);
      else pendingInitStation = newStation;
    } else {
      yt.loadPlaylist({ list: newStation.playlistId });
      schedulePlaylistIntrospection();
    }
  }

  // ---- core playback ---------------------------------------------------

  function playVideoId(videoId, { manual, queuePointerValue }) {
    currentVideoId = videoId;
    currentSourceIndex = library.findIndex((t) => t.videoId === videoId);
    if (typeof queuePointerValue === "number") queuePointer = queuePointerValue;

    const load = () => {
      if (yt && typeof yt.loadVideoById === "function") yt.loadVideoById(videoId);
      isPlaying = true;
      notify();
    };

    if (manual) {
      playTapeSfx();
      window.setTimeout(load, MANUAL_LOAD_DELAY);
    } else {
      load();
    }
    notify(); // reflect the queue/playlist highlight change immediately, even before load()
  }

  function step(direction, manual) {
    if (queue.length > 0) {
      let idx = queuePointer;
      if (idx === -1) idx = direction > 0 ? -1 : 0;
      let newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= queue.length) {
        if (!manual && repeatMode === "off") { isPlaying = false; notify(); return; }
        newIdx = ((newIdx % queue.length) + queue.length) % queue.length;
      }
      playVideoId(queue[newIdx].videoId, { manual, queuePointerValue: newIdx });
      return;
    }

    if (!library.length) return;
    let newIdx;
    if (shuffleOn && direction > 0) {
      if (library.length > 1) {
        do { newIdx = Math.floor(Math.random() * library.length); } while (newIdx === currentSourceIndex);
      } else {
        newIdx = 0;
      }
      shuffleHistory.push(currentSourceIndex);
    } else if (shuffleOn && direction < 0 && shuffleHistory.length) {
      newIdx = shuffleHistory.pop();
    } else {
      let idx = currentSourceIndex === -1 ? (direction > 0 ? -1 : 0) : currentSourceIndex;
      newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= library.length) {
        if (!manual && repeatMode === "off") { isPlaying = false; notify(); return; }
        newIdx = ((newIdx % library.length) + library.length) % library.length;
      }
    }
    playVideoId(library[newIdx].videoId, { manual, queuePointerValue: -1 });
  }

  function playFromPlaylist(videoId) {
    playVideoId(videoId, { manual: true, queuePointerValue: -1 });
  }

  function addToQueue(videoId) {
    queue.push({ videoId });
    notify();
  }

  function playQueueFromStart() {
    if (!queue.length) return;
    playVideoId(queue[0].videoId, { manual: true, queuePointerValue: 0 });
  }

  function playQueueIndex(idx) {
    if (idx < 0 || idx >= queue.length) return;
    playVideoId(queue[idx].videoId, { manual: true, queuePointerValue: idx });
  }

  function clearQueue() {
    queue = [];
    queuePointer = -1;
    notify();
  }

  function reorderQueue(fromIdx, toIdx) {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= queue.length || toIdx >= queue.length) return;
    const [moved] = queue.splice(fromIdx, 1);
    queue.splice(toIdx, 0, moved);
    if (queuePointer === fromIdx) queuePointer = toIdx;
    else if (fromIdx < queuePointer && toIdx >= queuePointer) queuePointer -= 1;
    else if (fromIdx > queuePointer && toIdx <= queuePointer) queuePointer += 1;
    notify();
  }

  function togglePlayPause() {
    if (!currentVideoId || !yt) return;
    if (isPlaying) { yt.pauseVideo(); isPlaying = false; }
    else { yt.playVideo(); isPlaying = true; }
    notify();
  }

  function toggleShuffle() { shuffleOn = !shuffleOn; shuffleHistory = []; notify(); }
  function cycleRepeat() {
    repeatMode = repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
    notify();
  }

  // Full stop — distinct from pause. Clears the "now playing" state entirely,
  // which is what puts the mini bar back into its idle look.
  function stop() {
    if (yt) { try { yt.stopVideo(); } catch (e) {} }
    stopProgressTimer();
    isPlaying = false;
    currentVideoId = null;
    currentSourceIndex = -1;
    queuePointer = -1;
    // queue contents, shuffle, and repeat mode are left alone on purpose —
    // stop clears what's playing, not the user's queue setup.
    notify();
  }

  // ---- sfx ---------------------------------------------------------------

  function playTapeSfx() {
    try {
      if (!tapeAudio) tapeAudio = new Audio(SFX_TAPE);
      tapeAudio.currentTime = 0;
      const p = tapeAudio.play();
      if (p && p.catch) p.catch(() => {}); // missing file / blocked autoplay — fail silently
    } catch (e) {}
  }

  // ---- progress ------------------------------------------------------------

  function startProgressTimer() {
    stopProgressTimer();
    progressTimerId = window.setInterval(tickProgress, 500);
  }
  function stopProgressTimer() {
    if (progressTimerId) { window.clearInterval(progressTimerId); progressTimerId = null; }
  }
  function tickProgress() {
    if (!yt || typeof yt.getDuration !== "function") return;
    const dur = yt.getDuration();
    const cur = yt.getCurrentTime();
    const ratio = dur > 0 ? cur / dur : 0;
    progressListeners.forEach((fn) => fn(ratio));
  }

  // ---- subscriptions ---------------------------------------------------

  function getSnapshot() {
    return {
      stationId: station ? station.id : null,
      library: library.slice(),
      queue: queue.slice(),
      queuePointer,
      currentVideoId,
      isPlaying,
      isIdle: currentVideoId === null,
      shuffleOn,
      repeatMode,
    };
  }
  function notify() { const snap = getSnapshot(); listeners.forEach((fn) => fn(snap)); }
  function subscribe(fn) { listeners.push(fn); fn(getSnapshot()); }
  function onProgress(fn) { progressListeners.push(fn); }

  return {
    initForStation,
    subscribe,
    onProgress,
    togglePlayPause,
    next: () => step(1, true),
    prev: () => step(-1, true),
    toggleShuffle,
    cycleRepeat,
    addToQueue,
    playFromPlaylist,
    playQueueFromStart,
    playQueueIndex,
    clearQueue,
    reorderQueue,
    stop,
  };
})();
