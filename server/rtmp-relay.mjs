import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/**
 * Localise automatiquement le binaire ffmpeg sur Windows / macOS / Linux.
 */
export function findFfmpegBinary() {
  const candidates = ['ffmpeg'];
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const userProfile = process.env.USERPROFILE || os.homedir();
    const relayDir = path.dirname(fileURLToPath(import.meta.url));
    candidates.push(
      path.join(userProfile, '.local', 'ffmpeg', 'ffmpeg.exe'),
      path.join(relayDir, 'ffmpeg.exe'),
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
      path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
      path.join(userProfile, 'scoop', 'shims', 'ffmpeg.exe')
    );
    // Scan WinGet packages directory if present
    const wingetPkgDir = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
    try {
      if (fs.existsSync(wingetPkgDir)) {
        for (const entry of fs.readdirSync(wingetPkgDir)) {
          if (entry.toLowerCase().includes('ffmpeg')) {
            const sub = path.join(wingetPkgDir, entry);
            for (const subEntry of fs.readdirSync(sub)) {
              const binPath = path.join(sub, subEntry, 'bin', 'ffmpeg.exe');
              if (fs.existsSync(binPath)) candidates.push(binPath);
            }
          }
        }
      }
    } catch {}
  } else {
    candidates.push('/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg');
  }

  for (const bin of candidates) {
    try {
      const res = spawnSync(bin, ['-version'], { stdio: 'ignore', timeout: 2500 });
      if (res.status === 0) {
        return bin;
      }
    } catch {}
  }
  return null;
}

let ffmpegDownloadPromise = null;

function downloadFileFollowingRedirects(url, destTmpPath, redirectsLeft = 6) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'MonClubBillard/1.6.6' }, timeout: 30000 },
      (res) => {
        const status = res.statusCode || 200;
        const loc = res.headers?.location;
        if ([301, 302, 303, 307, 308].includes(status) && loc && redirectsLeft > 0) {
          res.resume();
          const nextUrl = new URL(loc, url).toString();
          downloadFileFollowingRedirects(nextUrl, destTmpPath, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`Téléchargement FFmpeg échoué (HTTP ${status})`));
          return;
        }
        const fileStream = fs.createWriteStream(destTmpPath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(() => resolve());
        });
        fileStream.on('error', (err) => {
          try { fs.unlinkSync(destTmpPath); } catch {}
          reject(err);
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('Timeout téléchargement FFmpeg'));
    });
    req.on('error', (err) => {
      try { fs.unlinkSync(destTmpPath); } catch {}
      reject(err);
    });
  });
}

/**
 * Télécharge automatiquement ffmpeg.exe sous ~/.local/ffmpeg/ffmpeg.exe sous Windows s'il est absent.
 */
export async function ensureFfmpegBinary() {
  const existing = findFfmpegBinary();
  if (existing) return existing;
  if (process.platform !== 'win32') return null;

  if (!ffmpegDownloadPromise) {
    ffmpegDownloadPromise = (async () => {
      const targetDir = path.join(os.homedir(), '.local', 'ffmpeg');
      const targetExe = path.join(targetDir, 'ffmpeg.exe');
      const tmpExe = `${targetExe}.tmp`;
      const downloadUrl = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-win32-x64';

      try {
        fs.mkdirSync(targetDir, { recursive: true });
        if (fs.existsSync(tmpExe)) {
          try { fs.unlinkSync(tmpExe); } catch {}
        }
        console.log('  ⏳ Téléchargement automatique de FFmpeg en cours...');
        await downloadFileFollowingRedirects(downloadUrl, tmpExe);
        if (fs.existsSync(targetExe)) {
          try { fs.unlinkSync(targetExe); } catch {}
        }
        fs.renameSync(tmpExe, targetExe);
        const verified = findFfmpegBinary();
        if (verified) {
          console.log(`  ✅ FFmpeg installé automatiquement : ${verified}\n`);
        }
        return verified;
      } catch (err) {
        console.warn('  ⚠️ Échec installation automatique FFmpeg :', err?.message || err);
        return null;
      } finally {
        ffmpegDownloadPromise = null;
      }
    })();
  }
  return ffmpegDownloadPromise;
}

function encodeWsFrame(opcode, payloadBuf) {
  const len = payloadBuf.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeUInt32BE(Math.floor(len / 0x100000000), 2);
    header.writeUInt32BE(len >>> 0, 6);
  }
  return Buffer.concat([header, payloadBuf]);
}

function sendWsJson(socket, obj) {
  if (!socket || socket.destroyed || !socket.writable) return;
  try {
    const buf = Buffer.from(JSON.stringify(obj), 'utf8');
    socket.write(encodeWsFrame(0x1, buf));
  } catch {}
}

function normalizeRtmpUrl(rtmpUrl, streamKey) {
  const base = String(rtmpUrl || '').trim();
  const key = String(streamKey || '').trim();
  if (!base || !key) return '';
  if (base.endsWith('/')) return `${base}${key}`;
  return `${base}/${key}`;
}

function handleRelayWebSocketConnection(socket) {
  let recvBuffer = Buffer.alloc(0);
  let fragmentedChunks = [];
  let fragmentedOpcode = null;

  /** @type {Map<string, { proc: import('node:child_process').ChildProcess, label: string, id: string, bytesSent: number }>} */
  const activeProcesses = new Map();
  let bytesReceived = 0;

  const stopAllTargets = (notify = true) => {
    for (const [id, item] of activeProcesses.entries()) {
      try {
        if (item.proc.stdin && !item.proc.stdin.destroyed) {
          item.proc.stdin.end();
        }
      } catch {}
      try {
        item.proc.kill('SIGTERM');
      } catch {}
      if (notify) {
        sendWsJson(socket, { type: 'target_status', id, status: 'stopped' });
      }
    }
    activeProcesses.clear();
    if (notify) {
      sendWsJson(socket, { type: 'relay_stopped' });
    }
  };

  const startTargets = async (targets) => {
    stopAllTargets(false);
    bytesReceived = 0;

    let ffmpegBin = findFfmpegBinary();
    if (!ffmpegBin) {
      sendWsJson(socket, { type: 'target_status', id: 'ffmpeg', status: 'connecting', label: 'Installation FFmpeg...' });
      ffmpegBin = await ensureFfmpegBinary();
    }
    if (!ffmpegBin) {
      sendWsJson(socket, {
        type: 'error',
        code: 'FFMPEG_NOT_FOUND',
        message: 'FFmpeg est introuvable sur ce PC. Installez FFmpeg (winget install Gyan.FFmpeg) pour diffuser directement vers Facebook et YouTube.'
      });
      return;
    }

    const validTargets = (Array.isArray(targets) ? targets : []).filter(t => t && t.rtmpUrl && t.streamKey);
    if (validTargets.length === 0) {
      sendWsJson(socket, {
        type: 'error',
        code: 'NO_TARGETS',
        message: 'Aucune plateforme avec une clé de stream valide n’est activée.'
      });
      return;
    }

    for (const target of validTargets) {
      const fullUrl = normalizeRtmpUrl(target.rtmpUrl, target.streamKey);
      if (!fullUrl) continue;

      sendWsJson(socket, { type: 'target_status', id: target.id, status: 'connecting', label: target.label || target.id });

      const args = [
        '-hide_banner',
        '-loglevel', 'warning',
        '-fflags', '+genpts',
        '-i', 'pipe:0',
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-tune', 'zerolatency',
        '-b:v', '2500k',
        '-maxrate', '2500k',
        '-bufsize', '5000k',
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        '-g', '60',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-ac', '2',
        '-f', 'flv',
        fullUrl
      ];

      const proc = spawn(ffmpegBin, args, { stdio: ['pipe', 'ignore', 'pipe'] });
      const entry = { proc, label: target.label || target.id, id: target.id, bytesSent: 0, announcedLive: false };
      activeProcesses.set(target.id, entry);

      proc.stdin.on('error', () => {});

      let stderrTail = '';
      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        stderrTail = (stderrTail + text).slice(-800);
        if (!entry.announcedLive && (text.includes('frame=') || text.includes('Output #0'))) {
          entry.announcedLive = true;
          sendWsJson(socket, { type: 'target_status', id: target.id, status: 'live' });
        }
      });

      // Fallback: mark live after 2.5s if process stays alive and receives data
      setTimeout(() => {
        const cur = activeProcesses.get(target.id);
        if (cur && cur.proc === proc && !proc.killed && proc.exitCode === null && !cur.announcedLive && bytesReceived > 0) {
          cur.announcedLive = true;
          sendWsJson(socket, { type: 'target_status', id: target.id, status: 'live' });
        }
      }, 2500);

      proc.on('close', (code) => {
        if (activeProcesses.get(target.id)?.proc === proc) {
          activeProcesses.delete(target.id);
          if (code !== 0 && code !== null) {
            sendWsJson(socket, {
              type: 'target_status',
              id: target.id,
              status: 'error',
              message: stderrTail.trim() || `FFmpeg arrêté (code ${code}). Vérifiez votre clé de stream.`
            });
          } else {
            sendWsJson(socket, { type: 'target_status', id: target.id, status: 'stopped' });
          }
        }
      });
    }

    sendWsJson(socket, { type: 'relay_started', targetCount: activeProcesses.size });
  };

  const handleMessage = (opcode, payload) => {
    if (opcode === 0x1) {
      // Text JSON control message
      try {
        const msg = JSON.parse(payload.toString('utf8'));
        if (msg.type === 'ping') {
          const ffmpegPath = findFfmpegBinary();
          sendWsJson(socket, { type: 'pong', ffmpegAvailable: Boolean(ffmpegPath), ffmpegPath });
        } else if (msg.type === 'start') {
          startTargets(msg.targets);
        } else if (msg.type === 'stop') {
          stopAllTargets(true);
        }
      } catch {}
    } else if (opcode === 0x2) {
      // Binary WebM chunk -> fan out to every active FFmpeg target
      bytesReceived += payload.length;
      for (const [id, entry] of activeProcesses.entries()) {
        if (entry.proc.stdin && entry.proc.stdin.writable && !entry.proc.killed) {
          try {
            entry.proc.stdin.write(payload);
            entry.bytesSent += payload.length;
          } catch (err) {
            sendWsJson(socket, {
              type: 'target_status',
              id,
              status: 'error',
              message: String(err?.message || 'Erreur écriture flux')
            });
          }
        }
      }
    }
  };

  socket.on('data', (chunk) => {
    recvBuffer = Buffer.concat([recvBuffer, chunk]);

    while (recvBuffer.length >= 2) {
      const byte0 = recvBuffer[0];
      const byte1 = recvBuffer[1];
      const fin = Boolean(byte0 & 0x80);
      const opcode = byte0 & 0x0f;
      const masked = Boolean(byte1 & 0x80);
      let payloadLen = byte1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (recvBuffer.length < 4) return;
        payloadLen = recvBuffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (recvBuffer.length < 10) return;
        const hi = recvBuffer.readUInt32BE(2);
        const lo = recvBuffer.readUInt32BE(6);
        payloadLen = hi * 0x100000000 + lo;
        offset = 10;
      }

      const maskLen = masked ? 4 : 0;
      if (recvBuffer.length < offset + maskLen + payloadLen) return;

      let maskKey = null;
      if (masked) {
        maskKey = recvBuffer.subarray(offset, offset + 4);
        offset += 4;
      }

      const payload = Buffer.from(recvBuffer.subarray(offset, offset + payloadLen));
      recvBuffer = recvBuffer.subarray(offset + payloadLen);

      if (masked && maskKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i % 4];
        }
      }

      if (opcode === 0x8) {
        // Close frame
        stopAllTargets(false);
        try {
          socket.end(encodeWsFrame(0x8, Buffer.alloc(0)));
        } catch {}
        return;
      }
      if (opcode === 0x9) {
        // Ping -> Pong
        try {
          socket.write(encodeWsFrame(0xA, payload));
        } catch {}
        continue;
      }
      if (opcode === 0xA) {
        continue;
      }

      if (opcode === 0x0) {
        // Continuation
        fragmentedChunks.push(payload);
        if (fin && fragmentedOpcode !== null) {
          const full = Buffer.concat(fragmentedChunks);
          const op = fragmentedOpcode;
          fragmentedChunks = [];
          fragmentedOpcode = null;
          handleMessage(op, full);
        }
      } else if (!fin) {
        fragmentedOpcode = opcode;
        fragmentedChunks = [payload];
      } else {
        handleMessage(opcode, payload);
      }
    }
  });

  socket.on('close', () => {
    stopAllTargets(false);
  });
  socket.on('error', () => {
    stopAllTargets(false);
  });

  // Send immediate hello with ffmpeg status
  const ffmpegPath = findFfmpegBinary();
  sendWsJson(socket, {
    type: 'hello',
    ffmpegAvailable: Boolean(ffmpegPath),
    ffmpegPath
  });
}

/**
 * Attache le relais WebSocket Multi-RTMP sur un serveur HTTP/HTTPS existant (Vite Dev / Preview).
 */
export function attachRtmpRelayToHttpServer(httpServer, routePath = '/api/rtmp-relay') {
  if (!httpServer || httpServer.__mcbRelayAttached) return;
  httpServer.__mcbRelayAttached = true;

  httpServer.on('upgrade', (req, socket, head) => {
    const reqUrl = (req.url || '').split('?')[0];
    if (reqUrl !== routePath) return;

    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const accept = crypto
      .createHash('sha1')
      .update(`${key}${WS_GUID}`)
      .digest('base64');

    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '\r\n'
      ].join('\r\n')
    );

    if (head && head.length > 0) {
      socket.unshift(head);
    }

    handleRelayWebSocketConnection(socket);
  });
}

function fetchHttpsJsonText(targetUrl, redirectsLeft = 2) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      targetUrl,
      {
        headers: {
          'User-Agent': 'MonClubBillard/1.6',
          Accept: 'application/json'
        },
        timeout: 8000
      },
      (upstreamRes) => {
        const status = upstreamRes.statusCode || 200;
        const loc = upstreamRes.headers?.location;
        if ([301, 302, 307, 308].includes(status) && loc && redirectsLeft > 0) {
          upstreamRes.resume();
          const nextUrl = new URL(loc, targetUrl).toString();
          fetchHttpsJsonText(nextUrl, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        const chunks = [];
        upstreamRes.on('data', (c) => chunks.push(c));
        upstreamRes.on('end', () => {
          resolve({
            statusCode: status,
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('Délai dépassé vers api.cuescore.com'));
    });
    req.on('error', reject);
  });
}

/**
 * Proxy HTTP côté PC (Vite Dev/Preview & Relais standalone) pour interroger CueScore sans blocage CORS.
 */
export async function handleCueScoreProxyRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  let tournamentId = '';
  try {
    const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
    tournamentId = String(parsedUrl.searchParams.get('id') || '').trim();
  } catch {}

  if (!/^\d+$/.test(tournamentId)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Paramètre id tournoi CueScore manquant ou invalide.' }));
    return;
  }

  try {
    const targetUrl = `https://api.cuescore.com/tournament/?id=${encodeURIComponent(tournamentId)}`;
    const upstream = await fetchHttpsJsonText(targetUrl);
    res.statusCode = upstream.statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(upstream.body);
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: String(err?.message || 'Erreur proxy CueScore') }));
  }
}

/**
 * Lance un serveur relais autonome (utile quand l'application est ouverte depuis Vercel).
 */
export function startStandaloneRelayServer(port = 8765) {
  const server = http.createServer((req, res) => {
    const reqPath = (req.url || '/').split('?')[0];
    if (reqPath === '/api/cuescore') {
      handleCueScoreProxyRequest(req, res);
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    const ffmpegPath = findFfmpegBinary();
    res.end(JSON.stringify({ ok: true, ffmpegAvailable: Boolean(ffmpegPath), ffmpegPath }));
  });

  attachRtmpRelayToHttpServer(server, '/api/rtmp-relay');

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.log(`  📡 Relais Live (port ${port}) déjà actif sur ws://127.0.0.1:${port}/api/rtmp-relay\n`);
    } else {
      console.error('Relay server error:', err);
    }
  });

  server.listen(port, '127.0.0.1', () => {
    const ffmpegPath = findFfmpegBinary();
    console.log(`\n  📡 Relais Live Facebook/YouTube actif sur ws://127.0.0.1:${port}/api/rtmp-relay`);
    console.log(`  🎱 Proxy CueScore actif sur http://127.0.0.1:${port}/api/cuescore`);
    if (ffmpegPath) {
      console.log(`  🎬 FFmpeg : Détecté (${ffmpegPath})\n`);
    } else {
      console.log('  🎬 FFmpeg : absent, installation automatique en cours...');
      ensureFfmpegBinary();
    }
  });

  return server;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  startStandaloneRelayServer(Number(process.env.RELAY_PORT || 8765));
}
