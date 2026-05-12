# YouTube Playlist Creator

A small browser-based tool for creating a YouTube or YouTube Music playlist from a pasted track list or uploaded text file, or adding new tracks to an existing playlist.

The app uses the YouTube Data API v3 to:

- Authenticate with a Google account
- Create a playlist
- Load existing playlists for updates
- Search a music catalog for song-name suggestions
- Search YouTube for tracks that do not already include a YouTube URL or video ID
- Add the matched videos to the playlist

## Project Structure

```text
.
├── index.html                # App markup
├── styles.css                # UI styling
├── track-parser.js           # Pure track parsing utilities
├── playlist-creator.js       # Browser UI and backend API client
├── server/                   # OAuth/session backend and YouTube proxy
├── .env.example              # Backend environment template
├── tests/                    # Offline unit tests
├── package.json              # Test script
└── README.md
```

## Requirements

- A modern browser with JavaScript enabled
- Node.js 18 or newer for the backend and unit tests
- npm for running scripts
- A Google Cloud project
- YouTube Data API v3 enabled
- An OAuth 2.0 Client ID and Client Secret for a Web application

## Tech Stack

- HTML
- CSS
- JavaScript
- Node.js built-in HTTP server for the backend
- Node.js built-in test runner for offline unit tests

No frontend framework or bundler is required. The Node backend now serves the frontend, completes OAuth code exchange, persists the encrypted refresh token locally, and proxies YouTube API calls.

## Google Setup

1. Open Google Cloud Console:
   https://console.cloud.google.com/apis/credentials

2. Enable **YouTube Data API v3** for your project.

3. Create an **OAuth 2.0 Client ID**:
   - Application type: **Web application**
   - Add `http://localhost:8787/auth/google/callback` as an authorized redirect URI.

4. Copy the environment template and fill it:

```bash
cp .env.example .env
```

Set:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
SESSION_SECRET
TOKEN_ENCRYPTION_KEY
```

Generate a 32-byte base64 token encryption key with:

```bash
openssl rand -base64 32
```

5. Start the server. Local development automatically reads `.env`; hosted deployments should use the platform's environment-secret support.

## Usage

1. Run the backend:
   ```bash
   npm run dev
   ```
2. Open `http://localhost:8787/`.
3. Click **Connect Google Account**.
4. Choose **Create New** or **Update Existing**.
5. For create mode, set the playlist name, description, and visibility.
6. For update mode, select an existing playlist.
7. Optionally use **Find songs** to search catalog suggestions and append them to the queue.
8. Paste tracks into the source textarea or upload a text-like file.
9. Click **Load Tracks** to build the reviewable song queue.
10. Remove any unwanted rows from the queue if needed.
11. Click **Create Playlist** or **Add to Playlist**.

## Song Finder

The **Find songs** helper queries a music catalog and displays artist/title suggestions with available artwork thumbnails. Clicking **Add** appends the selected result to the track list as:

```text
Artist - Song
```

This improves discoverability for users who do not already have a prepared list. It does not provide YouTube video IDs by itself, so YouTube resolution still happens later unless the track line already contains a YouTube URL or video ID.

The loaded queue is the final review step before playlist creation or update. Each row shows whether it already has a direct YouTube target or still needs matching, and rows can be removed individually. Rows that still need matching also include a direct **Search YouTube** link for manual review.

## Tests

Run the offline unit tests with:

```bash
npm test
```

The tests use Node's built-in test runner and live in `tests/`. They cover track parsing, CSV-style input, YouTube URL/video ID extraction, blank-line handling, and edge cases. They do not call Google OAuth, YouTube APIs, `fetch`, or the DOM, so they do not require credentials or consume quota.

## CI

GitHub Actions runs the offline test suite on pull requests and pushes to `main`.

The workflow runs:

```bash
npm test
node --check playlist-creator.js
node --check track-parser.js
node --check server/oauth-server.mjs
node --check tests/track-parser.test.js
```

The CI job does not require API keys, OAuth credentials, or YouTube quota.

## Supported Track Formats

Paste one track per line.

```text
1. The Weeknd - Blinding Lights
The Weeknd, Save Your Tears
The Weeknd - After Hours | https://youtu.be/example1234
https://www.youtube.com/watch?v=example1234
After Hours
```

The parser currently supports:

- Numbered lines
- Bullet-style lines
- `Artist - Song`
- `Artist, Song`
- `Artist | Song`
- `Artist - Song | YouTube URL`
- Standalone YouTube URLs
- Standalone YouTube video IDs
- Plain song titles
- `.txt`, `.csv`, `.tsv`, `.md`, and text-like uploads

Plain song titles are searched as-is. Artist/title formats produce better search queries.

Rows that include a YouTube URL or video ID skip `search.list` and use that video directly. This works the same way for pasted text and uploaded files.

Supported URL examples:

```text
https://www.youtube.com/watch?v=VIDEO_ID
https://music.youtube.com/watch?v=VIDEO_ID
https://youtu.be/VIDEO_ID
https://www.youtube.com/shorts/VIDEO_ID
Artist - Song | https://youtu.be/VIDEO_ID
Artist, Song, https://www.youtube.com/watch?v=VIDEO_ID
```

## API Quota Usage

YouTube Data API quota is limited. The default daily quota is often **10,000 units**.

Current approximate cost:

```text
Create playlist:       50 units
Load playlists:         low cost, depends on playlist count/pages
Search one track:     100 units
Add one video:         50 units
```

For a 36-track playlist where every track needs search:

```text
Create playlist:        1 * 50   =   50
Search 36 tracks:      36 * 100  = 3600
Add 36 videos:         36 * 50   = 1800
----------------------------------------
Total                            = 5450
```

That is about 54.5% of a 10,000-unit daily quota.

For a 36-track playlist where every row already has a YouTube URL or video ID:

```text
Create playlist:        1 * 50   =   50
Search 36 tracks:       0 * 100  =    0
Add 36 videos:         36 * 50   = 1800
----------------------------------------
Total                            = 1850
```

## Quota Reduction Ideas

The app already skips search for rows that include a YouTube URL or video ID. Good next improvements:

- Cache search results in `localStorage`
- Add a resolve/preview step before creating the playlist

Even with direct video IDs, adding videos still costs quota:

```text
Create playlist:       50 units
Add 36 videos:   36 * 50 = 1800 units
```

The YouTube Data API does not provide a bulk playlist item insert endpoint, so each added video requires a separate `playlistItems.insert` call.

## Main Files

### `index.html`

Contains the app layout and loads:

- Google fonts
- `styles.css`
- `track-parser.js`
- `playlist-creator.js`

### `styles.css`

Contains all visual styling for cards, inputs, buttons, track list rows, logs, progress, and result state.

### `playlist-creator.js`

Contains:

- Sample track data
- File upload handling
- Music catalog suggestion search
- Backend session connection
- Backend YouTube API request helper
- Video search
- Playlist creation
- Existing playlist loading
- Existing playlist updates
- Playlist item insertion
- Progress and status rendering

### `track-parser.js`

Contains pure parsing utilities used by both the browser app and Node tests:

- Number/bullet cleanup
- CSV-style row parsing
- YouTube URL/video ID extraction
- Track object creation

### `tests/`

Contains offline unit tests for parser behavior. Run with `npm test`.

### `server/oauth-server.mjs`

Contains the no-dependency backend scaffold:

- Google OAuth authorization-code flow with offline access
- Signed HTTP-only session cookie
- Encrypted refresh-token file store under `.data/`
- Static frontend serving
- YouTube API proxy endpoints used by the browser

## Notes

- Do not commit `.env`, `.data/`, OAuth client secrets, session secrets, encryption keys, or refresh tokens.
- The included encrypted file token store is suitable for local/dev branch work. Replace it with a durable database-backed store before a real multi-user production deployment.
- Refresh tokens are requested through Google's web-server OAuth flow with offline access, not stored in the browser.
