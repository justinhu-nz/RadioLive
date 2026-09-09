// Radio Player App
let audio = null;
let currentStation = null;
let loadedBulletinTimes = {
  rnz: null,
  newstalkzb: null
};
let bfmNowPlayingInterval = null;
let bfmMetadataController = null;
let lastBfmTrackInfo = null;

// Memory leak prevention: Track intervals and initialization state
let newsUpdateInterval = null;
let isPlayerInitialized = false;
let currentAudioListeners = [];
let currentTestAudio = null;
let currentTestAudioCleanup = null;
let bulletinLoadRequestId = 0;
let isScrubbing = false;
let updateBulletinControlsState = null;
let syncScrubUI = null;
let isEditMode = false;
let currentSpeed = 1;

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

  const handlers = {
    play: () => playCurrentAudio(true),
    pause: () => {
      if (audio) audio.pause();
    },
    stop: () => {
      if (!audio) return;
      audio.pause();
      if (isFinite(audio.duration)) audio.currentTime = 0;
    },
    seekbackward: (details) => {
      if (!audio || !isFinite(audio.duration)) return;
      audio.currentTime = Math.max(0, (audio.currentTime || 0) - (details.seekOffset || 15));
    },
    seekforward: (details) => {
      if (!audio || !isFinite(audio.duration)) return;
      audio.currentTime = Math.min(audio.duration, (audio.currentTime || 0) + (details.seekOffset || 15));
    },
    seekto: (details) => {
      if (!audio || !isFinite(audio.duration) || details.seekTime === undefined) return;
      audio.currentTime = Math.min(audio.duration, Math.max(0, details.seekTime));
    }
  };

  Object.entries(handlers).forEach(([action, handler]) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch (error) {
      debug(`Media Session action unsupported: ${action}`, error);
    }
  });
}

async function playCurrentAudio(showBlockedNotice = false) {
  const targetAudio = audio;
  if (!targetAudio) return false;

  try {
    await targetAudio.play();
    return targetAudio === audio && !targetAudio.paused;
  } catch (error) {
    if (targetAudio !== audio) return false;
    updatePlaybackUI(false);
    updateMediaSessionState();
    if (showBlockedNotice && error.name === 'NotAllowedError') {
      showToast({
        title: 'Tap Play to Start',
        message: 'Your browser blocked automatic playback.',
        type: 'info',
        duration: 5000
      });
    } else if (error.name !== 'AbortError') {
      console.error('Playback failed:', error);
    }
    return false;
  }
}

function updatePlaybackUI(isPlaying) {
  const playIcon = document.querySelector('.play-icon');
  const pauseIcon = document.querySelector('.pause-icon');
  const playPauseBtn = document.getElementById('play-pause-btn');
  const onAirIndicator = document.getElementById('on-air-indicator');
  const onAirText = document.querySelector('.on-air-text');

  if (playIcon) playIcon.style.display = isPlaying ? 'none' : 'inline';
  if (pauseIcon) pauseIcon.style.display = isPlaying ? 'inline' : 'none';
  if (playPauseBtn) playPauseBtn.classList.toggle('playing', isPlaying);
  if (onAirIndicator) onAirIndicator.classList.toggle('live', isPlaying);
  if (onAirText) onAirText.textContent = isPlaying ? 'ON AIR' : 'OFF AIR';
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
let offlineToast = null;
let wasOffline = false;

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
    return toast;
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

  return toast;
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
  if (!toast || toast.classList.contains('toast-out')) return;
  if (toast === offlineToast) offlineToast = null;

  const queuedIndex = toastQueue.findIndex(item => item.toast === toast);
  if (queuedIndex !== -1) {
    toastQueue.splice(queuedIndex, 1);
    return;
  }

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
    hourCycle: 'h23'
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

// Check if NZ is currently in daylight saving (NZDT).
// NewstalkZB suffixes files with "D" during NZDT and "S" during NZST.
function isNZDST() {
  const now = new Date();
  const year = now.getUTCFullYear();

  function offsetMinutes(date) {
    const parts = new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland',
      timeZoneName: 'longOffset'
    }).formatToParts(date);
    const value = parts.find(part => part.type === 'timeZoneName')?.value || '';
    const match = value.match(/GMT([+-])(\d{2}):?(\d{2})?/);
    if (!match) return null;
    const minutes = Number(match[2]) * 60 + Number(match[3] || 0);
    return match[1] === '-' ? -minutes : minutes;
  }

  const currentOffset = offsetMinutes(now);
  const januaryOffset = offsetMinutes(new Date(Date.UTC(year, 0, 1)));
  const julyOffset = offsetMinutes(new Date(Date.UTC(year, 6, 1)));
  if (currentOffset === null || januaryOffset === null || julyOffset === null) {
    // Compatibility fallback for browsers without longOffset support.
    const zoneName = new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland',
      timeZoneName: 'short'
    }).format(now);
    return zoneName.includes('NZDT') || zoneName.includes('GMT+13');
  }
  return currentOffset > Math.min(januaryOffset, julyOffset);
}

// Generate NewstalkZB news URL
function getZBNewsURL(hoursBack = 0) {
  const now = getNZDTTime();
  now.setHours(now.getHours() - hoursBack);
  const dateStr = formatZBDate(now);
  const suffix = isNZDST() ? 'D' : 'S';
  return `https://weekondemand.newstalkzb.co.nz/WeekOnDemand/ZB/auckland/${dateStr}-${suffix}.mp3`;
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

function cancelBulletinProbe() {
  bulletinLoadRequestId++;
  if (currentTestAudioCleanup) {
    currentTestAudioCleanup();
    currentTestAudioCleanup = null;
  }
  currentTestAudio = null;
}

// Load news bulletin with fallback
function loadNewsBulletin(type, name) {
  cancelBulletinProbe();
  const requestId = bulletinLoadRequestId;
  // Start with current hour
  let hoursBack = 0;

  function tryLoadBulletin(attemptHoursBack) {
    if (requestId !== bulletinLoadRequestId) return;
    const url = type === 'rnz' ? getRNZNewsURL(attemptHoursBack) : getZBNewsURL(attemptHoursBack);

    const now = getNZDTTime();
    now.setHours(now.getHours() - attemptHoursBack);
    const hour = String(now.getHours()).padStart(2, '0');

    debug(`Trying to load ${name} bulletin for ${hour}:00 from ${url}`);

    // Create temporary audio to test
    currentTestAudio = new Audio(url);
    const testAudio = currentTestAudio;

    const cleanupTestAudio = () => {
      testAudio.removeEventListener('canplay', canplayHandler);
      testAudio.removeEventListener('error', errorHandler);
      testAudio.pause();
      testAudio.removeAttribute('src');
      testAudio.load();
      if (currentTestAudio === testAudio) currentTestAudio = null;
      if (currentTestAudioCleanup === cleanupTestAudio) currentTestAudioCleanup = null;
    };

    const canplayHandler = () => {
      if (requestId !== bulletinLoadRequestId) {
        cleanupTestAudio();
        return;
      }
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

      cleanupTestAudio();
    };

    const errorHandler = (e) => {
      if (requestId !== bulletinLoadRequestId) {
        cleanupTestAudio();
        return;
      }
      console.error(`Failed to load ${name} ${hour}:00 bulletin, error:`, e);

      // Clean up this test audio
      cleanupTestAudio();

      // Try previous hour if this is first attempt
      if (attemptHoursBack === 0) {
        console.log(`Falling back to previous hour`);
        tryLoadBulletin(1);
      } else {
        // Both failed, just try to load anyway
        console.error(`Both attempts failed for ${name} news`);
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
    currentTestAudioCleanup = cleanupTestAudio;
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
  const refreshBfmBtn = document.getElementById('refresh-bfm-btn');
  const bulletinControls = document.getElementById('bulletin-controls');
  const scrubSlider = document.getElementById('scrub-slider');
  const currentTimeLabel = document.getElementById('current-time');
  const durationTimeLabel = document.getElementById('duration-time');
  const skipBackBtn = document.getElementById('skip-back-btn');
  const skipForwardBtn = document.getElementById('skip-forward-btn');
  const speedStrip = document.getElementById('speed-strip');
  const speedTrack = speedStrip ? speedStrip.querySelector('.speed-track') : null;
  const speedIndicator = document.getElementById('speed-indicator');
  const speedOptions = speedStrip ? Array.from(speedStrip.querySelectorAll('.speed-option')) : [];

  // Position the sliding indicator behind the active option
  function positionIndicator(animate) {
    if (!speedTrack || !speedIndicator) return;
    const activeOpt = speedOptions.find(opt => parseFloat(opt.dataset.speed) === currentSpeed);
    if (!activeOpt) return;
    const trackRect = speedTrack.getBoundingClientRect();
    const optRect = activeOpt.getBoundingClientRect();
    if (trackRect.width === 0) return;
    if (!animate) speedIndicator.style.transition = 'none';
    speedIndicator.style.left = `${optRect.left - trackRect.left}px`;
    speedIndicator.style.width = `${optRect.width}px`;
    if (!animate) requestAnimationFrame(() => { speedIndicator.style.transition = ''; });
  }

  // Playback speed control
  function setPlaybackSpeed(speed) {
    currentSpeed = speed;
    speedOptions.forEach(opt => {
      opt.classList.toggle('active', parseFloat(opt.dataset.speed) === speed);
    });
    if (audio) audio.playbackRate = speed;
    if (navigator.vibrate) navigator.vibrate(8);
    positionIndicator(true);
    if (speedIndicator) speedIndicator.classList.toggle('elevated', speed > 1);
  }

  speedOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      setPlaybackSpeed(parseFloat(opt.dataset.speed));
    });
  });

  // Drag-to-slide gesture on speed track
  if (speedTrack) {
    let dragState = null;

    function computeZones() {
      return speedOptions.map(opt => {
        const r = opt.getBoundingClientRect();
        return { left: r.left, right: r.right, speed: parseFloat(opt.dataset.speed) };
      });
    }

    function zoneAtX(zones, clientX) {
      if (clientX <= zones[0].right) return zones[0];
      if (clientX >= zones[zones.length - 1].left) return zones[zones.length - 1];
      return zones.find(z => clientX >= z.left && clientX < z.right) || zones[0];
    }

    speedTrack.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      speedTrack.setPointerCapture(e.pointerId);
      dragState = { pointerId: e.pointerId, startX: e.clientX, moved: false, zones: computeZones() };
    });

    speedTrack.addEventListener('pointermove', (e) => {
      if (!dragState || e.pointerId !== dragState.pointerId) return;
      if (!dragState.moved && Math.abs(e.clientX - dragState.startX) < 4) return;
      dragState.moved = true;
      const zone = zoneAtX(dragState.zones, e.clientX);
      speedOptions.forEach(opt => opt.classList.toggle('active', parseFloat(opt.dataset.speed) === zone.speed));
      const matchOpt = speedOptions.find(opt => parseFloat(opt.dataset.speed) === zone.speed);
      if (matchOpt && speedTrack) {
        const tr = speedTrack.getBoundingClientRect();
        const or = matchOpt.getBoundingClientRect();
        speedIndicator.style.transition = 'none';
        speedIndicator.style.left = `${or.left - tr.left}px`;
        speedIndicator.style.width = `${or.width}px`;
      }
    });

    speedTrack.addEventListener('pointerup', (e) => {
      if (!dragState || e.pointerId !== dragState.pointerId) return;
      const wasDrag = dragState.moved;
      dragState = null;
      if (wasDrag) {
        speedIndicator.style.transition = '';
        const activeOpt = speedOptions.find(opt => opt.classList.contains('active'));
        setPlaybackSpeed(activeOpt ? parseFloat(activeOpt.dataset.speed) : 1);
      }
    });

    speedTrack.addEventListener('pointercancel', (e) => {
      if (!dragState || e.pointerId !== dragState.pointerId) return;
      dragState = null;
      speedIndicator.style.transition = '';
      positionIndicator(true);
      speedOptions.forEach(opt => opt.classList.toggle('active', parseFloat(opt.dataset.speed) === currentSpeed));
    });
  }

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

  // Edit mode toggle
  const editStationsBtn = document.getElementById('edit-stations-btn');
  if (editStationsBtn) {
    editStationsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isEditMode = !isEditMode;
      editStationsBtn.classList.toggle('active', isEditMode);
      if (stationsList) {
        stationsList.classList.toggle('editing', isEditMode);
      }
      if (!isEditMode) {
        saveStationOrder(stationsList);
      }
    });
  }

  // Station selection
  stationButtons.forEach(button => {
    button.addEventListener('click', () => {
      if (isEditMode) return;
      cancelBulletinProbe();
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

    if (audio.paused) {
      playCurrentAudio(true);
    } else {
      audio.pause();
      updatePlaybackUI(false);
      updateMediaSessionState();
    }
  });

  // Volume control with validation
  function handleVolumeChange(e) {
    if (audio) {
      const value = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
      audio.volume = value / 100;
      // Update slider to validated value
      e.target.value = value;
    }
    updateVolumeSliderFill();
  }
  volumeSlider.addEventListener('input', handleVolumeChange);
  // 'change' fires on some mobile browsers that don't fire 'input' during drag
  volumeSlider.addEventListener('change', handleVolumeChange);

  // Prevent page scroll while dragging volume slider on mobile
  volumeSlider.addEventListener('touchstart', (e) => {
    e.stopPropagation();
  }, { passive: true });
  volumeSlider.addEventListener('touchmove', (e) => {
    e.stopPropagation();
  }, { passive: true });

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

  function resetPlaybackSpeed() {
    setPlaybackSpeed(1);
  }

  function updateBulletinControlsStateInternal() {
    const shouldShow = currentStation && currentStation.isBulletin && isSeekableAudio();
    setBulletinControlsVisible(shouldShow);
    if (speedStrip) speedStrip.classList.toggle('visible', shouldShow);
    if (shouldShow) {
      // Double rAF: ensure display:block has been laid out before measuring
      requestAnimationFrame(() => requestAnimationFrame(() => positionIndicator(false)));
    }
    if (!shouldShow) {
      resetPlaybackSpeed();
    }
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
  let isDragging = false;
  let dragStartY = 0;
  let ghostOffsetY = 0;
  let latestClientY = 0;
  let rafPending = false;
  const moveThreshold = 6;
  let dragStarted = false;
  let onWindowMove = null;
  let onWindowUp = null;

  stationsList.querySelectorAll('.station-btn').forEach((btn) => {
    btn.setAttribute('draggable', 'false');

    // Prevent iOS text selection/callout on long-press
    btn.addEventListener('touchstart', (e) => {
      if (!isEditMode) return;
      e.preventDefault();
    }, { passive: false });

    btn.addEventListener('pointerdown', (e) => {
      if (!isEditMode) return;
      e.preventDefault();
      e.stopPropagation();
      dragStartY = e.clientY;
      dragStarted = false;
      draggedButton = btn;
      latestClientY = e.clientY;

      const rect = btn.getBoundingClientRect();
      ghostOffsetY = e.clientY - rect.top;

      onWindowMove = (evt) => {
        if (!draggedButton) return;
        evt.preventDefault();
        latestClientY = evt.clientY;

        if (!dragStarted && Math.abs(evt.clientY - dragStartY) > moveThreshold) {
          dragStarted = true;
          beginDrag(btn);
        }

        if (isDragging && !rafPending) {
          rafPending = true;
          requestAnimationFrame(updateDrag);
        }
      };
      onWindowUp = () => {
        if (isDragging) {
          finishDrag();
        } else {
          cleanupPendingDrag();
        }
      };
      window.addEventListener('pointermove', onWindowMove, { passive: false });
      window.addEventListener('pointerup', onWindowUp);
      window.addEventListener('pointercancel', onWindowUp);
    });
  });

  function cleanupPendingDrag() {
    draggedButton = null;
    dragStarted = false;
    if (onWindowMove) {
      window.removeEventListener('pointermove', onWindowMove);
      onWindowMove = null;
    }
    if (onWindowUp) {
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowUp);
      onWindowUp = null;
    }
  }

  function beginDrag(btn) {
    if (isDragging) return;
    isDragging = true;
    document.body.classList.add('reordering');

    const rect = btn.getBoundingClientRect();

    placeholder = document.createElement('div');
    placeholder.className = 'station-btn reorder-placeholder';
    placeholder.style.height = `${rect.height}px`;

    ghost = btn.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.width = `${rect.width}px`;
    ghost.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;

    btn.parentNode.insertBefore(placeholder, btn);
    btn.style.display = 'none';
    document.body.appendChild(ghost);

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
    dragStarted = false;
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
    if (audio._hlsInstance) {
      audio._hlsInstance.destroy();
      audio._hlsInstance = null;
    }
    // Remove all stored event listeners to prevent memory leaks
    currentAudioListeners.forEach(({ event, handler }) => {
      audio.removeEventListener(event, handler);
    });
    currentAudioListeners = [];
    audio.src = '';
    audio = null;
  }

  // Always use an Audio element; HLS.js provides HLS playback in browsers
  // without native support while preserving background audio behavior.
  audio = new Audio();
  const stationAudio = audio;
  if (url.includes('.m3u8') && typeof Hls !== 'undefined' && Hls.isSupported()) {
    // Chrome, Firefox, Edge — use HLS.js with lowest quality
    const hls = new Hls({ startLevel: 0 });
    hls.loadSource(url);
    hls.attachMedia(audio);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      hls.currentLevel = 0;
    });
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal && stationAudio === audio) {
        stationAudio.dispatchEvent(new Event('error'));
      }
    });
    stationAudio._hlsInstance = hls;
  } else {
    // Safari/iOS native HLS, or regular stream URLs
    stationAudio.src = url;
  }
  stationAudio.volume = document.getElementById('volume-slider').value / 100;
  // Apply current playback speed to new audio
  stationAudio.playbackRate = currentSpeed || 1;

  // Auto-play when loaded
  let shouldAutoPlay = true;
  const canplayHandler = () => {
    if (stationAudio !== audio || !shouldAutoPlay) return;
    shouldAutoPlay = false;
    hideLoading();
    playCurrentAudio(true);
  };
  stationAudio.addEventListener('canplay', canplayHandler);
  currentAudioListeners.push({ event: 'canplay', handler: canplayHandler });

  // Handle errors
  let hasShownStreamError = false;
  const errorHandler = (e) => {
    if (stationAudio !== audio || hasShownStreamError) return;
    hasShownStreamError = true;
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

    updatePlaybackUI(false);
    updateMediaSessionState();
  };
  stationAudio.addEventListener('error', errorHandler);
  currentAudioListeners.push({ event: 'error', handler: errorHandler });

  // Show loading state while waiting
  const waitingHandler = () => {
    if (stationAudio !== audio) return;
    showLoading();
  };
  stationAudio.addEventListener('waiting', waitingHandler);
  currentAudioListeners.push({ event: 'waiting', handler: waitingHandler });

  // Hide loading when playing
  const playingHandler = () => {
    if (stationAudio !== audio) return;
    hasShownStreamError = false;
    hideLoading();
    updatePlaybackUI(true);
    updateMediaSessionState();
  };
  stationAudio.addEventListener('playing', playingHandler);
  currentAudioListeners.push({ event: 'playing', handler: playingHandler });

  const pauseHandler = () => {
    if (stationAudio !== audio) return;
    updatePlaybackUI(false);
    updateMediaSessionState();
  };
  stationAudio.addEventListener('pause', pauseHandler);
  currentAudioListeners.push({ event: 'pause', handler: pauseHandler });

  // Handle audio end (for bulletins)
  const endedHandler = () => {
    if (stationAudio !== audio) return;
    updatePlaybackUI(false);
    updateMediaSessionState();
  };
  stationAudio.addEventListener('ended', endedHandler);
  currentAudioListeners.push({ event: 'ended', handler: endedHandler });

  currentStation = { url, name, isBulletin: isBulletinUrl(url) || name.includes('News') };
  setMediaSessionMetadata(name, currentStation.isBulletin ? 'News Bulletin' : 'Live Radio');
  if (updateBulletinControlsState) {
    updateBulletinControlsState();
  }

  // Update bulletin controls visibility on metadata/time changes
  const metadataHandler = () => {
    if (stationAudio !== audio) return;
    if (updateBulletinControlsState) {
      updateBulletinControlsState();
    }
  };
  stationAudio.addEventListener('loadedmetadata', metadataHandler);
  currentAudioListeners.push({ event: 'loadedmetadata', handler: metadataHandler });

  const durationHandler = () => {
    if (stationAudio !== audio) return;
    if (updateBulletinControlsState) {
      updateBulletinControlsState();
    }
  };
  stationAudio.addEventListener('durationchange', durationHandler);
  currentAudioListeners.push({ event: 'durationchange', handler: durationHandler });

  const timeUpdateHandler = () => {
    if (stationAudio !== audio) return;
    if (syncScrubUI) {
      syncScrubUI();
    }
  };
  stationAudio.addEventListener('timeupdate', timeUpdateHandler);
  currentAudioListeners.push({ event: 'timeupdate', handler: timeUpdateHandler });

  // Clear old 95bFM interval if it exists (prevent race condition)
  if (bfmNowPlayingInterval) {
    clearInterval(bfmNowPlayingInterval);
    bfmNowPlayingInterval = null;
  }
  if (bfmMetadataController) {
    bfmMetadataController.abort();
    bfmMetadataController = null;
  }

  // Start fetching 95bFM now playing if it's 95bFM
  const refreshBtn = document.getElementById('refresh-bfm-btn');
  if (name === '95bFM') {
    lastBfmTrackInfo = null; // Reset track info when starting 95bFM
    bfmMetadataFailures = 0;
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

  let requestController = null;
  try {
    debug('Fetching 95bFM now playing...');
    // Use CORS proxy to fetch the page with longer timeout
    const proxyUrl = 'https://api.allorigins.win/raw?url=';
    const targetUrl = encodeURIComponent('https://95bfm.com/');

    // Create abort controller with 20 second timeout for slow proxy
    if (bfmMetadataController) bfmMetadataController.abort();
    const controller = new AbortController();
    requestController = controller;
    bfmMetadataController = controller;
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
      if (controller !== bfmMetadataController) return;

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
    if (requestController !== bfmMetadataController) return;
    if (!currentStation || currentStation.name !== '95bFM') return;
    bfmMetadataFailures++;
    debug('95bFM metadata request failed:', error);

    // Show toast after 3 consecutive failures
    if (bfmMetadataFailures === 3) {
      console.warn('95bFM metadata is temporarily unavailable.');
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
  } finally {
    if (requestController === bfmMetadataController) {
      bfmMetadataController = null;
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

    if (offlineToast) {
      removeToast(offlineToast);
      offlineToast = null;
    }

    if (wasOffline) {
      showToast({
        title: 'Back Online',
        message: 'Internet connection restored.',
        type: 'success',
        duration: 4000,
        icon: '✅'
      });
    }
    wasOffline = false;
  } else {
    statusElement.textContent = 'Offline - Streaming unavailable';
    statusElement.classList.add('offline');
    statusIndicator.style.backgroundColor = '#ffebee';

    wasOffline = true;
    if (!offlineToast) {
      offlineToast = showToast({
        title: 'No Internet Connection',
        message: 'Streaming is unavailable while offline.',
        type: 'error',
        duration: 0, // Keep until dismissed or back online
        icon: '📡'
      });
    }

    // Pause audio when offline
    if (audio && !audio.paused) {
      audio.pause();
      updatePlaybackUI(false);
      updateMediaSessionState();
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
  if (bfmMetadataController) {
    bfmMetadataController.abort();
    bfmMetadataController = null;
  }

  // Clean up audio and its listeners
  if (audio) {
    audio.pause();
    if (audio._hlsInstance) {
      audio._hlsInstance.destroy();
      audio._hlsInstance = null;
    }
    currentAudioListeners.forEach(({ event, handler }) => {
      audio.removeEventListener(event, handler);
    });
    currentAudioListeners = [];
    audio.src = '';
    audio = null;
  }

  // Clean up test audio
  if (currentTestAudio) {
    cancelBulletinProbe();
  }
});

// Initialize on load
window.addEventListener('load', () => {
  initializePlayer();
  updateOnlineStatus();
});
