# Kpopium

Plain HTML/CSS/JS, no build step. Deploy as-is on Vercel.

```
kpopium/
├── index.html        SPA shell: home view + station view + persistent player
├── style.css
├── stations.js        station configs (name, colors, playlist, locked)
├── player.js           playback engine (YouTube IFrame API, queue, shuffle, repeat)
├── app.js                view router + all UI wiring
├── vercel.json              rewrite rule so /kpopium works as a direct link
└── assets/
    ├── scenes/               drop station background images here
    │   └── seoul-night.png   ← Kpopium's landscape image goes here
    └── sfx/
        └── tape-insert.mp3   ← your tape-insert clip goes here (optional — site works without it)
```

## Before you push

1. **Verify the playlist ID.** The ID captured in `stations.js` (`PLdEN-_9tuaOM`) looks shorter than a typical YouTube playlist ID (~34 chars) — it may have gotten clipped somewhere in this chat's history. Re-copy the full ID from your playlist URL and paste it into `stations.kpopium.playlistId` if it doesn't match.
2. **Drop in your landscape image** at `assets/scenes/seoul-night.png`. It renders as the full-width station artwork with a soft vignette/grain overlay, preserving the artwork instead of aggressively cropping it.
3. **Drop in `tape-insert.mp3`** at `assets/sfx/` if you have it. If it's missing, track selection still works — the sound just doesn't play.

## Test checklist

- [ ] Land on `/`, only Kpopium is clickable, the other two show a big lock icon
- [ ] Enter Kpopium — playlist loads (this was the "no playlist" bug; it's fixed by registering the YouTube ready-callback immediately instead of after navigation)
- [ ] Enter Kpopium — the full station artwork is visible, with the player directly below the title/tagline
- [ ] Scroll the station page — the player stays where it sits in the page, it does not float/follow
- [ ] Click a playlist track → short delay, then it plays; click again → tape sound (once your mp3 is in place)
- [ ] Add a couple of tracks to the queue, hit next/prev — it moves through the queue, not the playlist
- [ ] Drag-reorder the queue
- [ ] Hit the bass button — screen flashes and the icon shakes, no sound
- [ ] Click the big station title — it flickers like dying neon
- [ ] Header shows "ON AIR" with a blinking dot — no station-network branding
- [ ] Playlist is shown first and Queue is stacked cleanly underneath it
- [ ] Go back to All Stations — mini player at the bottom keeps playing the same track
- [ ] Hit the × on the mini player — playback stops and it goes idle
- [ ] Visit `/kpopium` directly (not through the homepage) — it loads correctly, not a 404
