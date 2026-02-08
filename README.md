# RadioLive

A lightweight Progressive Web App for streaming New Zealand radio stations. Built with vanilla JavaScript, HTML5 Audio API, and service worker caching for offline functionality.

## Features

- Stream 8 NZ radio stations: 95bFM, ZM, The Edge, George FM, The Breeze, Channel X, RNZ National, and NewstalkZB
- On-demand news bulletins with timezone-aware URL generation
- Live track metadata for 95bFM
- Offline PWA capabilities with service worker caching
- Toast notification system for error handling
- Network status monitoring
- iOS-inspired responsive design

## Technical Stack

Vanilla JavaScript with no frameworks or build tools. Uses HTML5 Audio API for streaming, service worker for caching, and Intl.DateTimeFormat API for correct NZDT/NZST timezone handling.

## Bulletin Scrubbing Controls (Seek + Skip)

This app includes a minimal, non-intrusive scrub interface that appears only for pre-recorded news bulletins (RNZ / NewstalkZB). It enables:
- Precise scrubbing via a time slider
- Skip back / forward (15 seconds)
- Live time readout (current time / total duration)

### UX Behavior
- Hidden for all live radio streams.
- Auto-shows only when the loaded audio is seekable (has a finite duration).
- Disabled automatically when the stream cannot be seeked.
- Designed to be visually quiet and placed beneath the main controls.

### How It Works
**HTML**
- The scrub UI is defined in `index.html` inside `.bulletin-controls` (buttons + slider + time labels).

**CSS**
- `style.css` defines `.bulletin-controls` with `display: none` by default.
- The `.active` class toggles visibility only for bulletins.
- Controls are compact to preserve the original look.

**JavaScript**
- `app.js` detects bulletins using `isBulletinUrl()` and `name.includes('News')`.
- It tracks audio duration and current time via `loadedmetadata`, `durationchange`, and `timeupdate`.
- When a bulletin is loaded and seekable, it toggles the scrub UI and updates labels.
- Slider input updates `audio.currentTime` for fine scrubbing.
- Skip buttons jump `±15s` and clamp to valid range.

### Key Entry Points
- `isBulletinUrl(url)` determines if the source is a bulletin.
- `updateBulletinControlsState` toggles visibility + disabled states.
- `syncScrubUI` updates slider and time labels.
- `loadStation()` attaches audio listeners for timing updates.

### Customization
- Skip interval can be changed in `app.js` (currently 15 seconds in both directions).
- Visual styling lives in `style.css` under `.bulletin-controls` and `#scrub-slider`.

## Development

Set `DEBUG_MODE = true` in app.js (line 17) to enable console logging.
