import type { IncomingMessage } from 'http'
import { WebSocketServer, type WebSocket } from 'ws'
import { RxLog } from './models/RxLog.js'
import { Datalog } from './models/Datalog.js'
import { isDatalogPayload, normalizeDatalog } from './datalogPayload.js'
import * as eqListStore from './eqListStore.js'
import { tickFromSnapshot } from './batchEngine.js'

function clientIp(req: IncomingMessage): string {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim()
  const ra = req.socket.remoteAddress
  if (!ra) return ''
  if (ra.startsWith('::ffff:')) return ra.slice(7)
  return ra
}

type ParsedBody = {
  userid?: string
  eqid?: string
  time?: unknown
  txpacket?: unknown
  rxpacket?: unknown
}

function parseIncoming(text: string): { body: ParsedBody; rawMessage: string; parseError: string } {
  const rawMessage = text
  try {
    const o = JSON.parse(text) as ParsedBody
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      return {
        body: {
          userid: o.userid != null ? String(o.userid) : '',
          eqid: o.eqid != null ? String(o.eqid) : '',
          time: o.time,
          txpacket: o.txpacket,
          rxpacket: o.rxpacket
        },
        rawMessage,
        parseError: ''
      }
    }
  } catch (e) {
    return { body: {}, rawMessage, parseError: e instanceof Error ? e.message : 'parse error' }
  }
  return { body: {}, rawMessage, parseError: 'empty' }
}

/** 장비/게이트웨이 → Datalog, RxLog, eqList. `noServer` — `index`에서 upgrade 경로로만 넘김(다른 WSS와 공존). */
export function createWssIngest() {
  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const senderIp = clientIp(req)

    ws.on('message', async (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      const text = (
        isBinary
          ? Buffer.isBuffer(data)
            ? data
            : Buffer.from(data as ArrayBuffer)
          : Buffer.isBuffer(data)
            ? data
            : Buffer.from(data as ArrayBuffer)
      )
        .toString('utf8')
        .trim()

      let parsedJson: Record<string, unknown> | null = null
      try {
        const o = JSON.parse(text)
        if (o && typeof o === 'object' && !Array.isArray(o)) parsedJson = o as Record<string, unknown>
      } catch {
        /* */
      }

      if (parsedJson && isDatalogPayload(parsedJson)) {
        const norm = normalizeDatalog(parsedJson, senderIp, text)
        try {
          const doc = await Datalog.create(norm)
          const W = doc.W
          const Wn = W === null || W === undefined ? null : Number(W)
          eqListStore.updateFromDatalog(String(norm.userid ?? ''), String(norm.eqid ?? ''), {
            W: Number.isFinite(Wn as number) ? (Wn as number) : null,
            ST: String(norm.ST ?? ''),
            NT: String(norm.NT ?? ''),
            msg: String(norm.msg ?? ''),
            unit: String(norm.unit ?? '')
          })
          tickFromSnapshot()
        } catch (err) {
          console.error('[datalog] save failed', err)
        }
      }

      const { body, rawMessage, parseError } = parseIncoming(text)
      const userid = body.userid ?? ''
      const eqid = body.eqid ?? ''
      const hasJsonFields = parseError === '' && Object.keys(body).length > 0
      const time = hasJsonFields ? body.time : undefined
      const txpacket = hasJsonFields ? body.txpacket : text
      const rxpacket = hasJsonFields ? body.rxpacket : undefined

      try {
        await RxLog.create({
          senderIp,
          userid,
          eqid,
          time,
          txpacket,
          rxpacket,
          rawMessage: rawMessage.length > 65536 ? rawMessage.slice(0, 65536) + '…' : rawMessage,
          parseError
        })
      } catch (err) {
        console.error('[rxLogs] save failed', err)
      }
    })

    ws.on('error', err => console.error('[wss/ingest] socket error', err))
  })

  return wss
}
