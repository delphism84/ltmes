#!/usr/bin/env node
/**
 * WSS 송신 → REST로 rxLogs 조회까지 일괄 검증
 * 메시지 형식: { userid, eqid, time, txpacket, rxpacket }
 */
import WebSocket from 'ws'

const WS_URL = process.env.WS_URL || 'ws://127.0.0.1:48998/ws'
const API_URL = process.env.API_URL || 'http://127.0.0.1:48998'
const USER = process.env.QA_USER || 'admin'
const PASS = process.env.QA_PASS || 'Eogks!@34'

const stamp = `qa-${Date.now()}`
const payload = {
  userid: 'qa-user',
  eqid: `eq-${stamp}`,
  time: new Date().toISOString(),
  txpacket: { cmd: 'ping', stamp },
  rxpacket: { ack: true, stamp }
}

function log(msg, obj) {
  console.log(`[qa-bot] ${msg}`, obj !== undefined ? JSON.stringify(obj) : '')
}

async function login() {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.token) throw new Error(data.error || `login ${res.status}`)
  return data.token
}

async function fetchRxLogs(token, q) {
  const qs = new URLSearchParams({ page: '1', limit: '20' })
  if (q) qs.set('q', q)
  const res = await fetch(`${API_URL}/api/rx-logs?${qs}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `rx-logs ${res.status}`)
  return data
}

function sendWs() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL)
    const t = setTimeout(() => {
      ws.terminate()
      reject(new Error('WebSocket connect timeout (5s)'))
    }, 5000)
    ws.on('open', () => {
      clearTimeout(t)
      const msg = JSON.stringify(payload)
      ws.send(msg)
      log('sent', payload)
      setTimeout(() => {
        ws.close()
        resolve()
      }, 300)
    })
    ws.on('error', err => {
      clearTimeout(t)
      reject(err)
    })
  })
}

async function main() {
  log('WS_URL', WS_URL)
  log('API_URL', API_URL)
  await sendWs()
  log('ws closed, waiting for DB write (800ms)...')
  await new Promise(r => setTimeout(r, 800))

  const token = await login()
  log('login ok')

  const byEq = await fetchRxLogs(token, payload.eqid)
  const rows = byEq.data || []
  const hit = rows.find(r => r.eqid === payload.eqid && String(r.userid) === payload.userid)
  if (!hit) {
    log('FAIL: no matching row for eqid', payload.eqid)
    log('last rows sample', rows.slice(0, 3))
    process.exit(1)
  }
  log('OK: rxLogs match', {
    _id: hit._id,
    senderIp: hit.senderIp,
    userid: hit.userid,
    eqid: hit.eqid,
    time: hit.time,
    txpacket: hit.txpacket,
    rxpacket: hit.rxpacket
  })
  process.exit(0)
}

main().catch(e => {
  console.error('[qa-bot] ERROR', e.message || e)
  process.exit(1)
})
