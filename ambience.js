// Per-station ambience layer: independent looping audio files, mixed
// underneath whatever's playing from YouTube. Can't touch YouTube's own
// audio stream (cross-origin, same wall as the bass-detection question) —
// each ambience is its own local loop with its own volume.

const AMBIENCE_LIBRARY = {
  rain: {
    label: "Rain",
    src: "assets/sfx/ambience/rain.mp3",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"/><line x1="8" y1="19" x2="8" y2="21"/><line x1="12" y1="19" x2="12" y2="21"/><line x1="16" y1="19" x2="16" y2="21"/></svg>`,
  },
  vinyl: {
    label: "Vinyl Warmth",
    src: "assets/sfx/ambience/vinyl.mp3",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.2"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>`,
  },
  fireplace: {
    label: "Fireplace",
    src: "assets/sfx/ambience/fireplace.mp3",
    icon: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2c1.2 3-1.8 4.2-1.8 7.2a3.8 3.8 0 0 0 7.6 0c0-1-.4-2-1-2.8 2 1 3.2 3.1 3.2 5.6a6 6 0 1 1-12 0c0-4.3 2.4-6.6 4-10z"/></svg>`,
  },
};

const ambienceState = {};

function getOrCreateAmbience(id) {
  if (!ambienceState[id]) {
    const def = AMBIENCE_LIBRARY[id];
    const audio = new Audio(def.src);
    audio.loop = true;
    audio.volume = 0.45;
    ambienceState[id] = { audio, playing: false };
  }
  return ambienceState[id];
}

function toggleAmbience(id) {
  const state = getOrCreateAmbience(id);
  const control = document.querySelector(`.ambience-control[data-ambience="${id}"]`);
  const btn = control.querySelector(".ambience-toggle");

  if (state.playing) {
    state.audio.pause();
    state.playing = false;
    btn.setAttribute("aria-pressed", "false");
    control.classList.remove("is-active");
  } else {
    state.audio.play().catch(() => {});
    state.playing = true;
    btn.setAttribute("aria-pressed", "true");
    control.classList.add("is-active");
  }
}

function setAmbienceVolume(id, value) {
  getOrCreateAmbience(id).audio.volume = Number(value) / 100;
}

function stopAllAmbiences() {
  Object.values(ambienceState).forEach(s => {
    s.audio.pause();
    s.playing = false;
  });
  document.querySelectorAll(".ambience-control").forEach(c => {
    c.classList.remove("is-active");
    c.querySelector(".ambience-toggle").setAttribute("aria-pressed", "false");
  });
}

function renderAmbiencePanel(ids = []) {
  const panel = document.getElementById("ambience-panel");
  if (!panel) return;

  if (ids.length === 0) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }

  panel.hidden = false;
  panel.innerHTML = ids.map(id => {
    const def = AMBIENCE_LIBRARY[id];
    return `
      <div class="ambience-control" data-ambience="${id}">
        <button class="ambience-toggle" aria-pressed="false" aria-label="${def.label}" title="${def.label}">${def.icon}</button>
        <input type="range" class="ambience-volume" min="0" max="100" value="45" aria-label="${def.label} volume">
      </div>
    `;
  }).join("");

  panel.querySelectorAll(".ambience-toggle").forEach(btn => {
    btn.addEventListener("click", () => toggleAmbience(btn.closest(".ambience-control").dataset.ambience));
  });
  panel.querySelectorAll(".ambience-volume").forEach(slider => {
    slider.addEventListener("input", (e) =>
      setAmbienceVolume(slider.closest(".ambience-control").dataset.ambience, e.target.value)
    );
  });
}

function initAmbiencesForStation(station) {
  stopAllAmbiences();
  renderAmbiencePanel(station.ambiences || []);
}
