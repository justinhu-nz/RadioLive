// Radio Player App
let audio = null;
let currentStation = null;
let loadedBulletinTimes = {
  rnz: null,
  newstalkzb: null
};
let bfmNowPlayingInterval = null;
let lastBfmTrackInfo = null;

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered successfully:', registration.scope);
      })
      .catch((error) => {
        console.log('Service Worker registration failed:', error);
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

  console.log(`updateNewsButtonTimes called. Current hour: ${timeStr}`);
  console.log(`Loaded bulletin times:`, loadedBulletinTimes);

  // Only update if no bulletin is currently loaded for that station
  if (loadedBulletinTimes.rnz === null) {
    console.log(`Updating RNZ time to ${timeStr}`);
    document.getElementById('rnz-news-time').textContent = `${timeStr} bulletin`;
  } else {
    console.log(`Not updating RNZ time, bulletin loaded for ${loadedBulletinTimes.rnz}:00`);
  }
  if (loadedBulletinTimes.newstalkzb === null) {
    console.log(`Updating ZB time to ${timeStr}`);
    document.getElementById('ztb-news-time').textContent = `${timeStr} bulletin`;
  } else {
    console.log(`Not updating ZB time, bulletin loaded for ${loadedBulletinTimes.newstalkzb}:00`);
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

    console.log(`Trying to load ${name} bulletin for ${hour}:00 from ${url}`);

    // Create temporary audio to test
    const testAudio = new Audio(url);

    testAudio.addEventListener('canplay', () => {
      console.log(`Successfully loaded ${name} ${hour}:00 bulletin`);

      // Update the button label to match the actual bulletin hour
      const buttonId = type === 'rnz' ? 'rnz-news-time' : 'ztb-news-time';
      document.getElementById(buttonId).textContent = `${hour}:00 bulletin`;

      // Store the loaded bulletin time to prevent auto-update from overwriting it
      loadedBulletinTimes[type] = hour;
      console.log(`Stored bulletin time for ${type}: ${hour}`);

      loadStation(url, `${name} ${hour}:00 News`);
      const nowPlayingElem = document.getElementById('now-playing');
      nowPlayingElem.childNodes[0].textContent = `Playing: ${name} ${hour}:00 News`;
      document.getElementById('play-pause-btn').disabled = false;
    });

    testAudio.addEventListener('error', (e) => {
      console.log(`Failed to load ${name} ${hour}:00 bulletin, error:`, e);

      // Try previous hour if this is first attempt
      if (attemptHoursBack === 0) {
        console.log(`Falling back to previous hour`);
        testAudio.remove();
        tryLoadBulletin(1);
      } else {
        // Both failed, just try to load anyway
        console.log(`Both attempts failed, loading anyway`);
        loadStation(url, `${name} News`);
        const nowPlayingElem = document.getElementById('now-playing');
        nowPlayingElem.childNodes[0].textContent = `Trying to load ${name} News...`;
        document.getElementById('play-pause-btn').disabled = false;
      }
    });
  }

  tryLoadBulletin(hoursBack);
}

// Initialize audio player
function initializePlayer() {
  const stationButtons = document.querySelectorAll('.station-btn');
  const newsButtons = document.querySelectorAll('.news-btn');
  const playPauseBtn = document.getElementById('play-pause-btn');
  const volumeSlider = document.getElementById('volume-slider');
  const nowPlaying = document.getElementById('now-playing');
  const playIcon = document.querySelector('.play-icon');
  const pauseIcon = document.querySelector('.pause-icon');
  const refreshBfmBtn = document.getElementById('refresh-bfm-btn');

  // Update news button times
  updateNewsButtonTimes();
  // Refresh times every minute
  setInterval(updateNewsButtonTimes, 60000);

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
    } else {
      audio.pause();
      playIcon.style.display = 'inline';
      pauseIcon.style.display = 'none';
      playPauseBtn.classList.remove('playing');
      onAirIndicator.classList.remove('live');
      onAirText.textContent = 'OFF AIR';
    }
  });

  // Volume control
  volumeSlider.addEventListener('input', (e) => {
    if (audio) {
      audio.volume = e.target.value / 100;
    }
  });
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

  // Stop current audio if playing
  if (audio) {
    audio.pause();
    audio = null;
  }

  // Create new audio element
  audio = new Audio(url);
  audio.volume = document.getElementById('volume-slider').value / 100;

  // Auto-play when loaded
  audio.addEventListener('canplay', () => {
    hideLoading();
    audio.play();
    document.querySelector('.play-icon').style.display = 'none';
    document.querySelector('.pause-icon').style.display = 'inline';
    document.getElementById('play-pause-btn').classList.add('playing');
  });

  // Handle errors
  audio.addEventListener('error', (e) => {
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
    const onAirIndicator = document.getElementById('on-air-indicator');
    const onAirText = document.querySelector('.on-air-text');
    onAirIndicator.classList.remove('live');
    onAirText.textContent = 'OFF AIR';
  });

  // Show loading state while waiting
  audio.addEventListener('waiting', () => {
    showLoading();
  });

  // Hide loading when playing
  audio.addEventListener('playing', () => {
    hideLoading();
    const onAirIndicator = document.getElementById('on-air-indicator');
    const onAirText = document.querySelector('.on-air-text');
    onAirIndicator.classList.add('live');
    onAirText.textContent = 'ON AIR';
  });

  // Handle audio end (for bulletins)
  audio.addEventListener('ended', () => {
    const onAirIndicator = document.getElementById('on-air-indicator');
    const onAirText = document.querySelector('.on-air-text');
    onAirIndicator.classList.remove('live');
    onAirText.textContent = 'OFF AIR';
    document.querySelector('.play-icon').style.display = 'inline';
    document.querySelector('.pause-icon').style.display = 'none';
    document.getElementById('play-pause-btn').classList.remove('playing');
  });

  currentStation = { url, name };

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
    // Clear interval if switching away from 95bFM
    if (bfmNowPlayingInterval) {
      clearInterval(bfmNowPlayingInterval);
      bfmNowPlayingInterval = null;
    }
    lastBfmTrackInfo = null; // Reset track info when leaving 95bFM
    // Hide refresh button
    refreshBtn.style.display = 'none';
  }
}

// Fetch 95bFM now playing information
async function fetch95bFMNowPlaying() {
  // Only fetch if we're currently on 95bFM
  if (!currentStation || currentStation.name !== '95bFM') {
    console.log('Not fetching 95bFM data - not currently playing 95bFM');
    return;
  }

  try {
    console.log('Fetching 95bFM now playing...');
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
        }
      } else if (!trackInfo) {
        console.log('No track info found in HTML');
      } else {
        console.log('Track info unchanged:', trackInfo);
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError; // Re-throw to outer catch
    }
  } catch (error) {
    // Less verbose error logging - timeouts are common with CORS proxies
    if (error.name === 'AbortError') {
      console.warn('95bFM fetch timed out (proxy may be slow)');
    } else {
      console.error('Error fetching 95bFM now playing:', error);
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
  } else {
    statusElement.textContent = 'Offline - Streaming unavailable';
    statusElement.classList.add('offline');
    statusIndicator.style.backgroundColor = '#ffebee';

    // Pause audio when offline
    if (audio && !audio.paused) {
      audio.pause();
    }
  }
}

// Listen for online/offline events
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// Initialize on load
window.addEventListener('load', () => {
  initializePlayer();
  updateOnlineStatus();
});
