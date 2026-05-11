# YouTube Playlist Creator

A small browser-based tool for creating a YouTube or YouTube Music playlist from a pasted track list or uploaded text file.

The app uses the YouTube Data API v3 to:

- Authenticate with a Google account
- Create a playlist
- Search YouTube for tracks that do not already include a YouTube URL or video ID
- Add the matched videos to the playlist

## Project Structure

```text
.
├── yt-playlist-creator.html  # App markup
├── styles.css                # UI styling
├── playlist-creator.js       # Track parsing, auth, YouTube API calls
└── README.md
```

## Requirements

- A Google Cloud project
- YouTube Data API v3 enabled
- A YouTube Data API key
- An OAuth 2.0 Client ID for a Web application

## Google Setup

1. Open Google Cloud Console:
   https://console.cloud.google.com/apis/credentials

2. Enable **YouTube Data API v3** for your project.

3. Create an **API Key**.

4. Create an **OAuth 2.0 Client ID**:
   - Application type: **Web application**
   - Add this app's page URL as an authorized JavaScript origin.

If you open the HTML file directly, the origin may be `file://`, which is not suitable for OAuth in many setups. Prefer serving the folder locally, for example:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/yt-playlist-creator.html
```

Add `http://localhost:8000` as an authorized JavaScript origin in your OAuth client.

## Usage

1. Open `yt-playlist-creator.html` in a browser.
2. Enter your YouTube Data API key.
3. Enter your OAuth 2.0 Client ID.
4. Click **Connect Google Account**.
5. Set the playlist name, description, and visibility.
6. Paste tracks into the track list or upload a text-like file.
7. Click **Load Tracks**.
8. Click **Create Playlist**.

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

### `yt-playlist-creator.html`

Contains the app layout and loads:

- Google fonts
- `styles.css`
- Google Identity Services
- `playlist-creator.js`

### `styles.css`

Contains all visual styling for cards, inputs, buttons, track list rows, logs, progress, and result state.

### `playlist-creator.js`

Contains:

- Sample track data
- Track parsing
- File upload handling
- Google OAuth token setup
- YouTube API request helper
- Video search
- Playlist creation
- Playlist item insertion
- Progress and status rendering

## Notes

- API keys and OAuth client IDs are entered in the browser and are not saved by this app.
- Do not commit real API keys or OAuth secrets.
- This is a browser-only tool. It does not require a backend server.
