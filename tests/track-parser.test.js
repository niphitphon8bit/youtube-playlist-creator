const test = require('node:test');
const assert = require('node:assert/strict');

const {
  stripNumbering,
  extractYouTubeVideoId,
  removeVideoReference,
  parseCsvLine,
  parseTrackLine,
  parseTracks
} = require('../track-parser');

const VIDEO_ID = 'dQw4w9WgXcQ';

test('stripNumbering removes numeric prefixes and bullets', () => {
  assert.equal(stripNumbering('1. The Weeknd - Blinding Lights'), 'The Weeknd - Blinding Lights');
  assert.equal(stripNumbering('01) The Weeknd - Blinding Lights'), 'The Weeknd - Blinding Lights');
  assert.equal(stripNumbering('- The Weeknd - Blinding Lights'), 'The Weeknd - Blinding Lights');
  assert.equal(stripNumbering('* The Weeknd - Blinding Lights'), 'The Weeknd - Blinding Lights');
  assert.equal(stripNumbering('• The Weeknd - Blinding Lights'), 'The Weeknd - Blinding Lights');
});

test('parseTrackLine parses common artist and title formats', () => {
  assert.deepEqual(parseTrackLine('The Weeknd - Blinding Lights'), {
    artist: 'The Weeknd',
    title: 'Blinding Lights',
    display: 'The Weeknd - Blinding Lights',
    videoId: null
  });

  assert.deepEqual(parseTrackLine('The Weeknd, Save Your Tears'), {
    artist: 'The Weeknd',
    title: 'Save Your Tears',
    display: 'The Weeknd - Save Your Tears',
    videoId: null
  });

  assert.deepEqual(parseTrackLine('The Weeknd | After Hours'), {
    artist: 'The Weeknd',
    title: 'After Hours',
    display: 'The Weeknd - After Hours',
    videoId: null
  });

  assert.deepEqual(parseTrackLine('The Weeknd\tAfter Hours'), {
    artist: 'The Weeknd',
    title: 'After Hours',
    display: 'The Weeknd - After Hours',
    videoId: null
  });

  assert.deepEqual(parseTrackLine('After Hours'), {
    artist: '',
    title: 'After Hours',
    display: 'After Hours',
    videoId: null
  });
});

test('parseCsvLine handles quoted values, commas, and escaped quotes', () => {
  assert.deepEqual(parseCsvLine('The Weeknd, Save Your Tears'), ['The Weeknd', 'Save Your Tears']);
  assert.deepEqual(parseCsvLine('"The Weeknd", "Save Your Tears"'), ['The Weeknd', 'Save Your Tears']);
  assert.deepEqual(parseCsvLine('"Artist, With Comma", Song Title'), ['Artist, With Comma', 'Song Title']);
  assert.deepEqual(parseCsvLine('"Artist", "Song ""Quoted"" Title"'), ['Artist', 'Song "Quoted" Title']);
});

test('parseTrackLine parses CSV-style rows', () => {
  assert.deepEqual(parseTrackLine('"Artist, With Comma", Song Title'), {
    artist: 'Artist, With Comma',
    title: 'Song Title',
    display: 'Artist, With Comma - Song Title',
    videoId: null
  });

  assert.deepEqual(parseTrackLine('"Artist", "Song ""Quoted"" Title"'), {
    artist: 'Artist',
    title: 'Song "Quoted" Title',
    display: 'Artist - Song "Quoted" Title',
    videoId: null
  });
});

test('extractYouTubeVideoId supports YouTube URL and raw ID formats', () => {
  assert.equal(extractYouTubeVideoId(`https://www.youtube.com/watch?v=${VIDEO_ID}`), VIDEO_ID);
  assert.equal(extractYouTubeVideoId(`https://music.youtube.com/watch?v=${VIDEO_ID}`), VIDEO_ID);
  assert.equal(extractYouTubeVideoId(`https://youtu.be/${VIDEO_ID}`), VIDEO_ID);
  assert.equal(extractYouTubeVideoId(`https://www.youtube.com/shorts/${VIDEO_ID}`), VIDEO_ID);
  assert.equal(extractYouTubeVideoId(`https://www.youtube.com/embed/${VIDEO_ID}`), VIDEO_ID);
  assert.equal(extractYouTubeVideoId(`https://www.youtube.com/live/${VIDEO_ID}`), VIDEO_ID);
  assert.equal(extractYouTubeVideoId(VIDEO_ID), VIDEO_ID);
});

test('extractYouTubeVideoId ignores invalid IDs and non-YouTube URLs', () => {
  assert.equal(extractYouTubeVideoId('https://youtu.be/not-valid'), null);
  assert.equal(extractYouTubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(extractYouTubeVideoId('not a url'), null);
  assert.doesNotThrow(() => extractYouTubeVideoId('https://'));
});

test('removeVideoReference removes URLs and trailing separators', () => {
  assert.equal(
    removeVideoReference(`The Weeknd - After Hours | https://youtu.be/${VIDEO_ID}`, VIDEO_ID),
    'The Weeknd - After Hours'
  );
  assert.equal(removeVideoReference(`https://youtu.be/${VIDEO_ID}`, VIDEO_ID), '');
  assert.equal(removeVideoReference(`The Weeknd, Save Your Tears, ${VIDEO_ID}`, VIDEO_ID), 'The Weeknd, Save Your Tears');
});

test('parseTrackLine parses mixed title plus YouTube URL rows', () => {
  assert.deepEqual(parseTrackLine(`The Weeknd - After Hours | https://youtu.be/${VIDEO_ID}`), {
    artist: 'The Weeknd',
    title: 'After Hours',
    display: 'The Weeknd - After Hours',
    videoId: VIDEO_ID
  });

  assert.deepEqual(parseTrackLine(`The Weeknd, Save Your Tears, https://www.youtube.com/watch?v=${VIDEO_ID}`), {
    artist: 'The Weeknd',
    title: 'Save Your Tears',
    display: 'The Weeknd - Save Your Tears',
    videoId: VIDEO_ID
  });

  assert.deepEqual(parseTrackLine(`1. The Weeknd - Blinding Lights https://youtu.be/${VIDEO_ID}`), {
    artist: 'The Weeknd',
    title: 'Blinding Lights',
    display: 'The Weeknd - Blinding Lights',
    videoId: VIDEO_ID
  });
});

test('parseTrackLine parses URL-only and ID-only rows', () => {
  assert.deepEqual(parseTrackLine(`https://youtu.be/${VIDEO_ID}`), {
    artist: '',
    title: VIDEO_ID,
    display: `YouTube video ${VIDEO_ID}`,
    videoId: VIDEO_ID
  });

  assert.deepEqual(parseTrackLine(VIDEO_ID), {
    artist: '',
    title: VIDEO_ID,
    display: `YouTube video ${VIDEO_ID}`,
    videoId: VIDEO_ID
  });
});

test('parseTrackLine returns null for empty input', () => {
  assert.equal(parseTrackLine(''), null);
  assert.equal(parseTrackLine('   '), null);
});

test('parseTrackLine leaves non-YouTube URLs as searchable text', () => {
  assert.deepEqual(parseTrackLine('Artist - Song https://example.com/video'), {
    artist: 'Artist',
    title: 'Song https://example.com/video',
    display: 'Artist - Song https://example.com/video',
    videoId: null
  });
});

test('parseTracks ignores blank lines and supports Windows newlines', () => {
  assert.deepEqual(parseTracks(`\r\nThe Weeknd - Blinding Lights\r\n\r\nAfter Hours\r\n`), [
    {
      artist: 'The Weeknd',
      title: 'Blinding Lights',
      display: 'The Weeknd - Blinding Lights',
      videoId: null
    },
    {
      artist: '',
      title: 'After Hours',
      display: 'After Hours',
      videoId: null
    }
  ]);
});
