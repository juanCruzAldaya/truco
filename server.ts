import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'
import next from 'next'
import { registerGameHandlers } from './lib/socket/game-handlers'

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT ?? '3000', 10)

async function main() {
  const app = next({ dev })
  const handle = app.getRequestHandler()
  await app.prepare()

  const expressApp = express()
  const httpServer = createServer(expressApp)

  const io = new Server(httpServer, {
    cors: { origin: process.env.NEXTAUTH_URL ?? 'http://localhost:3000' },
  })

  const pubClient = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subClient = pubClient.duplicate() as any
  await Promise.all([pubClient.connect(), subClient.connect()])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  io.adapter(createAdapter(pubClient as any, subClient))

  io.on('connection', (socket) => {
    registerGameHandlers(io, socket, pubClient)
  })

  expressApp.all('/{*path}', (req, res) => handle(req, res))

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`)
  })
}

main().catch(console.error)
