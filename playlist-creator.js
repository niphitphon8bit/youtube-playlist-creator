const SAMPLE_TRACKS = [
  "Baptized in Fear", "Open Hearts", "Wake Me Up", "After Hours", "Starboy",
  "Heartless", "Faith", "Cry for Me", "São Paulo", "Take My Breath",
  "Sacrifice", "How Do I Make You Love Me?", "Can't Feel My Face", "Lost in the Fire",
  "Timeless", "Often", "Given Up on Me", "I Was Never There", "The Hills", "Creepin'",
  "Niagara Falls", "One of the Girls", "Stargirl Interlude", "Out of Time",
  "I Feel It Coming", "Die for You", "Is There Someone Else?", "Wicked Games",
  "Call Out My Name", "The Morning", "Save Your Tears", "Less Than Zero",
  "Blinding Lights", "Without a Warning", "House of Balloons", "Moth to a Flame"
];

let accessToken = null;
let tokenClient = null;
let tracks = [];
let songStatuses = [];
let videoIds = [];
const { parseTracks } = window.TrackParser;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function setTracks(nextTracks) {
  tracks = nextTracks;
  songStatuses = tracks.map(() => 'pending');
  videoIds = tracks.map(() => null);
  document.getElementById('songCount').textContent = `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}`;
  document.getElementById('trackListLabel').textContent = tracks.length ? 'Loaded tracks' : 'No tracks loaded';
  document.getElementById('createBtn').disabled = !accessToken || tracks.length === 0;
  resetStatuses(false);
}

function applyTrackInput() {
  const parsed = parseTracks(document.getElementById('trackInput').value);
  setTracks(parsed);
  log(`Loaded ${parsed.length} ${parsed.length === 1 ? 'track' : 'tracks'}`, parsed.length ? 'ok' : 'err');
}

function loadSampleTracks(showLog = true) {
  document.getElementById('trackInput').value = SAMPLE_TRACKS.map((song) => `The Weeknd - ${song}`).join('\n');
  setTracks(parseTracks(document.getElementById('trackInput').value));
  if (showLog) {
    log(`Loaded ${tracks.length} sample tracks`, 'ok');
  }
}

function renderSongs() {
  const list = document.getElementById('songList');
  if (!tracks.length) {
    list.innerHTML = '<div class="api-key-note">Load tracks from the textarea or an uploaded file.</div>';
    return;
  }

  list.innerHTML = tracks.map((track, i) => {
    const st = songStatuses[i];
    let cls = '', label = '';
    if (st === 'ok') { cls = 'matched'; label = `<span class="song-status status-ok">added</span>`; }
    else if (st === 'err') { cls = 'failed'; label = `<span class="song-status status-err">not found</span>`; }
    else if (st === 'loading') { label = `<span class="song-status status-loading">${track.videoId ? 'adding…' : 'searching…'}</span>`; }
    else { label = `<span class="song-status status-pending">${track.videoId ? 'url' : '—'}</span>`; }
    return `<div class="song-item ${cls}">
      <span class="song-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="song-name">${escapeHtml(track.display)}</span>
      ${label}
    </div>`;
  }).join('');
}

function log(msg, type = '') {
  const box = document.getElementById('logBox');
  box.classList.add('visible');
  const cls = type === 'ok' ? 'log-ok' : type === 'err' ? 'log-err' : type === 'info' ? 'log-info' : '';
  const row = document.createElement('div');
  if (cls) row.className = cls;
  row.textContent = msg;
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
}

function updateProgress(done, total) {
  const pct = Math.round((done / total) * 100);
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressText').textContent = `${done} / ${total}`;
}

function resetStatuses(clearLog = true) {
  songStatuses = tracks.map(() => 'pending');
  videoIds = tracks.map(() => null);
  if (clearLog) {
    document.getElementById('logBox').innerHTML = '';
    document.getElementById('logBox').classList.remove('visible');
  }
  document.getElementById('progressBar').classList.remove('visible');
  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('progressText').textContent = '';
  document.getElementById('resultCard').classList.remove('visible');
  renderSongs();
}

function initAuth() {
  const clientId = document.getElementById('clientId').value.trim();
  if (!clientId) { alert('Please enter your OAuth Client ID first.'); return; }

  if (typeof google === 'undefined' || !google.accounts) {
    alert('Google Identity Services not loaded yet. Please wait a moment and try again.');
    return;
  }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/youtube',
    callback: (response) => {
      if (response.error) {
        log('Auth failed: ' + response.error, 'err');
        return;
      }
      accessToken = response.access_token;
      document.getElementById('authBadge').className = 'auth-badge connected';
      document.getElementById('authLabel').textContent = 'connected';
      document.getElementById('createBtn').disabled = !accessToken || tracks.length === 0;
      log('✓ Authenticated successfully', 'ok');
    }
  });

  tokenClient.requestAccessToken({ prompt: 'consent' });
}

async function ytFetch(url, options = {}) {
  const apiKey = document.getElementById('apiKey').value.trim();
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(url + sep + 'key=' + encodeURIComponent(apiKey), {
    ...options,
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `YouTube API request failed (${res.status})`);
  }
  return data;
}

async function searchVideo(track) {
  const q = encodeURIComponent(track.artist ? `${track.artist} ${track.title}` : track.title);
  const data = await ytFetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${q}&type=video&maxResults=1&videoCategoryId=10`
  );
  if (data.items && data.items.length > 0) {
    return data.items[0].id.videoId;
  }
  return null;
}

async function createPlaylist() {
  if (!accessToken) { alert('Please connect your Google account first.'); return; }
  if (!tracks.length) { alert('Please load at least one track first.'); return; }

  document.getElementById('createBtn').disabled = true;
  document.getElementById('progressBar').classList.add('visible');
  document.getElementById('resultCard').classList.remove('visible');
  document.getElementById('logBox').innerHTML = '';
  document.getElementById('logBox').classList.add('visible');

  const name = document.getElementById('playlistName').value.trim() || 'My Playlist';
  const desc = document.getElementById('playlistDesc').value.trim();
  const privacy = document.getElementById('privacy').value;

  try {
    log('Creating playlist "' + name + '"…', 'info');
    const plData = await ytFetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet,status', {
      method: 'POST',
      body: JSON.stringify({
        snippet: { title: name, description: desc },
        status: { privacyStatus: privacy }
      })
    });

    if (!plData.id) {
      throw new Error('YouTube did not return a playlist ID.');
    }

    const playlistId = plData.id;
    log('✓ Playlist created (ID: ' + playlistId + ')', 'ok');

    let done = 0, added = 0, failed = 0;

    for (let i = 0; i < tracks.length; i++) {
      songStatuses[i] = 'loading';
      renderSongs();

      try {
        const videoId = tracks[i].videoId || await searchVideo(tracks[i]);
        if (!videoId) throw new Error('no results');

        videoIds[i] = videoId;

        await ytFetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
          method: 'POST',
          body: JSON.stringify({
            snippet: {
              playlistId,
              resourceId: { kind: 'youtube#video', videoId }
            }
          })
        });

        songStatuses[i] = 'ok';
        added++;
        log(`✓ ${tracks[i].display}`, 'ok');
      } catch (e) {
        songStatuses[i] = 'err';
        failed++;
        log(`✗ ${tracks[i].display} — ${e.message}`, 'err');
      }

      done++;
      updateProgress(done, tracks.length);
      renderSongs();

      await new Promise(r => setTimeout(r, 300));
    }

    log(`─── Done: ${added} added, ${failed} not found ───`, 'info');

    const result = document.getElementById('resultCard');
    result.classList.add('visible');
    document.getElementById('resultMeta').textContent = `${added} of ${tracks.length} tracks added · ${privacy}`;
    const link = `https://music.youtube.com/playlist?list=${playlistId}`;
    document.getElementById('resultLink').href = link;
  } catch (e) {
    log('Failed to create playlist: ' + e.message, 'err');
  } finally {
    document.getElementById('createBtn').disabled = !accessToken || tracks.length === 0;
  }
}

document.getElementById('trackFile').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  try {
    const text = await file.text();
    document.getElementById('trackInput').value = text;
    applyTrackInput();
    log(`Imported ${file.name}`, 'ok');
  } catch (e) {
    log(`Could not read file: ${e.message}`, 'err');
  } finally {
    event.target.value = '';
  }
});

loadSampleTracks(false);
