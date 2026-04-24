import { WebSocketServer, type WebSocket } from 'ws'
import type { IncomingMessage } from 'http'
import jwt from 'jsonwebtoken'
import * as eqListStore from './eqListStore.js'
import * as batchEngine from './batchEngine.js'

/** 관리 UI(JWT) — eqList 푸시·후속 `op` 확장. `noServer` — `index`에서 upgrade 경로로만 넘김. */
export function createWssApp(jwtSecret: string) {
  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const u = new URL(req.url || '/', 'http://local')
    const tok = u.searchParams.get('token') || u.searchParams.get('access_token')
    if (!tok) {
      ws.close(4001, 'token required')
      return
    }
    try {
      jwt.verify(tok, jwtSecret) as { sub: string; username: string }
    } catch {
      ws.close(4002, 'invalid token')
      return
    }

    eqListStore.registerAppClient(ws)
    batchEngine.pushBatchStateToOne(ws)

    ws.on('message', async (data: Buffer) => {
      const text = data.toString('utf8').trim()
      if (!text) return
      try {
        const o = JSON.parse(text) as { op?: string; specId?: string }
        if (o?.op === 'ping') {
          if (ws.readyState === 1) ws.send(JSON.stringify({ op: 'pong', t: Date.now() }))
          return
        }
        if (o?.op === 'startBatch') {
          const r = await batchEngine.startBatch(String(o.specId ?? ''))
          if (ws.readyState === 1) ws.send(JSON.stringify({ op: 'startBatchAck', specId: o.specId, ...r }))
          return
        }
        if (o?.op === 'cancelBatch') {
          batchEngine.cancelBatch()
          return
        }
      } catch {
        /* ignore */
      }
    })

    ws.on('error', err => console.error('[wss/app] error', err))
  })

  return wss
}
