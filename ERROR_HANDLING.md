# Error Handling & Console Cleanup Documentation

This document describes the error handling improvements and console cleanup implemented in RadioLive.

---

## Table of Contents

1. [Console Cleanup](#console-cleanup)
2. [Toast Notification System](#toast-notification-system)
3. [Error Scenarios](#error-scenarios)
4. [Developer Guide](#developer-guide)
5. [Testing Guide](#testing-guide)

---

## Console Cleanup

### Overview

Added a `DEBUG_MODE` flag to control console logging. All debug statements now use a `debug()` helper function that only logs when `DEBUG_MODE = true`.

### Implementation

**Debug Flag** (app.js:17-24):
```javascript
const DEBUG_MODE = false; // Set to true for development

function debug(...args) {
  if (DEBUG_MODE) {
    console.log(...args);
  }
}
```

### Console Statements Cleaned Up

#### Replaced with debug() (13 statements):
- `updateNewsButtonTimes` - Lines 173-186 (6 statements)
- `loadNewsBulletin` - Lines 199, 221 (2 statements)
- `initializePlayer` - Line 270 (1 statement)
- `fetch95bFMNowPlaying` - Lines 503, 508, 571, 573 (4 statements)

#### Fixed Error Logging (2 statements):
- Line 131: Service Worker registration failure - Changed `console.log` to `console.error`
- Line 235: News bulletin load failure - Changed `console.log` to `console.error`

#### Kept (Informational):
- Line 128: Service Worker registration success
- Line 213: News bulletin success
- Line 241, 246: Fallback messages
- Line 565: 95bFM track updated
- Line 580, 582: 95bFM errors (console.warn/console.error)

### Production vs Development

**Production** (`DEBUG_MODE = false`):
- Clean console
- Only errors, warnings, and important info logged
- No spam from periodic updates

**Development** (`DEBUG_MODE = true`):
- All debug logs visible
- Helps diagnose issues
- Shows state changes and flow

---

## Toast Notification System

### Overview

A lightweight toast notification system styled to match the iOS-inspired app theme. Toasts appear at the bottom center of the screen and auto-dismiss after a duration (or persist until manually dismissed).

### Features

- **4 Toast Types**: error, warning, info, success
- **Automatic Queuing**: Max 3 visible toasts, others queue
- **Custom Actions**: Retry buttons for recoverable errors
- **Auto-dismiss**: Configurable duration (0 = persist)
- **Responsive**: Mobile-optimized styling
- **iOS Theme**: Matches app's glossy gradient aesthetic

### Toast API

**Function Signature:**
```javascript
showToast({
  title: string,          // Optional heading
  message: string,        // Main message text
  type: string,           // 'error', 'warning', 'info', 'success'
  duration: number,       // Milliseconds (0 = persistent)
  action: {               // Optional action button
    text: string,
    callback: function
  },
  icon: string            // Optional custom emoji icon
})
```

**Example Usage:**
```javascript
showToast({
  title: 'Stream Error',
  message: 'Unable to connect to 95bFM. Please try again.',
  type: 'error',
  duration: 6000,
  action: {
    text: 'Retry',
    callback: () => loadStation(url, name)
  }
});
```

### Toast Types & Styling

| Type | Color | Icon | Use Case |
|------|-------|------|----------|
| `error` | Red (#ff4444) | ❌ | Fatal errors, connection failures |
| `warning` | Orange (#ffaa00) | ⚠️ | Non-fatal issues, degraded service |
| `info` | Blue (#4444ff) | ℹ️ | Informational messages |
| `success` | Green (#44ff44) | ✅ | Success confirmations |

---

## Error Scenarios

### 1. Service Worker Registration Failure

**When:** Service worker fails to register on page load

**User Impact:** No offline functionality

**Error Handling:**
```javascript
// app.js:131-137
console.error('Service Worker registration failed:', error);
showToast({
  title: 'Offline Mode Unavailable',
  message: 'App will work online only. Check your connection.',
  type: 'warning',
  duration: 8000
});
```

**Toast:** Warning toast for 8 seconds

---

### 2. News Bulletin Load Failure

**When:** Both current and previous hour bulletins fail to load

**User Impact:** Unable to play news bulletin

**Error Handling:**
```javascript
// app.js:246-252
console.error(`Both attempts failed for ${name} news`);
showToast({
  title: 'News Bulletin Unavailable',
  message: `Unable to load ${name} news bulletin. The service may be temporarily down.`,
  type: 'error',
  duration: 7000
});
```

**Toast:** Error toast for 7 seconds

**Fallback:** Attempts to load anyway (may fail silently)

---

### 3. Audio Stream Error

**When:** Stream fails to connect or drops mid-playback

**User Impact:** No audio playback

**Error Handling:**
```javascript
// app.js:395-406
console.error('Audio error:', e);
showToast({
  title: 'Stream Error',
  message: `Unable to connect to ${name}. Please try again.`,
  type: 'error',
  duration: 6000,
  action: {
    text: 'Retry',
    callback: () => loadStation(url, name)
  }
});
```

**Toast:** Error toast with **Retry** button for 6 seconds

**Recovery:** User can click Retry to attempt reconnection

---

### 4. 95bFM Metadata Fetch Failure

**When:** CORS proxy fails to fetch track info 3 consecutive times

**User Impact:** Track info not updated (shows "Now Playing: 95bFM")

**Error Handling:**
```javascript
// app.js:580-589
bfmMetadataFailures++;

if (bfmMetadataFailures === 3) {
  showToast({
    title: '95bFM Metadata Unavailable',
    message: 'Unable to fetch track information. The metadata service may be down.',
    type: 'warning',
    duration: 8000
  });
}
```

**Toast:** Warning toast after 3 failures for 8 seconds

**Recovery:** Automatic - resets on successful fetch

**Note:** Only shows once (after 3rd failure), not on every subsequent failure

---

### 5. Network Connection Lost

**When:** Device goes offline

**User Impact:** All streaming stops

**Error Handling:**
```javascript
// app.js:625-632
showToast({
  title: 'No Internet Connection',
  message: 'Streaming is unavailable while offline.',
  type: 'error',
  duration: 0, // Persistent
  icon: '📡'
});
```

**Toast:** Persistent error toast (doesn't auto-dismiss)

**Action:** Audio paused automatically

**Recovery:** When back online, shows success toast:
```javascript
// app.js:614-621
showToast({
  title: 'Back Online',
  message: 'Internet connection restored.',
  type: 'success',
  duration: 4000,
  icon: '✅'
});
```

---

## Developer Guide

### Adding New Toast Notifications

**Step 1: Identify Error Location**

Find where the error occurs in the code.

**Step 2: Add Toast**

```javascript
showToast({
  title: 'Short Title',
  message: 'Detailed explanation for the user.',
  type: 'error', // or 'warning', 'info', 'success'
  duration: 6000 // milliseconds, or 0 for persistent
});
```

**Step 3: Add Recovery (Optional)**

```javascript
showToast({
  title: 'Error Title',
  message: 'Error description.',
  type: 'error',
  duration: 6000,
  action: {
    text: 'Retry',
    callback: () => {
      // Recovery function
    }
  }
});
```

### Best Practices

1. **Use appropriate toast types:**
   - `error`: Fatal issues that prevent functionality
   - `warning`: Non-fatal issues, degraded service
   - `info`: Informational messages
   - `success`: Confirmations

2. **Keep messages concise:**
   - Title: 2-5 words
   - Message: 1-2 sentences max

3. **Set appropriate durations:**
   - Errors: 6-8 seconds
   - Warnings: 6-8 seconds
   - Info: 4-5 seconds
   - Success: 3-4 seconds
   - Persistent: 0

4. **Provide recovery options:**
   - Add `action` buttons for retryable errors
   - Use clear action text ("Retry", "Reload", "Try Again")

5. **Avoid toast spam:**
   - Don't show toast on every error occurrence
   - Use counters (e.g., 95bFM metadata only after 3 failures)
   - Clear toasts on recovery

---

## Testing Guide

### Manual Testing

#### Test 1: Console Cleanup
1. Set `DEBUG_MODE = false` in app.js
2. Open app in browser
3. Open DevTools Console
4. Use app normally for 5 minutes
5. **Expected:** Clean console, no debug logs

#### Test 2: Toast System
1. Disconnect internet
2. **Expected:** "No Internet Connection" toast appears (persistent)
3. Reconnect internet
4. **Expected:** "Back Online" toast appears (4 seconds)

#### Test 3: Stream Error with Retry
1. Select a station
2. Modify stream URL to invalid in DevTools
3. **Expected:** "Stream Error" toast with Retry button
4. Click Retry
5. **Expected:** Toast dismissed, retry attempted

#### Test 4: News Bulletin Failure
1. Modify news URL to invalid
2. Click RNZ News
3. **Expected:** After ~5 seconds, "News Bulletin Unavailable" toast

#### Test 5: 95bFM Metadata Failure
1. Select 95bFM
2. Block `api.allorigins.win` in DevTools Network
3. Wait 90 seconds (3 × 30s intervals)
4. **Expected:** After 3rd failure, "95bFM Metadata Unavailable" toast

#### Test 6: Service Worker Failure
1. Corrupt sw.js file
2. Reload page
3. **Expected:** "Offline Mode Unavailable" toast

### Automated Testing

**Console Spam Check:**
```javascript
// Before any action
const consoleCount = console.log.call.length;

// Use app for 5 minutes

// After
const newCount = console.log.call.length;
// Assert: newCount - consoleCount < 10 (only important logs)
```

**Toast Queue Check:**
```javascript
// Trigger 5 errors simultaneously
triggerError(); // x5

const toasts = document.querySelectorAll('.toast');
// Assert: toasts.length <= 3 (max visible)
```

---

## Troubleshooting

### Problem: Toasts not appearing

**Solution:**
- Check `toast-container` exists in HTML
- Check browser console for JavaScript errors
- Verify `showToast()` is being called

### Problem: Console still shows debug logs

**Solution:**
- Verify `DEBUG_MODE = false` in app.js
- Hard refresh browser (Ctrl+Shift+R)
- Clear cache

### Problem: Toast doesn't auto-dismiss

**Solution:**
- Check `duration` parameter (0 = persistent)
- Verify no JavaScript errors preventing timeout

### Problem: Retry button doesn't work

**Solution:**
- Check `action.callback` is a function
- Verify callback has access to required variables (use closures)

---

## Performance Considerations

### Memory Usage

- Toast DOM elements cleaned up after animation (300ms)
- Queue system prevents unbounded toast accumulation
- Max 3 toasts visible at once

### Network Impact

- Toast system is fully client-side (no requests)
- Minimal CSS/JS overhead (~3KB total)

### CPU Impact

- Animations use CSS transforms (GPU-accelerated)
- setTimeout cleanup is efficient
- No polling or intervals for toast system

---

## Future Enhancements

### Potential Improvements

1. **Toast History**
   - Show list of dismissed toasts
   - "View All" button

2. **Custom Toast Positions**
   - Top, bottom, left, right options
   - Per-toast positioning

3. **Sound Notifications**
   - Optional sound for critical errors
   - Accessibility improvement

4. **Dismiss on Swipe**
   - Swipe gesture to dismiss
   - Mobile UX improvement

5. **Toast Categories**
   - Group related toasts
   - "3 errors occurred" summary

---

## Summary

### What Changed

**Console Cleanup:**
- Added DEBUG_MODE flag
- Replaced 13 debug console.log with debug()
- Fixed 2 incorrect error logs
- Clean console in production

**Error Handling:**
- Implemented toast notification system
- Added toasts for 5 critical error scenarios
- Added retry mechanisms for recoverable errors
- Improved user feedback for all failures

### Impact

**Before:**
- Console spam (logs every 30-60 seconds)
- Silent failures (users unaware of errors)
- No recovery options

**After:**
- Clean console (DEBUG_MODE = false)
- User-friendly error notifications
- Retry buttons for recoverable errors
- Better error visibility

### Files Modified

| File | Changes | Lines |
|------|---------|-------|
| `app.js` | Debug flag, toast system, error notifications | +~160 |
| `index.html` | Toast container | +3 |
| `style.css` | Toast styles | +~130 |
| `ERROR_HANDLING.md` | Documentation | +~500 |

---

**Total Implementation:** ~800 lines added
**Risk Level:** Low (additive changes)
**Backward Compatible:** Yes
**Production Ready:** Yes
