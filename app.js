// Radio Player App
let audio = null;
let currentStation = null;
let loadedBulletinTimes = {
  rnz: null,
  newstalkzb: null
};
let bfmNowPlayingInterval = null;
let lastBfmTrackInfo = null;

// Memory leak prevention: Track intervals and initialization state
let newsUpdateInterval = null;
let isPlayerInitialized = false;
let currentAudioListeners = [];
let currentTestAudio = null;
let isScrubbing = false;
let updateBulletinControlsState = null;
let syncScrubUI = null;

// Debug mode flag - set to true for development debugging
const DEBUG_MODE = false;

// Helper function for debug logging
function debug(...args) {
  if (DEBUG_MODE) {
    console.log(...args);
  }
}

function setMediaSessionMetadata(title, artist) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || 'RadioLive',
      artist: artist || 'Live Radio',
      album: 'RadioLive',
      artwork: [
        { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        { src: 'favicon.png', sizes: '512x512', type: 'image/png' }
      ]
    });
  } catch (error) {
    console.warn('MediaSession metadata failed:', error);
  }
}

function updateMediaSessionState() {
  if (!('mediaSession' in navigator) || !audio) return;
  navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
}

function setupMediaSessionHandlers() {
  if (!('mediaSession' in navigator)) return;

  navigator.mediaSession.setActionHandler('play', () => {
    if (audio) {
      audio.play();
      updateMediaSessionState();
    }
  });
  navigator.mediaSession.setActionHandler('pause', () => {
    if (audio) {
      audio.pause();
      updateMediaSessionState();
    }
  });
  navigator.mediaSession.setActionHandler('stop', () => {
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      updateMediaSessionState();
    }
  });

  navigator.mediaSession.setActionHandler('seekbackward', (details) => {
    if (!audio || !isFinite(audio.duration)) return;
    const offset = details.seekOffset || 15;
    audio.currentTime = Math.max(0, (audio.currentTime || 0) - offset);
  });
  navigator.mediaSession.setActionHandler('seekforward', (details) => {
    if (!audio || !isFinite(audio.duration)) return;
    const offset = details.seekOffset || 15;
    audio.currentTime = Math.min(audio.duration, (audio.currentTime || 0) + offset);
  });
  navigator.mediaSession.setActionHandler('seekto', (details) => {
    if (!audio || !isFinite(audio.duration) || details.seekTime === undefined) return;
    audio.currentTime = Math.min(audio.duration, Math.max(0, details.seekTime));
  });
}

function isBulletinUrl(url) {
  try {
    const parsed = new URL(url);
    const isMp3 = parsed.pathname.endsWith('.mp3');
    const isKnownHost = [
      'podcast.radionz.co.nz',
      'weekondemand.newstalkzb.co.nz'
    ].some(host => parsed.hostname.includes(host));
    return isMp3 || isKnownHost;
  } catch (e) {
    return false;
  }
}

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const totalSeconds = Math.floor(seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// Toast notification system
let toastQueue = [];
let activeToasts = 0;
const MAX_TOASTS = 3;
let bfmMetadataFailures = 0;

function showToast(options) {
  const {
    title,
    message,
    type = 'info', // 'error', 'warning', 'info', 'success'
    duration = 5000,
    action = null, // { text: 'Retry', callback: fn }
    icon = null
  } = options;

  // Default icons based on type
  const icons = {
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    success: '✅'
  };

  const toastIcon = icon || icons[type] || icons.info;

  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  toast.innerHTML = `
    <div class="toast-icon">${toastIcon}</div>
    <div class="toast-content">
      ${title ? `<div class="toast-title">${title}</div>` : ''}
      <div class="toast-message">${message}</div>
    </div>
    ${action ? `<button class="toast-action">${action.text}</button>` : ''}
  `;

  // Enable swipe-to-dismiss in any direction
  attachToastSwipeHandlers(toast);

  // Add action handler if provided
  if (action) {
    const actionBtn = toast.querySelector('.toast-action');
    actionBtn.addEventListener('click', () => {
      action.callback();
      removeToast(toast);
    });
  }

  // Add to queue if too many toasts
  if (activeToasts >= MAX_TOASTS) {
    toastQueue.push({ toast, duration });
    return;
  }

  // Show toast
  const container = document.getElementById('toast-container');
  if (container) {
    container.appendChild(toast);
    activeToasts++;

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        removeToast(toast);
      }, duration);
    }
  }
}

function attachToastSwipeHandlers(toast) {
  let startX = 0;
  let startY = 0;
  let isDragging = false;
  const threshold = 45;

  const onPointerDown = (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    toast.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    toast.style.transform = `translate(${dx}px, ${dy}px)`;
    toast.style.opacity = `${Math.max(0.2, 1 - Math.min(Math.abs(dx), Math.abs(dy)) / 120)}`;
  };

  const onPointerUp = (e) => {
    if (!isDragging) return;
    isDragging = false;
    toast.releasePointerCapture(e.pointerId);
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
      removeToast(toast);
    } else {
      toast.style.transform = '';
      toast.style.opacity = '';
    }
  };

  toast.addEventListener('pointerdown', onPointerDown);
  toast.addEventListener('pointermove', onPointerMove);
  toast.addEventListener('pointerup', onPointerUp);
  toast.addEventListener('pointercancel', onPointerUp);
}

function removeToast(toast) {
  toast.classList.add('toast-out');
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
      activeToasts--;

      // Show next toast in queue
      if (toastQueue.length > 0) {
        const next = toastQueue.shift();
        const container = document.getElementById('toast-container');
        if (container) {
          container.appendChild(next.toast);
          activeToasts++;

          if (next.duration > 0) {
            setTimeout(() => removeToast(next.toast), next.duration);
          }
        }
      }
    }
  }, 300); // Match animation duration
}

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const isHttp = location.protocol === 'http:' || location.protocol === 'https:';
    const isSecure = isSecureContext;
    if (!isHttp || !isSecure) {
      // Service workers are not supported for file:// or insecure contexts.
      console.warn('Service Worker skipped: insecure or non-HTTP context');
      return;
    }

    const swUrl = new URL('sw.js', window.location.href).toString();
    navigator.serviceWorker.register(swUrl)
      .then((registration) => {
        console.log('Service Worker registered successfully:', registration.scope);
      })
      .catch((error) => {
        console.error('Service Worker registration failed:', error);
        showToast({
          title: 'Offline Mode Unavailable',
          message: 'App will work online only. Check your connection.',
          type: 'warning',
          duration: 8000
        });
      });
  });
}

// Get New Zealand time (handles both NZDT UTC+13 and NZST UTC+12 automatically)
function getNZDTTime() {
  // Use Intl API to get proper NZ time with automatic DST handling
  const now = new Date();

  // Format date parts in Pacific/Auckland timezone
  const formatter = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const dateParts = {};
  parts.forEach(part => {
    if (part.type !== 'literal') {
      dateParts[part.type] = part.value;
    }
  });

  // Construct a Date object with NZ time values
  // Note: This creates a Date in local timezone but with NZ time values
  const nzDate = new Date(
    parseInt(dateParts.year),
    parseInt(dateParts.month) - 1,
    parseInt(dateParts.day),
    parseInt(dateParts.hour),
    parseInt(dateParts.minute),
    parseInt(dateParts.second)
  );

  return nzDate;
}

// Format date for RNZ: YYYYMMDD-HHMM
function formatRNZDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  return `${year}${month}${day}-${hour}00`;
}

// Format date for NewstalkZB: YYYY.MM.DD-HH.00.00
function formatZBDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  return `${year}.${month}.${day}-${hour}.00.00`;
}

// Generate RNZ news bulletin URL
function getRNZNewsURL(hoursBack = 0) {
  const now = getNZDTTime();
  now.setHours(now.getHours() - hoursBack);
  const dateStr = formatRNZDate(now);
  return `https://podcast.radionz.co.nz/news/${dateStr}-064.mp3`;
}

// Generate NewstalkZB news URL
function getZBNewsURL(hoursBack = 0) {
  const now = getNZDTTime();
  now.setHours(now.getHours() - hoursBack);
  const dateStr = formatZBDate(now);
  return `https://weekondemand.newstalkzb.co.nz/WeekOnDemand/ZB/auckland/${dateStr}-D.mp3`;
}

// Update news button time displays
function updateNewsButtonTimes() {
  const now = getNZDTTime();
  const hour = now.getHours();
  const timeStr = `${String(hour).padStart(2, '0')}:00`;

  debug(`updateNewsButtonTimes called. Current hour: ${timeStr}`);
  debug(`Loaded bulletin times:`, loadedBulletinTimes);

  // Only update if no bulletin is currently loaded for that station
  if (loadedBulletinTimes.rnz === null) {
    debug(`Updating RNZ time to ${timeStr}`);
    document.getElementById('rnz-news-time').textContent = `${timeStr} bulletin`;
  } else {
    debug(`Not updating RNZ time, bulletin loaded for ${loadedBulletinTimes.rnz}:00`);
  }
  if (loadedBulletinTimes.newstalkzb === null) {
    debug(`Updating ZB time to ${timeStr}`);
    document.getElementById('ztb-news-time').textContent = `${timeStr} bulletin`;
  } else {
    debug(`Not updating ZB time, bulletin loaded for ${loadedBulletinTimes.newstalkzb}:00`);
  }
}

// Load news bulletin with fallback
function loadNewsBulletin(type, name) {
  // Start with current hour
  let hoursBack = 0;

  function tryLoadBulletin(attemptHoursBack) {
    const url = type === 'rnz' ? getRNZNewsURL(attemptHoursBack) : getZBNewsURL(attemptHoursBack);

    const now = getNZDTTime();
    now.setHours(now.getHours() - attemptHoursBack);
    const hour = String(now.getHours()).padStart(2, '0');

    debug(`Trying to load ${name} bulletin for ${hour}:00 from ${url}`);

    // Clean up previous test audio if exists
    if (currentTestAudio) {
      currentTestAudio.pause();
      currentTestAudio.src = '';
      currentTestAudio = null;
    }

    // Create temporary audio to test
    currentTestAudio = new Audio(url);
    const testAudio = currentTestAudio;

    const canplayHandler = () => {
      console.log(`Successfully loaded ${name} ${hour}:00 bulletin`);

      // Update the button label to match the actual bulletin hour
      const buttonId = type === 'rnz' ? 'rnz-news-time' : 'ztb-news-time';
      document.getElementById(buttonId).textContent = `${hour}:00 bulletin`;

      // Store the loaded bulletin time to prevent auto-update from overwriting it
      loadedBulletinTimes[type] = hour;
      debug(`Stored bulletin time for ${type}: ${hour}`);

      loadStation(url, `${name} ${hour}:00 News`);
      const nowPlayingElem = document.getElementById('now-playing');
      nowPlayingElem.childNodes[0].textContent = `Playing: ${name} ${hour}:00 News`;
      document.getElementById('play-pause-btn').disabled = false;

      // Clean up test audio after successful load
      testAudio.removeEventListener('canplay', canplayHandler);
      testAudio.removeEventListener('error', errorHandler);
      currentTestAudio = null;
    };

    const errorHandler = (e) => {
      console.error(`Failed to load ${name} ${hour}:00 bulletin, error:`, e);

      // Clean up this test audio
      testAudio.removeEventListener('canplay', canplayHandler);
      testAudio.removeEventListener('error', errorHandler);
      testAudio.pause();
      testAudio.src = '';

      // Try previous hour if this is first attempt
      if (attemptHoursBack === 0) {
        console.log(`Falling back to previous hour`);
        currentTestAudio = null;
        tryLoadBulletin(1);
      } else {
        // Both failed, just try to load anyway
        console.error(`Both attempts failed for ${name} news`);
        currentTestAudio = null;
        loadStation(url, `${name} News`);
        const nowPlayingElem = document.getElementById('now-playing');
        nowPlayingElem.childNodes[0].textContent = `Trying to load ${name} News...`;
        document.getElementById('play-pause-btn').disabled = false;

        // Show toast notification
        showToast({
          title: 'News Bulletin Unavailable',
          message: `Unable to load ${name} news bulletin. The service may be temporarily down.`,
          type: 'error',
          duration: 7000
        });
      }
    };

    testAudio.addEventListener('canplay', canplayHandler);
    testAudio.addEventListener('error', errorHandler);
  }

  tryLoadBulletin(hoursBack);
}

// Initialize audio player
function initializePlayer() {
  // Prevent multiple initializations
  if (isPlayerInitialized) {
    debug('Player already initialized, skipping');
    return;
  }
  isPlayerInitialized = true;

  const stationsList = document.querySelector('.stations');
  const stationButtons = document.querySelectorAll('.station-btn');
  const newsButtons = document.querySelectorAll('.news-btn');
  const playPauseBtn = document.getElementById('play-pause-btn');
  const volumeSlider = document.getElementById('volume-slider');
  const nowPlaying = document.getElementById('now-playing');
  const playIcon = document.querySelector('.play-icon');
  const pauseIcon = document.querySelector('.pause-icon');
  const refreshBfmBtn = document.getElementById('refresh-bfm-btn');
  const bulletinControls = document.getElementById('bulletin-controls');
  const scrubSlider = document.getElementById('scrub-slider');
  const currentTimeLabel = document.getElementById('current-time');
  const durationTimeLabel = document.getElementById('duration-time');
  const skipBackBtn = document.getElementById('skip-back-btn');
  const skipForwardBtn = document.getElementById('skip-forward-btn');

  // Update news button times
  updateNewsButtonTimes();
  setupMediaSessionHandlers();
  // Refresh times every minute (clear old interval if exists)
  if (newsUpdateInterval) {
    clearInterval(newsUpdateInterval);
  }
  newsUpdateInterval = setInterval(updateNewsButtonTimes, 60000);

  // Refresh 95bFM metadata button
  refreshBfmBtn.addEventListener('click', () => {
    fetch95bFMNowPlaying();
  });

  // Station selection
  stationButtons.forEach(button => {
    button.addEventListener('click', () => {
      const url = button.getAttribute('data-url');
      const name = button.getAttribute('data-name');

      // Update active state
      stationButtons.forEach(btn => btn.classList.remove('active'));
      newsButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      // Reset bulletin times when switching to live station
      loadedBulletinTimes.rnz = null;
      loadedBulletinTimes.newstalkzb = null;
      updateNewsButtonTimes();

      // Load new station
      loadStation(url, name);
      // Update text while preserving the button - use firstChild to get text node
      const textNode = nowPlaying.firstChild;
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        textNode.textContent = `Now Playing: ${name}`;
      } else {
        // Fallback if DOM structure changes
        nowPlaying.childNodes[0].textContent = `Now Playing: ${name}`;
      }
      playPauseBtn.disabled = false;
    });
  });

  // Restore saved station order before enabling drag/drop
  if (stationsList) {
    restoreStationOrder(stationsList);
    enableStationReorder(stationsList);
  }

  // News bulletin selection
  newsButtons.forEach(button => {
    button.addEventListener('click', () => {
      const type = button.getAttribute('data-type');
      const name = type === 'rnz' ? 'RNZ' : 'NewstalkZB';

      // Update active state
      stationButtons.forEach(btn => btn.classList.remove('active'));
      newsButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      // Load news bulletin with fallback
      loadNewsBulletin(type, name);
    });
  });

  // Play/Pause control
  playPauseBtn.addEventListener('click', () => {
    if (!audio) return;

    const onAirIndicator = document.getElementById('on-air-indicator');
    const onAirText = document.querySelector('.on-air-text');

    if (audio.paused) {
      audio.play();
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'inline';
      playPauseBtn.classList.add('playing');
      onAirIndicator.classList.add('live');
      onAirText.textContent = 'ON AIR';
      updateMediaSessionState();
    } else {
      audio.pause();
      playIcon.style.display = 'inline';
      pauseIcon.style.display = 'none';
      playPauseBtn.classList.remove('playing');
      onAirIndicator.classList.remove('live');
      onAirText.textContent = 'OFF AIR';
      updateMediaSessionState();
    }
  });

  // Volume control with validation
  volumeSlider.addEventListener('input', (e) => {
    if (audio) {
      const value = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
      audio.volume = value / 100;
      // Update slider to validated value
      e.target.value = value;
    }
    updateVolumeSliderFill();
  });

  function updateVolumeSliderFill() {
    if (!volumeSlider) return;
    const value = Math.max(0, Math.min(100, parseInt(volumeSlider.value) || 0));
    volumeSlider.style.setProperty('--volume-fill', `${value}%`);
  }
  updateVolumeSliderFill();

  function setBulletinControlsVisible(visible) {
    if (!bulletinControls) return;
    bulletinControls.classList.toggle('active', visible);
    bulletinControls.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  function isSeekableAudio() {
    return audio && isFinite(audio.duration) && audio.duration > 0 && audio.seekable && audio.seekable.length > 0;
  }

  function syncScrubUIInternal() {
    if (!scrubSlider || !currentTimeLabel || !durationTimeLabel) return;
    if (!audio) {
      currentTimeLabel.textContent = '0:00';
      durationTimeLabel.textContent = '0:00';
      scrubSlider.value = 0;
      scrubSlider.max = 100;
      return;
    }

    const duration = isFinite(audio.duration) ? audio.duration : 0;
    durationTimeLabel.textContent = formatTime(duration);
    currentTimeLabel.textContent = formatTime(audio.currentTime);

    if (!isScrubbing) {
      scrubSlider.max = duration || 0;
      scrubSlider.value = audio.currentTime || 0;
    }
  }

  function updateBulletinControlsStateInternal() {
    const shouldShow = currentStation && currentStation.isBulletin && isSeekableAudio();
    setBulletinControlsVisible(shouldShow);
    if (skipBackBtn) skipBackBtn.disabled = !shouldShow;
    if (skipForwardBtn) skipForwardBtn.disabled = !shouldShow;
    if (scrubSlider) scrubSlider.disabled = !shouldShow;
    if (shouldShow) {
      syncScrubUIInternal();
    }
  }

  // Scrub slider interactions
  if (scrubSlider) {
    scrubSlider.addEventListener('input', (e) => {
      if (!isSeekableAudio()) return;
      isScrubbing = true;
      const target = Math.max(0, Math.min(audio.duration || 0, parseFloat(e.target.value) || 0));
      audio.currentTime = target;
      syncScrubUIInternal();
    });

    scrubSlider.addEventListener('change', () => {
      isScrubbing = false;
      syncScrubUIInternal();
    });

    scrubSlider.addEventListener('pointerdown', () => {
      isScrubbing = true;
    });
    scrubSlider.addEventListener('pointerup', () => {
      isScrubbing = false;
      syncScrubUIInternal();
    });
  }

  // Skip controls
  if (skipBackBtn) {
    skipBackBtn.addEventListener('click', () => {
      if (!isSeekableAudio()) return;
      const nextTime = Math.max(0, (audio.currentTime || 0) - 15);
      audio.currentTime = nextTime;
      syncScrubUIInternal();
    });
  }
  if (skipForwardBtn) {
    skipForwardBtn.addEventListener('click', () => {
      if (!isSeekableAudio()) return;
      const duration = audio.duration || 0;
      const nextTime = Math.min(duration, (audio.currentTime || 0) + 15);
      audio.currentTime = nextTime;
      syncScrubUIInternal();
    });
  }

  // Expose for loadStation updates
  updateBulletinControlsState = updateBulletinControlsStateInternal;
  syncScrubUI = syncScrubUIInternal;
}

function restoreStationOrder(stationsList) {
  if (!stationsList) return;
  let saved = [];
  try {
    saved = JSON.parse(localStorage.getItem('stationOrderV1') || '[]');
  } catch (e) {
    saved = [];
  }
  if (!Array.isArray(saved) || saved.length === 0) return;

  const buttons = Array.from(stationsList.querySelectorAll('.station-btn'));
  const map = new Map(buttons.map(btn => [btn.getAttribute('data-url'), btn]));

  saved.forEach((url) => {
    const btn = map.get(url);
    if (btn) {
      stationsList.appendChild(btn);
      map.delete(url);
    }
  });
  // Append any new stations not in saved order
  map.forEach((btn) => stationsList.appendChild(btn));
}

function saveStationOrder(stationsList) {
  if (!stationsList) return;
  const order = Array.from(stationsList.querySelectorAll('.station-btn'))
    .map(btn => btn.getAttribute('data-url'))
    .filter(Boolean);
  try {
    localStorage.setItem('stationOrderV1', JSON.stringify(order));
  } catch (e) {
    console.warn('Failed to save station order:', e);
  }
}

function enableStationReorder(stationsList) {
  if (!stationsList) return;
  let draggedButton = null;
  let ghost = null;
  let placeholder = null;
  let longPressTimer = null;
  let isDragging = false;
  let dragStartY = 0;
  let ghostOffsetY = 0;
  let latestClientY = 0;
  let rafPending = false;
  const longPressDelay = 260;
  const moveThreshold = 8;
  let onWindowMove = null;
  let onWindowUp = null;

  stationsList.querySelectorAll('.station-btn').forEach((btn) => {
    btn.setAttribute('draggable', 'false');
    const handle = btn.querySelector('.drag-handle');
    if (!handle) return;

    handle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    // Prevent iOS text selection/callout on long-press
    handle.addEventListener('touchstart', (e) => {
      e.preventDefault();
    }, { passive: false });

    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragStartY = e.clientY;
      longPressTimer = setTimeout(() => {
        beginDrag(btn, e);
      }, longPressDelay);
    });

    handle.addEventListener('pointermove', (e) => {
      if (!longPressTimer || isDragging) return;
      if (Math.abs(e.clientY - dragStartY) > moveThreshold) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    });

    handle.addEventListener('pointerup', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (isDragging) {
        finishDrag();
      }
    });

    handle.addEventListener('pointercancel', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (isDragging) {
        finishDrag();
      }
    });
  });

  function beginDrag(btn, e) {
    if (isDragging) return;
    isDragging = true;
    draggedButton = btn;
    longPressTimer = null;
    document.body.classList.add('reordering');

    const rect = draggedButton.getBoundingClientRect();
    ghostOffsetY = e.clientY - rect.top;
    latestClientY = e.clientY;

    placeholder = document.createElement('div');
    placeholder.className = 'station-btn reorder-placeholder';
    placeholder.style.height = `${rect.height}px`;

    ghost = draggedButton.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.width = `${rect.width}px`;
    ghost.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;

    draggedButton.parentNode.insertBefore(placeholder, draggedButton);
    draggedButton.style.display = 'none';
    document.body.appendChild(ghost);

    onWindowMove = (evt) => {
      if (!isDragging || !ghost) return;
      evt.preventDefault();
      latestClientY = evt.clientY;
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(updateDrag);
      }
    };
    onWindowUp = () => {
      if (isDragging) {
        finishDrag();
      }
    };
    window.addEventListener('pointermove', onWindowMove, { passive: false });
    window.addEventListener('pointerup', onWindowUp);
    window.addEventListener('pointercancel', onWindowUp);

    updateDrag();
  }

  function updateDrag() {
    rafPending = false;
    if (!ghost) return;

    const listRect = stationsList.getBoundingClientRect();
    const ghostTop = latestClientY - ghostOffsetY;
    ghost.style.transform = `translate3d(${listRect.left}px, ${ghostTop}px, 0)`;

    const items = Array.from(stationsList.querySelectorAll('.station-btn'))
      .filter((el) => el !== placeholder && el !== draggedButton);

    let insertBeforeNode = null;
    for (const item of items) {
      const box = item.getBoundingClientRect();
      const midpoint = box.top + box.height / 2;
      if (latestClientY < midpoint) {
        insertBeforeNode = item;
        break;
      }
    }

    if (insertBeforeNode) {
      if (insertBeforeNode !== placeholder) {
        stationsList.insertBefore(placeholder, insertBeforeNode);
      }
    } else {
      stationsList.appendChild(placeholder);
    }
  }

  function finishDrag() {
    isDragging = false;
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (onWindowMove) {
      window.removeEventListener('pointermove', onWindowMove);
      onWindowMove = null;
    }
    if (onWindowUp) {
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowUp);
      onWindowUp = null;
    }
    if (ghost) {
      ghost.remove();
      ghost = null;
    }
    if (placeholder && draggedButton) {
      stationsList.insertBefore(draggedButton, placeholder);
      placeholder.remove();
      placeholder = null;
    }
    if (draggedButton) {
      draggedButton.style.display = '';
    }
    draggedButton = null;
    document.body.classList.remove('reordering');
    saveStationOrder(stationsList);
  }
}

// Show/hide loading bar
function showLoading() {
  const loadingBar = document.getElementById('loading-bar');
  if (loadingBar) {
    loadingBar.style.display = 'block';
  }
}

function hideLoading() {
  const loadingBar = document.getElementById('loading-bar');
  if (loadingBar) {
    loadingBar.style.display = 'none';
  }
}

// Load and play station
function loadStation(url, name) {
  // Show loading bar
  showLoading();

  // Clean up old audio and its event listeners
  if (audio) {
    audio.pause();
    // Remove all stored event listeners to prevent memory leaks
    currentAudioListeners.forEach(({ event, handler }) => {
      audio.removeEventListener(event, handler);
    });
    currentAudioListeners = [];
    audio = null;
  }

  // Create new audio element
  audio = new Audio(url);
  audio.volume = document.getElementById('volume-slider').value / 100;

  // Auto-play when loaded
  const canplayHandler = () => {
    hideLoading();
    audio.play();
    document.querySelector('.play-icon').style.display = 'none';
    document.querySelector('.pause-icon').style.display = 'inline';
    document.getElementById('play-pause-btn').classList.add('playing');
    updateMediaSessionState();
  };
  audio.addEventListener('canplay', canplayHandler);
  currentAudioListeners.push({ event: 'canplay', handler: canplayHandler });

  // Handle errors
  const errorHandler = (e) => {
    hideLoading();
    console.error('Audio error:', e);
    const nowPlayingElem = document.getElementById('now-playing');
    // Update text while preserving the button
    const textNode = nowPlayingElem.firstChild;
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      textNode.textContent = `Error loading ${name}`;
    } else {
      nowPlayingElem.childNodes[0].textContent = `Error loading ${name}`;
    }

    // Show toast notification with retry option
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

    const onAirIndicator = document.getElementById('on-air-indicator');
    const onAirText = document.querySelector('.on-air-text');
    onAirIndicator.classList.remove('live');
    onAirText.textContent = 'OFF AIR';
    updateMediaSessionState();
  };
  audio.addEventListener('error', errorHandler);
  currentAudioListeners.push({ event: 'error', handler: errorHandler });

  // Show loading state while waiting
  const waitingHandler = () => {
    showLoading();
  };
  audio.addEventListener('waiting', waitingHandler);
  currentAudioListeners.push({ event: 'waiting', handler: waitingHandler });

  // Hide loading when playing
  const playingHandler = () => {
    hideLoading();
    const onAirIndicator = document.getElementById('on-air-indicator');
    const onAirText = document.querySelector('.on-air-text');
    onAirIndicator.classList.add('live');
    onAirText.textContent = 'ON AIR';
    updateMediaSessionState();
  };
  audio.addEventListener('playing', playingHandler);
  currentAudioListeners.push({ event: 'playing', handler: playingHandler });

  // Handle audio end (for bulletins)
  const endedHandler = () => {
    const onAirIndicator = document.getElementById('on-air-indicator');
    const onAirText = document.querySelector('.on-air-text');
    onAirIndicator.classList.remove('live');
    onAirText.textContent = 'OFF AIR';
    document.querySelector('.play-icon').style.display = 'inline';
    document.querySelector('.pause-icon').style.display = 'none';
    document.getElementById('play-pause-btn').classList.remove('playing');
    updateMediaSessionState();
  };
  audio.addEventListener('ended', endedHandler);
  currentAudioListeners.push({ event: 'ended', handler: endedHandler });

  currentStation = { url, name, isBulletin: isBulletinUrl(url) || name.includes('News') };
  setMediaSessionMetadata(name, currentStation.isBulletin ? 'News Bulletin' : 'Live Radio');
  if (updateBulletinControlsState) {
    updateBulletinControlsState();
  }

  // Update bulletin controls visibility on metadata/time changes
  const metadataHandler = () => {
    if (updateBulletinControlsState) {
      updateBulletinControlsState();
    }
  };
  audio.addEventListener('loadedmetadata', metadataHandler);
  currentAudioListeners.push({ event: 'loadedmetadata', handler: metadataHandler });

  const durationHandler = () => {
    if (updateBulletinControlsState) {
      updateBulletinControlsState();
    }
  };
  audio.addEventListener('durationchange', durationHandler);
  currentAudioListeners.push({ event: 'durationchange', handler: durationHandler });

  const timeUpdateHandler = () => {
    if (syncScrubUI) {
      syncScrubUI();
    }
  };
  audio.addEventListener('timeupdate', timeUpdateHandler);
  currentAudioListeners.push({ event: 'timeupdate', handler: timeUpdateHandler });

  // Clear old 95bFM interval if it exists (prevent race condition)
  if (bfmNowPlayingInterval) {
    clearInterval(bfmNowPlayingInterval);
    bfmNowPlayingInterval = null;
  }

  // Start fetching 95bFM now playing if it's 95bFM
  const refreshBtn = document.getElementById('refresh-bfm-btn');
  if (name === '95bFM') {
    lastBfmTrackInfo = null; // Reset track info when starting 95bFM
    fetch95bFMNowPlaying();
    // Update every 30 seconds
    bfmNowPlayingInterval = setInterval(fetch95bFMNowPlaying, 30000);
    // Show refresh button
    refreshBtn.style.display = 'inline-block';
  } else {
    lastBfmTrackInfo = null; // Reset track info when leaving 95bFM
    // Hide refresh button
    refreshBtn.style.display = 'none';
  }
}

// Fetch 95bFM now playing information
async function fetch95bFMNowPlaying() {
  // Only fetch if we're currently on 95bFM
  if (!currentStation || currentStation.name !== '95bFM') {
    debug('Not fetching 95bFM data - not currently playing 95bFM');
    return;
  }

  try {
    debug('Fetching 95bFM now playing...');
    // Use CORS proxy to fetch the page with longer timeout
    const proxyUrl = 'https://api.allorigins.win/raw?url=';
    const targetUrl = encodeURIComponent('https://95bfm.com/');

    // Create abort controller with 20 second timeout for slow proxy
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(proxyUrl + targetUrl, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();

      // Parse the HTML to find the now playing track
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Find the track info in the views field
      const trackElements = doc.querySelectorAll('.views-field-nothing .field-content');
      let trackInfo = null;

      for (let elem of trackElements) {
        const text = elem.textContent.trim();
        // Look for "Artist - Song" pattern, filter out noise
        if (text.includes(' - ') &&
            !text.includes('On now') &&
            !text.includes('DJs') &&
            !text.includes('Show') &&
            text.length > 5 && // Avoid very short strings
            text.length < 200) { // Avoid long descriptions
          trackInfo = text;
          break;
        }
      }

      // Only update if we found valid track info and it's different
      if (trackInfo && trackInfo !== lastBfmTrackInfo) {
        const nowPlaying = document.getElementById('now-playing');
        // Double-check we're still on 95bFM before updating
        if (currentStation && currentStation.name === '95bFM') {
          // Find the first text node (before the button)
          const textNode = nowPlaying.firstChild;
          if (textNode && textNode.nodeType === Node.TEXT_NODE) {
            textNode.textContent = `Now Playing: ${trackInfo}`;
          } else {
            // Fallback: use childNodes[0] if structure is different
            nowPlaying.childNodes[0].textContent = `Now Playing: ${trackInfo}`;
          }
          lastBfmTrackInfo = trackInfo;
          console.log('✓ Updated 95bFM track:', trackInfo);
          setMediaSessionMetadata(trackInfo, '95bFM');
          // Reset failure count on success
          bfmMetadataFailures = 0;
        }
      } else if (!trackInfo) {
        debug('No track info found in HTML');
      } else {
        debug('Track info unchanged:', trackInfo);
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError; // Re-throw to outer catch
    }
  } catch (error) {
    // Less verbose error logging - timeouts are common with CORS proxies
    if (error.name === 'AbortError') {
      console.warn('95bFM fetch timed out (proxy may be slow)');
      bfmMetadataFailures++;
    } else {
      console.error('Error fetching 95bFM now playing:', error);
      bfmMetadataFailures++;
    }

    // Show toast after 3 consecutive failures
    if (bfmMetadataFailures === 3) {
      showToast({
        title: '95bFM Metadata Unavailable',
        message: 'Unable to fetch track information. The metadata service may be down.',
        type: 'warning',
        duration: 8000
      });
    }

    // Only show fallback if we're still on 95bFM and haven't shown track info yet
    if (currentStation && currentStation.name === '95bFM' && !lastBfmTrackInfo) {
      const nowPlaying = document.getElementById('now-playing');
      const currentText = nowPlaying.textContent || '';
      // Only update if it's not already showing 95bFM
      if (!currentText.includes('95bFM')) {
        const textNode = nowPlaying.firstChild;
        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
          textNode.textContent = 'Now Playing: 95bFM';
        } else {
          nowPlaying.childNodes[0].textContent = 'Now Playing: 95bFM';
        }
      }
    }
  }
}

// Update online/offline status
function updateOnlineStatus() {
  const statusElement = document.getElementById('online-status');
  const statusIndicator = document.querySelector('.status-indicator');

  if (navigator.onLine) {
    statusElement.textContent = 'Online';
    statusElement.classList.remove('offline');
    statusIndicator.style.backgroundColor = '#e8f5e9';

    // Show back online notification if there were offline toasts
    const container = document.getElementById('toast-container');
    if (container && container.children.length > 0) {
      showToast({
        title: 'Back Online',
        message: 'Internet connection restored.',
        type: 'success',
        duration: 4000,
        icon: '✅'
      });
    }
  } else {
    statusElement.textContent = 'Offline - Streaming unavailable';
    statusElement.classList.add('offline');
    statusIndicator.style.backgroundColor = '#ffebee';

    // Show offline notification
    showToast({
      title: 'No Internet Connection',
      message: 'Streaming is unavailable while offline.',
      type: 'error',
      duration: 0, // Keep until dismissed or back online
      icon: '📡'
    });

    // Pause audio when offline
    if (audio && !audio.paused) {
      audio.pause();
    }
  }
}

// Listen for online/offline events
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// Clean up resources before page unload to prevent memory leaks
window.addEventListener('beforeunload', () => {
  // Clear all intervals
  if (newsUpdateInterval) {
    clearInterval(newsUpdateInterval);
    newsUpdateInterval = null;
  }
  if (bfmNowPlayingInterval) {
    clearInterval(bfmNowPlayingInterval);
    bfmNowPlayingInterval = null;
  }

  // Clean up audio and its listeners
  if (audio) {
    audio.pause();
    currentAudioListeners.forEach(({ event, handler }) => {
      audio.removeEventListener(event, handler);
    });
    currentAudioListeners = [];
    audio = null;
  }

  // Clean up test audio
  if (currentTestAudio) {
    currentTestAudio.pause();
    currentTestAudio.src = '';
    currentTestAudio = null;
  }
});

// Initialize on load
window.addEventListener('load', () => {
  initializePlayer();
  updateOnlineStatus();
});
