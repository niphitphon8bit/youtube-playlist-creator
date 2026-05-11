(function (root, factory) {
  const parser = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = parser;
  }

  if (root) {
    root.TrackParser = parser;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function stripNumbering(line) {
    return String(line || '')
      .replace(/^\s*\d+[\s.)-]+/, '')
      .replace(/^\s*[-*•]\s+/, '')
      .trim();
  }

  function normalizeVideoId(value) {
    const id = String(value || '').trim();
    return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  }

  function extractYouTubeVideoId(value) {
    const text = String(value || '').trim();
    if (!text) return null;

    const rawId = normalizeVideoId(text);
    if (rawId) return rawId;

    const urlMatch = text.match(/https?:\/\/[^\s,|]+/);
    if (!urlMatch) return null;

    try {
      const url = new URL(urlMatch[0]);
      const host = url.hostname.replace(/^www\./, '');

      if (host === 'youtu.be') {
        return normalizeVideoId(url.pathname.split('/').filter(Boolean)[0]);
      }

      if (host === 'youtube.com' || host === 'music.youtube.com' || host.endsWith('.youtube.com')) {
        if (url.searchParams.has('v')) {
          return normalizeVideoId(url.searchParams.get('v'));
        }

        const parts = url.pathname.split('/').filter(Boolean);
        const idPrefixes = new Set(['embed', 'shorts', 'live']);
        if (idPrefixes.has(parts[0]) && parts[1]) {
          return normalizeVideoId(parts[1]);
        }
      }
    } catch (e) {
      return null;
    }

    return null;
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function removeVideoReference(value, videoId) {
    return String(value || '')
      .replace(/https?:\/\/[^\s,|]+/g, '')
      .replace(new RegExp(`\\b${escapeRegExp(videoId)}\\b`, 'g'), '')
      .replace(/[|,;\-–—\s]+$/, '')
      .trim();
  }

  function parseCsvLine(line) {
    const values = [];
    let current = '';
    let quoted = false;

    for (let i = 0; i < String(line || '').length; i++) {
      const ch = line[i];
      const next = line[i + 1];

      if (ch === '"' && quoted && next === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        quoted = !quoted;
      } else if (ch === ',' && !quoted) {
        values.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }

    values.push(current.trim());
    return values;
  }

  function parseTrackLine(line) {
    const clean = stripNumbering(line);
    if (!clean) return null;

    const videoId = extractYouTubeVideoId(clean);
    const textWithoutVideo = videoId ? removeVideoReference(clean, videoId) : clean;

    if (videoId && !textWithoutVideo) {
      return {
        artist: '',
        title: videoId,
        display: `YouTube video ${videoId}`,
        videoId
      };
    }

    const csvValues = parseCsvLine(textWithoutVideo);
    if (csvValues.length >= 2 && csvValues[0] && csvValues[1]) {
      const title = csvValues.slice(1).join(' ').trim();
      return {
        artist: csvValues[0],
        title,
        display: `${csvValues[0]} - ${title}`,
        videoId
      };
    }

    const separators = [' - ', ' – ', ' — ', ' | ', '\t'];
    for (const sep of separators) {
      if (textWithoutVideo.includes(sep)) {
        const [artist, ...titleParts] = textWithoutVideo.split(sep);
        const title = titleParts.join(sep).trim();
        if (artist.trim() && title) {
          return {
            artist: artist.trim(),
            title,
            display: `${artist.trim()} - ${title}`,
            videoId
          };
        }
      }
    }

    return {
      artist: '',
      title: textWithoutVideo,
      display: textWithoutVideo,
      videoId
    };
  }

  function parseTracks(raw) {
    return String(raw || '')
      .split(/\r?\n/)
      .map(parseTrackLine)
      .filter(Boolean);
  }

  return {
    stripNumbering,
    extractYouTubeVideoId,
    removeVideoReference,
    parseCsvLine,
    parseTrackLine,
    parseTracks
  };
}));
