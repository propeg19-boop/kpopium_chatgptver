// One entry per station. `locked: true` stations render as "coming soon"
// cards on the home page and aren't clickable yet.

const NETWORK_NAME = "GHOST SIGNAL";

const STATIONS = [
  {
    id: "kpopium",
    name: "KPOPIUM",
    tagline: "no love. just vibes.",
    eyebrow: "서울 · SEOUL AFTER DARK",
    signage: "K-POP · INDIE · NIGHT DRIVE",
    playlistId: "PLdEN-_9tuaOM",
    background: "assets/scenes/seoul-night.png",
    colors: { violet: "#b985ff", pink: "#ff5ec4" },
    locked: false,
  },
  {
    id: "chillrnb",
    name: "CHILL&B",
    tagline: "u + me + r&b",
    eyebrow: "PULSE · AFTER HOURS",
    signage: "RAIN · VINYL · FIRELIGHT",
    playlistId: "PLYUwRd6BItHI",
    background: "assets/scenes/chillrnb-bg.jpg",
    colors: { violet: "#ff4d6d", pink: "#ffb347" },
    ambiences: ["rain", "vinyl", "fireplace"],
    locked: false,
  },
  {
    id: "coming-soon-1",
    name: "???",
    tagline: "stay tuned",
    locked: true,
  },
];
