import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, '.data');
const tokenStorePath = path.join(dataDir, 'oauth-tokens.json');
const envPath = path.join(rootDir, '.env');

async function loadDotEnv() {
  try {
    const raw = await fs.readFile(envPath, 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const separator = trimmed.indexOf('=');
      if (separator === -1) return;
      const key = trimmed.slice(0, separator).trim();
      const rawValue = trimmed.slice(separator + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, '');
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

await loadDotEnv();

const config = {
  port: Number(process.env.PORT || 8787),
  appOrigin: process.env.APP_ORIGIN || 'http://localhost:8787',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8787/auth/google/callback',
  sessionSecret: process.env.SESSION_SECRET || '',
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY || ''
};

const scopes = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/youtube'
];
function assertConfig() {
  const missing = [];
  if (!config.googleClientId) missing.push('GOOGLE_CLIENT_ID');
  if (!config.googleClientSecret) missing.push('GOOGLE_CLIENT_SECRET');
  if (!config.sessionSecret) missing.push('SESSION_SECRET');
  if (!config.tokenEncryptionKey) missing.push('TOKEN_ENCRYPTION_KEY');
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers
  });
  res.end(JSON.stringify(body));
}

function redirect(res, location, headers = {}) {
  res.writeHead(302, { Location: location, ...headers });
  res.end();
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...value] = part.split('=');
        return [key, decodeURIComponent(value.join('='))];
      })
  );
}

function cookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || '/'}`);
  parts.push('HttpOnly');
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

function hmac(value) {
  return crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
}

function sign(value) {
  return `${value}.${hmac(value)}`;
}

function verifySigned(value) {
  const [payload, signature] = String(value || '').split('.');
  if (!payload || !signature) return null;
  const expected = hmac(payload);
  const providedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (providedBytes.length !== expectedBytes.length) return null;
  return crypto.timingSafeEqual(providedBytes, expectedBytes) ? payload : null;
}

function newId() {
  return crypto.randomBytes(24).toString('base64url');
}

function encryptionKey() {
  const key = Buffer.from(config.tokenEncryptionKey, 'base64');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  }
  return key;
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
}

function decrypt(value) {
  const [ivRaw, tagRaw, textRaw] = String(value || '').split('.');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivRaw, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  const clear = Buffer.concat([
    decipher.update(Buffer.from(textRaw, 'base64url')),
    decipher.final()
  ]);
  return clear.toString('utf8');
}

async function readStore() {
  try {
    return JSON.parse(await fs.readFile(tokenStorePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function writeStore(store) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(tokenStorePath, JSON.stringify(store, null, 2));
}

async function saveAccountRecord(profile, refreshToken) {
  const store = await readStore();
  store.users ||= {};
  const existing = store.users[profile.sub] || {};
  store.users[profile.sub] = {
    refreshToken: refreshToken ? encrypt(refreshToken) : existing.refreshToken,
    profile: {
      sub: profile.sub,
      email: profile.email || '',
      emailVerified: Boolean(profile.email_verified),
      name: profile.name || profile.email || 'Google account',
      givenName: profile.given_name || '',
      familyName: profile.family_name || '',
      picture: profile.picture || ''
    },
    updatedAt: new Date().toISOString()
  };
  if (!store.users[profile.sub].refreshToken) {
    throw new Error('Google did not return a refresh token. Revoke consent and try again.');
  }
  await writeStore(store);
}

async function loadUserRecord(userId) {
  const store = await readStore();
  return store.users?.[userId] || null;
}

async function loadRefreshToken(userId) {
  const record = await loadUserRecord(userId);
  if (!record?.refreshToken) return null;
  return decrypt(record.refreshToken);
}

async function loadStoredProfile(userId) {
  const record = await loadUserRecord(userId);
  return record?.profile || null;
}

async function clearAccountRecord(userId) {
  const store = await readStore();
  if (store.users?.[userId]) {
    delete store.users[userId];
  }
  await writeStore(store);
}

function currentSession(req) {
  const signedId = parseCookies(req).playlist_session;
  const userId = verifySigned(signedId);
  return userId ? { userId } : null;
}

function authHeaders() {
  return { 'Content-Type': 'application/x-www-form-urlencoded' };
}

async function exchangeCodeForTokens(code) {
  const body = new URLSearchParams({
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.googleRedirectUri
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: authHeaders(),
    body
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Token exchange failed.');
  return data;
}

async function fetchGoogleProfile(accessToken) {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  if (!res.ok || !data.sub) {
    throw new Error(data.error_description || data.error || 'Could not load Google profile.');
  }
  return data;
}

async function refreshAccessToken(userId) {
  const refreshToken = await loadRefreshToken(userId);
  if (!refreshToken) return null;
  const body = new URLSearchParams({
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: authHeaders(),
    body
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Token refresh failed.');
  return data.access_token || null;
}

async function youtubeFetch(req, res, targetPath, init = {}) {
  const session = currentSession(req);
  if (!session) {
    json(res, 401, { error: 'Not authenticated.' });
    return;
  }
  const accessToken = await refreshAccessToken(session.userId);
  if (!accessToken) {
    json(res, 401, { error: 'Reconnect Google to continue.' });
    return;
  }
  const upstream = await fetch(`https://www.googleapis.com/youtube/v3/${targetPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  const text = await upstream.text();
  res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(text);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.md')) return 'text/markdown; charset=utf-8';
  return 'application/octet-stream';
}

async function serveStatic(res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(rootDir, safePath));
  if (!filePath.startsWith(rootDir)) {
    json(res, 403, { error: 'Forbidden.' });
    return;
  }
  try {
    const file = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    res.end(file);
  } catch (error) {
    json(res, 404, { error: 'Not found.' });
  }
}

async function handler(req, res) {
  const url = new URL(req.url || '/', config.appOrigin);

  try {
    if (url.pathname === '/api/auth/status') {
      const session = currentSession(req);
      const profile = session ? await loadStoredProfile(session.userId) : null;
      const authenticated = Boolean(session && profile && await loadRefreshToken(session.userId));
      json(res, 200, { authenticated, profile: authenticated ? profile : null });
      return;
    }

    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      const session = currentSession(req);
      if (session) {
        await clearAccountRecord(session.userId);
      }
      json(res, 200, { ok: true }, {
        'Set-Cookie': cookie('playlist_session', '', { maxAge: 0, secure: config.appOrigin.startsWith('https://') })
      });
      return;
    }

    if (url.pathname === '/auth/google') {
      const state = newId();
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', config.googleClientId);
      authUrl.searchParams.set('redirect_uri', config.googleRedirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', scopes.join(' '));
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('include_granted_scopes', 'true');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('state', state);
      redirect(res, authUrl.toString(), {
        'Set-Cookie': cookie('oauth_state', sign(state), { maxAge: 600, secure: config.appOrigin.startsWith('https://') })
      });
      return;
    }

    if (url.pathname === '/auth/google/callback') {
      const signedState = parseCookies(req).oauth_state;
      const expectedState = verifySigned(signedState);
      const receivedState = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      if (!code || !expectedState || expectedState !== receivedState) {
        json(res, 400, { error: 'Invalid OAuth callback state.' });
        return;
      }
      const tokens = await exchangeCodeForTokens(code);
      const profile = await fetchGoogleProfile(tokens.access_token);
      await saveAccountRecord(profile, tokens.refresh_token || '');
      redirect(res, '/', {
        'Set-Cookie': [
          cookie('playlist_session', sign(profile.sub), { maxAge: 60 * 60 * 24 * 7, secure: config.appOrigin.startsWith('https://') }),
          cookie('oauth_state', '', { maxAge: 0, secure: config.appOrigin.startsWith('https://') })
        ]
      });
      return;
    }

    if (url.pathname === '/api/youtube/playlists' && req.method === 'GET') {
      await youtubeFetch(req, res, `playlists${url.search}`);
      return;
    }

    if (url.pathname === '/api/youtube/playlists' && req.method === 'POST') {
      await youtubeFetch(req, res, 'playlists?part=snippet,status', {
        method: 'POST',
        body: JSON.stringify(await readBody(req))
      });
      return;
    }

    if (url.pathname === '/api/youtube/search' && req.method === 'GET') {
      await youtubeFetch(req, res, `search${url.search}`);
      return;
    }

    if (url.pathname === '/api/youtube/playlist-items' && req.method === 'POST') {
      await youtubeFetch(req, res, 'playlistItems?part=snippet', {
        method: 'POST',
        body: JSON.stringify(await readBody(req))
      });
      return;
    }

    if (url.pathname === '/api/youtube/playlist-items' && req.method === 'GET') {
      await youtubeFetch(req, res, `playlistItems${url.search}`);
      return;
    }

    await serveStatic(res, url.pathname);
  } catch (error) {
    json(res, 500, { error: error.message || 'Server error.' });
  }
}

assertConfig();
http.createServer(handler).listen(config.port, () => {
  console.log(`Playlist app server listening on ${config.appOrigin}`);
});
