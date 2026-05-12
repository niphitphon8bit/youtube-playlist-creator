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
let tracks = [];
let songStatuses = [];
let videoIds = [];
let mode = 'create';
let playlists = [];
let songSearchResults = [];
let existingPlaylistItems = [];
let currentProfile = null;
let currentStep = 1;
let addMethod = 'search';
let reviewPage = 1;
let reviewPageSize = 5;
let searchPage = 1;
const searchPageSize = 5;
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
  reviewPage = 1;
  updateActionState();
  resetStatuses(false);
}

function selectedPlaylistId() {
  return document.getElementById('existingPlaylist')?.value || '';
}

function resetExistingPlaylistPreview(message = 'Select a playlist to inspect its current songs.') {
  existingPlaylistItems = [];
  document.getElementById('existingTrackLabel').textContent = 'Current playlist songs';
  document.getElementById('existingTrackStatus').textContent = '';
  document.getElementById('existingTrackList').innerHTML = `<div class="queue-empty">${escapeHtml(message)}</div>`;
}

function stepTwoReady() {
  if (mode === 'create') {
    return Boolean(document.getElementById('playlistName').value.trim());
  }
  return Boolean(selectedPlaylistId());
}

function updateWizardState() {
  [1, 2, 3].forEach((step) => {
    document.getElementById(`wizardStep${step}`).classList.toggle('hidden', step !== currentStep);
    const pill = document.getElementById(`stepPill${step}`);
    pill.classList.toggle('active', step === currentStep);
    pill.classList.toggle('complete', step < currentStep);
  });

  const stepOneReady = Boolean(accessToken);
  const playlistReady = stepTwoReady();
  const stepOneStatus = document.getElementById('stepOneStatus');
  const stepTwoStatus = document.getElementById('stepTwoStatus');
  const stepOneNext = document.getElementById('stepOneNext');
  const stepTwoNext = document.getElementById('stepTwoNext');

  stepOneNext.disabled = !stepOneReady;
  stepTwoNext.disabled = !playlistReady;
  stepOneStatus.textContent = stepOneReady
    ? 'Google account connected.'
    : 'Connect your account to continue.';
  stepTwoStatus.textContent = mode === 'create'
    ? (playlistReady ? 'Playlist details ready.' : 'Enter a playlist name to continue.')
    : (playlistReady ? 'Playlist selected.' : 'Select an existing playlist to continue.');
}

function goToStep(step) {
  if (step === 1) {
    currentStep = 1;
  } else if (step === 2) {
    if (!accessToken) return;
    currentStep = 2;
  } else if (step === 3) {
    if (!accessToken || !stepTwoReady()) return;
    currentStep = 3;
  }
  updateWizardState();
}

function nextStep() {
  goToStep(Math.min(currentStep + 1, 3));
}

function previousStep() {
  goToStep(Math.max(currentStep - 1, 1));
}

function updateActionState() {
  const button = document.getElementById('createBtn');
  const hasTracks = tracks.length > 0;
  const canCreate = mode === 'create' && accessToken && hasTracks;
  const canUpdate = mode === 'update' && accessToken && hasTracks && selectedPlaylistId();

  button.disabled = !(canCreate || canUpdate);
  button.textContent = mode === 'create' ? 'Create Playlist →' : 'Add to Playlist →';
  updateWizardState();
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
  appendTracks(parsed);
  document.getElementById('trackInput').value = '';
  log(`Added ${parsed.length} ${parsed.length === 1 ? 'track' : 'tracks'} from text`, parsed.length ? 'ok' : 'err');
}

function loadSampleTracks(showLog = true) {
  const sampleTracks = parseTracks(SAMPLE_TRACKS.map((song) => `The Weeknd - ${song}`).join('\n'));
  appendTracks(sampleTracks);
  if (showLog) {
    log(`Added ${sampleTracks.length} sample tracks`, 'ok');
  }
}

function appendTracks(nextTracks) {
  if (!nextTracks.length) return;
  setTracks([...tracks, ...nextTracks]);
}

function appendTrackLine(line) {
  appendTracks(parseTracks(line));
}

function removeTrack(index) {
  tracks.splice(index, 1);
  setTracks([...tracks]);
}

function clearTrackQueue() {
  tracks = [];
  setTracks([]);
}

function setAddMethod(nextMethod) {
  addMethod = nextMethod;
  ['search', 'text', 'url', 'upload'].forEach((method) => {
    const active = method === addMethod;
    document.getElementById(`${method}MethodTab`).classList.toggle('active', active);
    document.getElementById(`${method}MethodTab`).setAttribute('aria-selected', String(active));
    document.getElementById(`${method}MethodPanel`).classList.toggle('hidden', !active);
  });
}

function renderSongSearchResults(items, statusText = '') {
  const box = document.getElementById('songSearchResults');
  songSearchResults = items;
  searchPage = 1;
  box.innerHTML = '';
  box.classList.toggle('visible', Boolean(items.length || statusText));

  if (statusText) {
    box.innerHTML = `<div class="finder-empty">${escapeHtml(statusText)}</div>`;
    updateSearchPagination(0);
    return;
  }

  if (!items.length) {
    updateSearchPagination(0);
    return;
  }

  renderSearchResultPage();
}

function changeSearchPage(delta) {
  searchPage += delta;
  renderSearchResultPage();
}

function updateSearchPagination(totalItems) {
  const totalPages = Math.max(1, Math.ceil(totalItems / searchPageSize));
  searchPage = Math.min(Math.max(1, searchPage), totalPages);
  document.getElementById('searchPageLabel').textContent = `Page ${searchPage} of ${totalPages}`;
  document.getElementById('searchPrevBtn').disabled = searchPage <= 1;
  document.getElementById('searchNextBtn').disabled = searchPage >= totalPages;
}

function renderSearchResultPage() {
  const box = document.getElementById('songSearchResults');
  const totalPages = Math.max(1, Math.ceil(songSearchResults.length / searchPageSize));
  searchPage = Math.min(Math.max(1, searchPage), totalPages);
  const start = (searchPage - 1) * searchPageSize;
  const pageItems = songSearchResults.slice(start, start + searchPageSize);

  box.innerHTML = '';
  pageItems.forEach((item, offset) => {
    box.appendChild(renderSearchResultRow(item, start + offset));
  });
  updateSearchPagination(songSearchResults.length);
}

function setReviewPageSize(value) {
  reviewPageSize = Number(value) || 5;
  reviewPage = 1;
  renderReviewPane();
}

function changeReviewPage(delta) {
  reviewPage += delta;
  renderReviewPane();
}

function renderSearchResultRow(item, index) {
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
      renderReviewPane();
      log(`Added suggestion: ${songSearchResults[index].artistName} - ${songSearchResults[index].trackName}`, 'ok');
    });

    copy.append(title, meta);
    row.append(artwork, copy, button);
    return row;
}

function renderQueueRow(track, i) {
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
}

function renderReviewPane() {
  const list = document.getElementById('reviewList');
  const label = document.getElementById('trackListLabel');
  const count = document.getElementById('reviewCountLabel');
  const pageLabel = document.getElementById('reviewPageLabel');
  const prev = document.getElementById('reviewPrevBtn');
  const next = document.getElementById('reviewNextBtn');
  const items = tracks;
  const totalPages = Math.max(1, Math.ceil(items.length / reviewPageSize));
  reviewPage = Math.min(Math.max(1, reviewPage), totalPages);
  const start = (reviewPage - 1) * reviewPageSize;
  const pageItems = items.slice(start, start + reviewPageSize);

  label.textContent = tracks.length ? 'Songs ready to add' : 'Queue is empty';
  count.textContent = `${items.length} total`;
  pageLabel.textContent = `Page ${reviewPage} of ${totalPages}`;
  prev.disabled = reviewPage <= 1;
  next.disabled = reviewPage >= totalPages;

  if (!pageItems.length) {
    list.innerHTML = '<div class="queue-empty">Search a song, paste source text, or upload a file to build the queue.</div>';
    return;
  }
  list.innerHTML = pageItems.map((track, offset) => renderQueueRow(track, start + offset)).join('');
}

function addDirectVideoInput() {
  const input = document.getElementById('directUrlInput');
  const parsed = parseTracks(input.value);
  const validDirectTracks = parsed.filter((track) => track.videoId);
  if (!validDirectTracks.length) {
    log('Enter a valid YouTube URL or 11-character video ID.', 'err');
    return;
  }
  appendTracks(validDirectTracks);
  input.value = '';
  log(`Added ${validDirectTracks.length} direct YouTube ${validDirectTracks.length === 1 ? 'link' : 'links'}`, 'ok');
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
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=20`);
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
  renderReviewPane();
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
  window.location.href = '/auth/google';
}

async function logoutAuth() {
  await fetch('/api/auth/logout', { method: 'POST' });
  accessToken = null;
  currentProfile = null;
  playlists = [];
  document.getElementById('authBadge').className = 'auth-badge disconnected';
  document.getElementById('authLabel').textContent = 'not connected';
  renderAccountSummary(null);
  document.getElementById('existingPlaylist').innerHTML = '<option value="">Connect your account to load playlists</option>';
  document.getElementById('playlistLoadStatus').textContent = '';
  resetExistingPlaylistPreview('Connect your account to inspect playlist songs.');
  currentStep = 1;
  updateActionState();
  log('Disconnected Google session', 'info');
}

async function loadAuthStatus() {
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();
    accessToken = data.authenticated ? 'server-session' : null;
    currentProfile = data.authenticated ? data.profile : null;
    document.getElementById('authBadge').className = data.authenticated ? 'auth-badge connected' : 'auth-badge disconnected';
    document.getElementById('authLabel').textContent = data.authenticated ? 'connected' : 'not connected';
    renderAccountSummary(currentProfile);
    updateActionState();
    if (data.authenticated) {
      await loadPlaylists();
    }
    updateWizardState();
  } catch (e) {
    log('Could not check backend auth status: ' + e.message, 'err');
  }
}

function renderAccountSummary(profile) {
  const box = document.getElementById('accountSummary');
  if (!profile) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }

  const avatar = profile.picture
    ? `<img src="${escapeHtml(profile.picture)}" alt="">`
    : '<span class="account-avatar-fallback">G</span>';
  const verified = profile.emailVerified ? 'verified Google account' : 'Google account';
  box.innerHTML = `<div class="account-avatar">${avatar}</div>
    <div class="account-copy">
      <div class="account-name">${escapeHtml(profile.name || profile.email || 'Google account')}</div>
      <div class="account-email">${escapeHtml(profile.email || verified)}</div>
      <div class="account-meta">${escapeHtml(verified)}</div>
    </div>`;
  box.classList.remove('hidden');
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    const message = typeof data.error === 'string'
      ? data.error
      : data.error?.message;
    throw new Error(message || `YouTube API request failed (${res.status})`);
  }
  return data;
}

async function searchVideo(track) {
  const q = encodeURIComponent(track.artist ? `${track.artist} ${track.title}` : track.title);
  const data = await apiFetch(
    `/api/youtube/search?part=snippet&q=${q}&type=video&maxResults=1&videoCategoryId=10`
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
      const data = await apiFetch(
        `/api/youtube/playlists?part=snippet,status&mine=true&maxResults=50${pageParam}`
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
      resetExistingPlaylistPreview('No playlists available to inspect.');
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
      resetExistingPlaylistPreview();
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

function renderExistingPlaylistItems(items) {
  const list = document.getElementById('existingTrackList');
  const label = document.getElementById('existingTrackLabel');
  existingPlaylistItems = items;
  label.textContent = items.length
    ? `Current playlist songs (${items.length})`
    : 'Current playlist songs';

  if (!items.length) {
    list.innerHTML = '<div class="queue-empty">This playlist does not have any readable songs yet.</div>';
    return;
  }

  list.innerHTML = items.map((item, index) => {
    const snippet = item.snippet || {};
    const title = snippet.title || 'Untitled video';
    const channel = snippet.videoOwnerChannelTitle || snippet.channelTitle || 'YouTube';
    const videoId = snippet.resourceId?.videoId || '';
    const suffix = videoId ? ` · ${escapeHtml(videoId)}` : '';
    return `<div class="static-song-item">
      <span class="song-num">${String(index + 1).padStart(2, '0')}</span>
      <span class="song-copy">
        <span class="song-name">${escapeHtml(title)}</span>
        <span class="song-source">${escapeHtml(channel)}${suffix}</span>
      </span>
    </div>`;
  }).join('');
}

async function loadExistingPlaylistItems(playlistId) {
  const status = document.getElementById('existingTrackStatus');
  const list = document.getElementById('existingTrackList');

  if (!playlistId) {
    resetExistingPlaylistPreview();
    return;
  }

  status.textContent = 'loading…';
  list.innerHTML = '<div class="queue-empty">Loading current playlist songs…</div>';

  try {
    const loaded = [];
    let pageToken = '';

    do {
      const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
      const data = await apiFetch(
        `/api/youtube/playlist-items?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=50${pageParam}`
      );
      loaded.push(...(data.items || []));
      pageToken = data.nextPageToken || '';
    } while (pageToken);

    renderExistingPlaylistItems(loaded);
    status.textContent = `${loaded.length} loaded`;
  } catch (e) {
    existingPlaylistItems = [];
    status.textContent = 'failed';
    list.innerHTML = `<div class="queue-empty">${escapeHtml(e.message)}</div>`;
    log('Failed to load playlist songs: ' + e.message, 'err');
  }
}

async function handlePlaylistSelectionChange() {
  updateActionState();
  await loadExistingPlaylistItems(selectedPlaylistId());
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
    const plData = await apiFetch('/api/youtube/playlists', {
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

      await apiFetch('/api/youtube/playlist-items', {
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
    const parsed = parseTracks(text);
    appendTracks(parsed);
    log(`Added ${parsed.length} ${parsed.length === 1 ? 'track' : 'tracks'} from ${file.name}`, parsed.length ? 'ok' : 'err');
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

document.getElementById('playlistName').addEventListener('input', updateActionState);

loadSampleTracks(false);
loadAuthStatus();
updateWizardState();
setAddMethod('search');
