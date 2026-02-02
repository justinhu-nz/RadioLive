# RadioLive

A lightweight Progressive Web App for streaming New Zealand radio stations. Built with vanilla JavaScript, HTML5 Audio API, and service worker caching for offline functionality.

## Features

- Stream 95bFM, RNZ National, and NewstalkZB
- On-demand news bulletins with timezone-aware URL generation
- Live track metadata for 95bFM
- Offline PWA capabilities with service worker caching
- Toast notification system for error handling
- Network status monitoring
- iOS-inspired responsive design

## Technical Stack

Vanilla JavaScript with no frameworks or build tools. Uses HTML5 Audio API for streaming, service worker for caching, and Intl.DateTimeFormat API for correct NZDT/NZST timezone handling.

## Development

Set `DEBUG_MODE = true` in app.js (line 17) to enable console logging.
