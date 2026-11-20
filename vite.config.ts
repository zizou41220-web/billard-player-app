import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import os from 'node:os'
import { attachRtmpRelayToHttpServer, findFfmpegBinary, handleCueScoreProxyRequest } from './server/rtmp-relay.mjs'

function rtmpRelayPlugin(): Plugin {
  const attach = (server: any) => {
    if (server.httpServer) {
      attachRtmpRelayToHttpServer(server.httpServer, '/api/rtmp-relay')
    }
    server.middlewares.use('/api/rtmp-relay/health', (_req: any, res: any) => {
      const ffmpegPath = findFfmpegBinary()
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, ffmpegAvailable: Boolean(ffmpegPath), ffmpegPath }))
    })
    server.middlewares.use('/api/cuescore', (req: any, res: any) => {
      handleCueScoreProxyRequest(req, res)
    })
  }
  return {
    name: 'mcb-rtmp-relay',
    configureServer: attach,
    configurePreviewServer: attach
  }
}

// Détecte automatiquement l'adresse IP du PC sur le Wi-Fi courant (maison, club...)
// pour que le QR code "rejoindre l'application" pointe toujours vers la bonne adresse.
function detectLanIp(): string {
  const virtual = /vethernet|virtualbox|vmware|wsl|hyper-v|loopback|docker|tailscale|zerotier/i
  const candidates: { name: string; address: string }[] = []
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (virtual.test(name)) continue
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) candidates.push({ name, address: a.address })
    }
  }
  const score = (ip: string) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3)
  candidates.sort((a, b) => score(a.address) - score(b.address))
  return candidates[0]?.address || 'localhost'
}

const PORT = 5173
const lanUrl = `https://${detectLanIp()}:${PORT}`
console.log(`\n  📱 Adresse pour les smartphones : ${lanUrl}\n`)

export default defineConfig({
  base: './',
  plugins: [react(), basicSsl(), rtmpRelayPlugin()],
  server: { host: true, port: PORT, strictPort: true },
  define: { __LAN_URL__: JSON.stringify(lanUrl) },
})
