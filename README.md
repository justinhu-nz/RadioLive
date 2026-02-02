# 📻 RadioLive

**Simple, ad-free radio streaming for New Zealand stations**

No ads. No tracking. No nonsense. Just pure Kiwi radio streaming in a sleek, iOS-inspired Progressive Web App.

---

## ✨ What's This?

RadioLive is a lightweight web app that lets you listen to your favorite New Zealand radio stations without the clutter of traditional streaming sites. It's fast, beautiful, and works offline thanks to modern PWA technology.

Think of it as your pocket radio, but without the static or the annoying ads interrupting your favorite shows.

---

## 🎵 Features

### Radio Stations
- **95bFM** (Auckland) - Student radio with personality
- **RNZ National** - New Zealand's public broadcaster
- **NewstalkZB** (Auckland) - Talk radio and news

### Smart Features
- 📰 **News Bulletins on Demand** - Catch up on RNZ and NewstalkZB news bulletins
- 🎼 **Live Track Info** - See what's playing on 95bFM in real-time
- 📶 **Offline Capable** - Service worker caching for instant loading
- 🔊 **Volume Control** - Because not all stations are created equal
- 🌐 **Network Status** - Know when you're offline before you wonder why nothing works
- 🔔 **Smart Notifications** - Friendly toast messages keep you informed without being annoying

### User Experience
- 🎨 **iOS-Inspired Design** - Glossy gradients and smooth animations
- 📱 **Mobile-First** - Works beautifully on phones, tablets, and desktops
- ⚡ **Fast Load Times** - Cached assets mean near-instant startup
- 🎯 **Installable** - Add to home screen like a native app

---

## 🚀 Getting Started

### Installation

**Option 1: Just Open It**
1. Visit the app in your browser
2. Start listening immediately
3. That's it

**Option 2: Install as PWA**
1. Open the app in Chrome, Edge, or Safari
2. Look for the "Install" prompt (usually in the address bar)
3. Click "Install RadioLive"
4. Enjoy your new app icon

### Usage

1. **Pick a Station** - Tap any of the three station buttons
2. **Hit Play** - The big play button does what you'd expect
3. **Adjust Volume** - Use the slider to find your sweet spot
4. **Catch the News** - Tap a news bulletin button to hear the latest

**Pro Tip:** The refresh button next to "Now Playing" updates 95bFM track info manually if you're impatient.

---

## 🛠️ Technical Stack

### Frontend
- **Vanilla JavaScript** - No frameworks, no build step, no problems
- **HTML5 Audio API** - For streaming with native browser controls
- **CSS3 Animations** - Smooth transitions and eye candy
- **Service Worker** - Smart caching for offline support

### Architecture
- **Progressive Web App (PWA)** - Installable, cacheable, reliable
- **Responsive Design** - Mobile-first with desktop support
- **Toast Notification System** - Custom-built user feedback
- **Timezone-Aware** - Correctly handles NZDT/NZST for news bulletins

### External Services
- **CORS Proxy** (api.allorigins.win) - Fetches 95bFM track metadata
- **Direct Streaming** - Station streams pulled directly (no middleware)

---

## 🔧 Recent Improvements

This app has been lovingly debugged and improved with the following fixes:

### Critical Fixes
- ✅ **Timezone Bug Fixed** - News bulletins now correctly handle NZDT/NZST transitions using `Intl.DateTimeFormat`
- ✅ **Service Worker Implemented** - Offline functionality and faster load times
- ✅ **Memory Leaks Eliminated** - 6 memory leaks fixed (event listeners, intervals, audio cleanup)
- ✅ **Missing Icon Reference Removed** - Fixed 404 error for non-existent favicon.svg

### UX Improvements
- ✅ **Console Cleanup** - Added `DEBUG_MODE` flag to eliminate console spam in production
- ✅ **Toast Notification System** - User-friendly error messages with retry options
- ✅ **Error Handling** - Comprehensive error coverage for all failure scenarios
- ✅ **Network Status Awareness** - Automatic pause when offline, notification when back online

### Documentation
- ✅ **FIXES.md** - Comprehensive documentation of timezone fix, service worker, and memory leak solutions
- ✅ **ERROR_HANDLING.md** - Complete guide to toast notification system and error scenarios

---

## 🗂️ File Structure

```
RadioLive/
├── index.html              # Main app structure
├── app.js                  # Core application logic (564 lines)
├── style.css               # iOS-inspired styling (905 lines)
├── sw.js                   # Service worker for PWA functionality
├── manifest.json           # PWA manifest
├── favicon.png             # 512x512 app icon
├── apple-touch-icon.png    # 180x180 iOS icon
├── FIXES.md               # Technical documentation of bug fixes
├── ERROR_HANDLING.md      # Error handling system documentation
└── README.md              # You are here
```

---

## 🧪 Development

### Debug Mode

Want to see what's happening under the hood?

1. Open `app.js`
2. Find line 17: `const DEBUG_MODE = false;`
3. Change to: `const DEBUG_MODE = true;`
4. Reload the app
5. Open browser console to see debug logs

**Remember:** Set it back to `false` for production to keep the console clean.

### Testing

The app includes comprehensive error handling you can test:

**Test Network Errors:**
1. Disconnect internet
2. Watch the "No Internet Connection" toast appear
3. Reconnect
4. Watch the "Back Online" toast

**Test Stream Errors:**
1. Open DevTools Network tab
2. Block the stream URL
3. Try to play
4. Watch the error toast with Retry button

**Test Metadata Failures:**
1. Block `api.allorigins.win` in Network tab
2. Play 95bFM
3. Wait 90 seconds
4. Watch the metadata unavailable toast after 3 failed attempts

---

## 📊 Performance

- **Initial Load:** ~1.54MB (cached after first visit)
- **Subsequent Loads:** <100KB (service worker cache)
- **Time to Interactive:** <1 second (cached)
- **Memory Usage:** ~15-20MB active listening
- **Battery Impact:** Minimal (native audio APIs)

---

## 🤔 Why No Framework?

Good question! Here's why this app is pure vanilla JavaScript:

1. **Speed** - No framework overhead means faster load times
2. **Simplicity** - Easy to understand, easy to modify
3. **Longevity** - No framework to become outdated
4. **Learning** - Great example of what's possible without dependencies
5. **Size** - Entire app is smaller than most framework bundles

---

## 🐛 Known Limitations

- **95bFM Metadata** - Relies on CORS proxy which occasionally times out
- **News Bulletins** - Only attempts current and previous hour (may miss older bulletins)
- **Station Selection** - Hardcoded to three stations (could be made dynamic)
- **No Station Search** - Feature not implemented
- **No Favorites** - All stations are equal in RadioLive's eyes

These are features, not bugs. We keep it simple on purpose.

---

## 🙏 Credits

### Radio Stations
- **95bFM** - Auckland's student radio station
- **RNZ National** - Radio New Zealand
- **NewstalkZB** - NZME talk radio

### Technology
- Service Worker API
- HTML5 Audio API
- Intl.DateTimeFormat API
- CORS Anywhere (api.allorigins.win)

---

## 📜 License

This is a personal project. Use it, learn from it, improve it. Just don't sue me if your streaming goes wonky during the America's Cup coverage.

---

## 🎉 Fun Facts

- The entire app is ~1,700 lines of code (including documentation)
- Zero external dependencies (not even jQuery!)
- Works on devices from 2015 onwards
- Tested on actual New Zealanders (sample size: me)
- Has survived multiple timezone bug hunts
- The toast notification system can queue unlimited errors (but shows max 3 at once)
- Debug mode includes 13+ debug statements you never see in production

---

## 🚧 Future Ideas

Ideas for future improvements (PRs welcome!):

- [ ] Add more NZ stations (The Breeze, Mai FM, etc.)
- [ ] Station search functionality
- [ ] Favorites system
- [ ] Recently played history
- [ ] Sleep timer
- [ ] Chromecast support
- [ ] Podcast integration
- [ ] Dark mode toggle (currently always dark)
- [ ] Equalizer controls
- [ ] Share what you're listening to

---

## 📞 Support

Something broken? Found a bug? Have a feature request?

1. Check the console (enable DEBUG_MODE)
2. Read the ERROR_HANDLING.md documentation
3. Open an issue with details

---

**Made with ☕ in Aotearoa**

*No ads. No tracking. No drama. Just radio.*
