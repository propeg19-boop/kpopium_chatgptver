// stations.js — station network config.
// To add a new station later: add an entry here and drop its background
// image in assets/scenes/. Nothing else in the app needs to change.

const STATIONS = {
  kpopium: {
    id: "kpopium",
    name: "KPOPIUM",
    tagline: "no love. just vibes.",
    eyebrow: "서울 · SEOUL AFTER DARK",
    // NOTE: this is the playlist ID as it appears earlier in this chat.
    // It's shorter than a typical YouTube playlist ID (usually ~34 chars),
    // so it may have been clipped somewhere along the way — worth
    // re-confirming against the actual playlist URL before relying on it.
    playlistId: "PLdEN-_9tuaOM",
    background: "assets/scenes/seoul-night.png",
    colors: { violet: "#b985ff", pink: "#ff5ec4" },
    locked: false,
  },
  jrock: {
    id: "jrock",
    name: "SHIBUYA STATIC",
    tagline: "loud amps. wet streets.",
    eyebrow: "東京 · TOKYO RAIN",
    playlistId: "",
    background: "assets/scenes/tokyo-rain.png",
    colors: { violet: "#ff6b4a", pink: "#ffd23f" },
    locked: true,
  },
  asianrnb: {
    id: "asianrnb",
    name: "SLOW BURN",
    tagline: "low light. lower bpm.",
    eyebrow: "夜 · AFTER HOURS",
    playlistId: "",
    background: "assets/scenes/late-room.png",
    colors: { violet: "#7a8cff", pink: "#ff8ac4" },
    locked: true,
  },
};

// Render/order control, kept separate from the object above so station
// order on the home grid doesn't depend on key insertion order.
const STATION_ORDER = ["kpopium", "jrock", "asianrnb"];
