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
let mode = 'create';
let playlists = [];
let songSearchResults = [];
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
  document.getElementById('trackListLabel').textContent = tracks.length ? 'Songs ready to add' : 'Queue is empty';
  updateActionState();
  resetStatuses(false);
}

function selectedPlaylistId() {
  return document.getElementById('existingPlaylist')?.value || '';
}

function updateActionState() {
  const button = document.getElementById('createBtn');
  const hasTracks = tracks.length > 0;
  const canCreate = mode === 'create' && accessToken && hasTracks;
  const canUpdate = mode === 'update' && accessToken && hasTracks && selectedPlaylistId();

  button.disabled = !(canCreate || canUpdate);
  button.textContent = mode === 'create' ? 'Create Playlist →' : 'Add to Playlist →';
}

function setMode(nextMode) {
  mode = nextMode;
  const isCreate = mode === 'create';

  document.getElementById('createPanel').classList.toggle('hidden', !isCreate);
  document.getElementById('updatePanel').classList.toggle('hidden', isCreate);
  document.getElementById('createTab').classList.toggle('active', isCreate);
  document.getElementById('updateTab').classList.toggle('active', !isCreate);
  document.getElementById('createTab').setAttribute('aria-selected', String(isCreate));
  document.getElementById('updateTab').setAttribute('aria-selected', String(!isCreate));

  if (!isCreate && accessToken && playlists.length === 0) {
    loadPlaylists();
  }

  updateActionState();
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

function appendTrackLine(line) {
  const input = document.getElementById('trackInput');
  const current = input.value.trim();
  input.value = current ? `${current}\n${line}` : line;
  applyTrackInput();
}

function syncTrackInputFromQueue() {
  document.getElementById('trackInput').value = tracks.map((track) => track.display).join('\n');
}

function removeTrack(index) {
  tracks.splice(index, 1);
  setTracks([...tracks]);
  syncTrackInputFromQueue();
}

function clearTrackQueue() {
  tracks = [];
  syncTrackInputFromQueue();
  setTracks([]);
}

function renderSongSearchResults(items, statusText = '') {
  const box = document.getElementById('songSearchResults');
  songSearchResults = items;
  box.innerHTML = '';
  box.classList.toggle('visible', Boolean(items.length || statusText));

  if (statusText) {
    const status = document.createElement('div');
    status.className = 'finder-empty';
    status.textContent = statusText;
    box.appendChild(status);
    return;
  }

  items.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'finder-item';

    const artwork = document.createElement('div');
    artwork.className = 'finder-artwork';
    if (item.artworkUrl) {
      const image = document.createElement('img');
      image.src = item.artworkUrl;
      image.alt = '';
      image.loading = 'lazy';
      artwork.appendChild(image);
    } else {
      artwork.textContent = '♪';
    }

    const copy = document.createElement('div');
    copy.className = 'finder-copy';

    const title = document.createElement('div');
    title.className = 'finder-title';
    title.textContent = `${item.artistName} - ${item.trackName}`;

    const meta = document.createElement('div');
    meta.className = 'finder-meta';
    meta.textContent = item.collectionName || 'Single';

    const button = document.createElement('button');
    button.className = 'btn btn-outline btn-compact';
    button.type = 'button';
    button.textContent = 'Add';
    button.addEventListener('click', () => {
      appendTrackLine(`${songSearchResults[index].artistName} - ${songSearchResults[index].trackName}`);
      log(`Added suggestion: ${songSearchResults[index].artistName} - ${songSearchResults[index].trackName}`, 'ok');
    });

    copy.append(title, meta);
    row.append(artwork, copy, button);
    box.appendChild(row);
  });
}

async function searchSongCatalog() {
  const input = document.getElementById('songSearchInput');
  const button = document.getElementById('songSearchBtn');
  const query = input.value.trim();

  if (!query) {
    renderSongSearchResults([], 'Enter a song, artist, or both.');
    return;
  }

  button.disabled = true;
  renderSongSearchResults([], 'Searching music catalog…');

  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=8`);
    if (!res.ok) {
      throw new Error(`Catalog search failed (${res.status})`);
    }

    const data = await res.json();
    const results = (data.results || [])
      .filter((item) => item.artistName && item.trackName)
      .map((item) => ({
        artistName: item.artistName,
        trackName: item.trackName,
        collectionName: item.collectionName || '',
        artworkUrl: item.artworkUrl100 || item.artworkUrl60 || ''
      }));

    renderSongSearchResults(results, results.length ? '' : 'No song suggestions found.');
  } catch (e) {
    renderSongSearchResults([], e.message);
  } finally {
    button.disabled = false;
  }
}

function renderSongs() {
  const list = document.getElementById('songList');
  if (!tracks.length) {
    list.innerHTML = '<div class="queue-empty">Search a song, paste source text, or upload a file to build the queue.</div>';
    return;
  }

  list.innerHTML = tracks.map((track, i) => {
    const st = songStatuses[i];
    let cls = '', label = '';
    if (st === 'ok') { cls = 'matched'; label = `<span class="song-status status-ok">added</span>`; }
    else if (st === 'err') { cls = 'failed'; label = `<span class="song-status status-err">not found</span>`; }
    else if (st === 'loading') { label = `<span class="song-status status-loading">${track.videoId ? 'adding…' : 'searching…'}</span>`; }
    else { label = `<span class="song-status status-pending">${track.videoId ? 'direct url' : 'needs match'}</span>`; }
    const source = track.videoId ? 'YouTube URL/video ID supplied' : 'Will resolve from artist/title';
    const searchQuery = encodeURIComponent(track.artist ? `${track.artist} ${track.title}` : track.title);
    const manualSearch = track.videoId
      ? ''
      : `<a class="song-search-link" href="https://www.youtube.com/results?search_query=${searchQuery}" target="_blank" rel="noopener noreferrer">Search YouTube</a>`;
    return `<div class="song-item ${cls}">
      <span class="song-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="song-copy">
        <span class="song-name">${escapeHtml(track.display)}</span>
        <span class="song-source">${escapeHtml(source)}</span>
      </span>
      <span class="song-actions">
        ${manualSearch}
        ${label}
        <button class="song-remove" type="button" onclick="removeTrack(${i})" aria-label="Remove track ${i + 1}">×</button>
      </span>
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
      updateActionState();
      log('✓ Authenticated successfully', 'ok');
      loadPlaylists();
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

async function loadPlaylists() {
  if (!accessToken) {
    alert('Please connect your Google account first.');
    return;
  }

  const select = document.getElementById('existingPlaylist');
  const status = document.getElementById('playlistLoadStatus');
  status.textContent = 'loading…';
  select.disabled = true;

  try {
    const loaded = [];
    let pageToken = '';

    do {
      const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
      const data = await ytFetch(
        `https://www.googleapis.com/youtube/v3/playlists?part=snippet,status&mine=true&maxResults=50${pageParam}`
      );
      loaded.push(...(data.items || []));
      pageToken = data.nextPageToken || '';
    } while (pageToken);

    playlists = loaded;
    select.innerHTML = '';

    if (!playlists.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No playlists found';
      select.appendChild(option);
      status.textContent = '0 playlists';
    } else {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Select a playlist';
      select.appendChild(placeholder);

      playlists.forEach((playlist) => {
        const option = document.createElement('option');
        option.value = playlist.id;
        option.textContent = playlist.snippet?.title || playlist.id;
        select.appendChild(option);
      });

      status.textContent = `${playlists.length} loaded`;
    }
  } catch (e) {
    select.innerHTML = '<option value="">Could not load playlists</option>';
    status.textContent = 'failed';
    log('Failed to load playlists: ' + e.message, 'err');
  } finally {
    select.disabled = false;
    updateActionState();
  }
}

async function submitPlaylist() {
  if (mode === 'update') {
    await updatePlaylist();
  } else {
    await createPlaylist();
  }
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

    await addTracksToPlaylist(playlistId, {
      doneMessagePrivacy: privacy,
      resultTitle: '🎉 Playlist created!'
    });
  } catch (e) {
    log('Failed to create playlist: ' + e.message, 'err');
  } finally {
    updateActionState();
  }
}

async function updatePlaylist() {
  if (!accessToken) { alert('Please connect your Google account first.'); return; }
  if (!tracks.length) { alert('Please load at least one track first.'); return; }

  const playlistId = selectedPlaylistId();
  if (!playlistId) { alert('Please select a playlist to update.'); return; }

  document.getElementById('createBtn').disabled = true;
  document.getElementById('progressBar').classList.add('visible');
  document.getElementById('resultCard').classList.remove('visible');
  document.getElementById('logBox').innerHTML = '';
  document.getElementById('logBox').classList.add('visible');

  const playlistTitle = document.getElementById('existingPlaylist').selectedOptions[0]?.textContent || playlistId;

  try {
    log('Updating playlist "' + playlistTitle + '"…', 'info');
    await addTracksToPlaylist(playlistId, {
      doneMessagePrivacy: 'existing playlist',
      resultTitle: '🎉 Playlist updated!'
    });
  } catch (e) {
    log('Failed to update playlist: ' + e.message, 'err');
  } finally {
    updateActionState();
  }
}

async function addTracksToPlaylist(playlistId, resultOptions) {
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
  document.querySelector('.result-title').textContent = resultOptions.resultTitle;
  document.getElementById('resultMeta').textContent = `${added} of ${tracks.length} tracks added · ${resultOptions.doneMessagePrivacy}`;
  document.getElementById('resultLink').href = `https://music.youtube.com/playlist?list=${playlistId}`;
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

document.getElementById('songSearchInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    searchSongCatalog();
  }
});

loadSampleTracks(false);
