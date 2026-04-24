import 'dotenv/config'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import cors from 'cors'
import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { createWssIngest } from './wssIngest.js'
import { createWssApp } from './wssApp.js'
import { User } from './models/User.js'
import { RxLog } from './models/RxLog.js'
import { Datalog } from './models/Datalog.js'
import { RecordLog } from './models/RecordLog.js'
import { WeightCompleteDraft } from './models/WeightCompleteDraft.js'
import { TagList } from './models/TagList.js'
import { SystemConfig, DEFAULT_WEIGHT_AUTO } from './models/SystemConfig.js'
import { DEFAULT_LTMES_SPECS, MATERIAL_CODES, type LtmesSpec } from './defaultSpecs.js'
import * as eqListStore from './eqListStore.js'
import { seedDefaultAdmin } from './seedAdmin.js'
import { seedSystemConfig, seedTagsAndSpecs, seedLtmesEmulation } from './seedConfig.js'
import { authMiddleware, type AuthedRequest } from './authMiddleware.js'
import { invalidateEmulationConfig, stopWeightEmulation } from './batchEngine.js'

const PORT = Number(process.env.PORT || 48998)
const JWT_SECRET = process.env.JWT_SECRET || 'ltmes-dev-change-me'
const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://admin:Eogks%21%4034@127.0.0.1:48999/?authSource=admin'
const WS_PATH_INGEST = process.env.WS_PATH_INGEST || '/ws/ingest'
const WS_PATH_APP = process.env.WS_PATH_APP || '/ws/app'
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || ''
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || ''
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'

async function main() {
  await mongoose.connect(MONGODB_URI)
  console.log('[mongo] connected')
  await seedDefaultAdmin(process.env.DEFAULT_ADMIN_PASSWORD || 'Eogks!@34')
  await seedSystemConfig()
  await seedTagsAndSpecs()
  await seedLtmesEmulation()

  const app = express()
  app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map(s => s.trim()), credentials: true }))
  app.use(express.json({ limit: '2mb' }))

  app.get('/health', (_req, res) => res.json({ ok: true }))

  app.post('/api/auth/login', async (req, res) => {
    const username = String(req.body?.username ?? '').trim()
    const password = String(req.body?.password ?? '')
    if (!username || !password) return res.status(400).json({ error: 'username and password required' })
    const user = await User.findOne({ username })
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
    const token = jwt.sign({ sub: String(user._id), username: user.username }, JWT_SECRET, { expiresIn: '7d' })
    res.json({ token, Token: token })
  })

  const auth = authMiddleware(JWT_SECRET)

  app.get('/api/rx-logs', auth, async (req: AuthedRequest, res) => {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50))
    const skip = (page - 1) * limit
    const filter: Record<string, unknown> = {}
    const q = (req.query.q as string)?.trim()
    if (q) {
      const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      filter.$or = [
        { userid: new RegExp(esc, 'i') },
        { eqid: new RegExp(esc, 'i') },
        { senderIp: q }
      ]
    }
    const [rows, total] = await Promise.all([
      RxLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      RxLog.countDocuments(filter)
    ])
    res.json({
      data: rows.map(r => {
        const legacy = r as Record<string, unknown>
        const oldPacket = legacy.packet
        const txpacket = legacy.txpacket !== undefined ? legacy.txpacket : oldPacket
        return {
          _id: r._id,
          senderIp: r.senderIp,
          userid: r.userid,
          eqid: r.eqid,
          time: r.time,
          txpacket,
          rxpacket: r.rxpacket,
          rawMessage: r.rawMessage,
          parseError: r.parseError,
          createdAt: r.createdAt
        }
      }),
      total,
      page,
      limit
    })
  })

  app.get('/api/datalog', auth, async (req: AuthedRequest, res) => {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50))
    const skip = (page - 1) * limit
    const filter: Record<string, unknown> = {}
    const q = (req.query.q as string)?.trim()
    if (q) {
      const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      filter.$or = [
        { userid: new RegExp(esc, 'i') },
        { eqid: new RegExp(esc, 'i') },
        { senderIp: q },
        { msg: new RegExp(esc, 'i') }
      ]
    }
    const [rows, total] = await Promise.all([
      Datalog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Datalog.countDocuments(filter)
    ])
    res.json({
      data: rows.map(r => ({
        _id: r._id,
        senderIp: r.senderIp,
        userid: r.userid,
        eqid: r.eqid,
        time: r.time,
        ST: r.ST,
        NT: r.NT,
        W: r.W,
        unit: r.unit,
        msg: r.msg,
        rawMessage: r.rawMessage,
        createdAt: r.createdAt
      })),
      total,
      page,
      limit
    })
  })

  app.get('/api/eq-list', auth, (_req: AuthedRequest, res) => {
    res.json({ data: eqListStore.getEqListSnapshot() })
  })

  app.get('/api/tags', auth, async (_req: AuthedRequest, res) => {
    const rows = await TagList.find({}).sort({ code: 1 }).lean()
    res.json({ data: rows })
  })

  app.post('/api/tags', auth, async (req: AuthedRequest, res) => {
    const code = String(req.body?.code ?? '')
      .trim()
      .toUpperCase()
    const name = String(req.body?.name ?? '').trim()
    const eqid = String(req.body?.eqid ?? '').trim()
    if (!code || !eqid) return res.status(400).json({ error: 'code and eqid required' })
    try {
      const doc = await TagList.create({
        code,
        name,
        eqid,
        deviceName: String(req.body?.deviceName ?? '').trim(),
        inputMode: String(req.body?.inputMode ?? '자동').trim() || '자동',
        active: req.body?.active !== false
      })
      res.status(201).json(doc.toJSON())
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'create failed'
      res.status(400).json({ error: msg })
    }
  })

  app.put('/api/tags/:id', auth, async (req: AuthedRequest, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'bad id' })
    const b = (req.body ?? {}) as Record<string, unknown>
    const $set: Record<string, unknown> = {}
    if (typeof b.name === 'string') $set.name = b.name.trim()
    if (typeof b.eqid === 'string') $set.eqid = b.eqid.trim()
    if (typeof b.deviceName === 'string') $set.deviceName = b.deviceName.trim()
    if (typeof b.inputMode === 'string') $set.inputMode = b.inputMode.trim()
    if (typeof b.active === 'boolean') $set.active = b.active
    if (typeof b.code === 'string' && b.code.trim()) $set.code = b.code.trim().toUpperCase()
    const doc = await TagList.findByIdAndUpdate(req.params.id, { $set }, { new: true })
    if (!doc) return res.status(404).json({ error: 'not found' })
    res.json(doc.toJSON())
  })

  app.delete('/api/tags/:id', auth, async (req: AuthedRequest, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'bad id' })
    const d = await TagList.findByIdAndDelete(req.params.id)
    if (!d) return res.status(404).json({ error: 'not found' })
    res.json({ ok: true })
  })

  app.get('/api/specs', auth, async (_req: AuthedRequest, res) => {
    const doc = (await SystemConfig.findOne({ key: 'ltmesSpecs' }).lean()) as
      | { value?: { specs?: LtmesSpec[] } }
      | null
    const list = doc?.value?.specs
    res.json({ specs: Array.isArray(list) && list.length > 0 ? list : DEFAULT_LTMES_SPECS.specs })
  })

  function normalizeSpecsPayload(body: unknown): { specs: LtmesSpec[] } | null {
    if (!body || typeof body !== 'object') return null
    const raw = (body as { specs?: unknown }).specs
    if (!Array.isArray(raw)) return null
    const out: LtmesSpec[] = []
    const allowed = new Set<string>([...MATERIAL_CODES])
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const specId = String((item as { specId?: unknown }).specId ?? '').trim()
      if (!specId) continue
      const materials: LtmesSpec['materials'] = {}
      const mat = (item as { materials?: Record<string, unknown> }).materials
      if (mat && typeof mat === 'object') {
        for (const [k, v] of Object.entries(mat)) {
          if (!allowed.has(k)) continue
          if (!v || typeof v !== 'object') continue
          const en = (v as { enabled?: unknown }).enabled
          const tk = (v as { targetKg?: unknown }).targetKg
          materials[k] = {
            enabled: en !== false,
            targetKg: tk == null || tk === '' ? null : Number(tk)
          }
        }
      }
      out.push({ specId, materials })
    }
    return out.length > 0 ? { specs: out } : null
  }

  app.put('/api/specs', auth, async (req: AuthedRequest, res) => {
    const norm = normalizeSpecsPayload(req.body)
    if (!norm) return res.status(400).json({ error: 'specs: non-empty array required' })
    await SystemConfig.updateOne({ key: 'ltmesSpecs' }, { $set: { value: norm } }, { upsert: true })
    res.json({ ok: true, specs: norm.specs })
  })

  app.get('/api/weight-drafts', auth, async (req: AuthedRequest, res) => {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50))
    const skip = (page - 1) * limit
    const [rows, total] = await Promise.all([
      WeightCompleteDraft.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      WeightCompleteDraft.countDocuments({})
    ])
    res.json({ data: rows, total, page, limit })
  })

  app.post('/api/weight-drafts', auth, async (req: AuthedRequest, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>
    const num = (k: string) => {
      const x = b[k]
      if (x == null || x === '') return null
      const n = Number(x)
      return Number.isFinite(n) ? n : null
    }
    const doc = await WeightCompleteDraft.create({
      specId: String(b.specId ?? ''),
      batchId: String(b.batchId ?? ''),
      status: String(b.status ?? 'draft') || 'draft',
      G1: num('G1'),
      S2: num('S2'),
      S1: num('S1'),
      W: num('W'),
      M3: num('M3'),
      C1: num('C1'),
      C2: num('C2'),
      Ad1: num('Ad1'),
      Ad2: num('Ad2')
    })
    res.status(201).json(doc.toJSON())
  })

  app.get('/api/weight-drafts/:id', auth, async (req: AuthedRequest, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'bad id' })
    const d = await WeightCompleteDraft.findById(req.params.id).lean()
    if (!d) return res.status(404).json({ error: 'not found' })
    res.json(d)
  })

  function mergeDraftConfirmPayload(
    body: Record<string, unknown>,
    draft: Record<string, unknown>
  ) {
    const pick = (k: string): number | null => {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        const x = body[k]
        if (x == null || x === '') return null
        const n = Number(x)
        return Number.isFinite(n) ? n : null
      }
      const v = draft[k]
      if (v == null || v === '') return null
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    const specFromBody = typeof body.specId === 'string' ? body.specId.trim() : ''
    return {
      G1: pick('G1'),
      S2: pick('S2'),
      S1: pick('S1'),
      W: pick('W'),
      M3: pick('M3'),
      C1: pick('C1'),
      C2: pick('C2'),
      Ad1: pick('Ad1'),
      Ad2: pick('Ad2'),
      specId: specFromBody || String(draft.specId ?? ''),
      batchId: typeof body.batchId === 'string' ? String(body.batchId) : String(draft.batchId ?? ''),
      note: typeof body.note === 'string' ? body.note : ''
    }
  }

  app.post('/api/weight-drafts/:id/confirm', auth, async (req: AuthedRequest, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'bad id' })
    const draft = await WeightCompleteDraft.findById(req.params.id)
    if (!draft) return res.status(404).json({ error: 'not found' })
    if (draft.status !== 'draft') return res.status(409).json({ error: 'already confirmed' })
    const merged = mergeDraftConfirmPayload((req.body ?? {}) as Record<string, unknown>, draft.toObject())
    const record = await RecordLog.create({
      G1: merged.G1,
      S2: merged.S2,
      S1: merged.S1,
      W: merged.W,
      M3: merged.M3,
      C1: merged.C1,
      C2: merged.C2,
      Ad1: merged.Ad1,
      Ad2: merged.Ad2,
      specId: merged.specId,
      batchId: merged.batchId,
      note: merged.note,
      createdBy: req.username || ''
    })
    draft.status = 'confirmed'
    draft.recordLogId = record._id
    draft.G1 = merged.G1
    draft.S2 = merged.S2
    draft.S1 = merged.S1
    draft.W = merged.W
    draft.M3 = merged.M3
    draft.C1 = merged.C1
    draft.C2 = merged.C2
    draft.Ad1 = merged.Ad1
    draft.Ad2 = merged.Ad2
    draft.specId = merged.specId
    draft.batchId = merged.batchId
    await draft.save()
    res.json({ ok: true, record: record.toJSON(), draft: draft.toJSON() })
  })

  app.delete('/api/weight-drafts/:id', auth, async (req: AuthedRequest, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'bad id' })
    const d = await WeightCompleteDraft.findByIdAndDelete(req.params.id)
    if (!d) return res.status(404).json({ error: 'not found' })
    res.json({ ok: true })
  })

  app.get('/api/system-config/weight-auto', auth, async (_req: AuthedRequest, res) => {
    const doc = (await SystemConfig.findOne({ key: 'weightAuto' }).lean()) as
      | { value?: typeof DEFAULT_WEIGHT_AUTO }
      | null
    res.json({ value: doc?.value ?? DEFAULT_WEIGHT_AUTO })
  })

  app.put('/api/system-config/weight-auto', auth, async (req: AuthedRequest, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>
    const cur =
      ((await SystemConfig.findOne({ key: 'weightAuto' }).lean()) as { value?: typeof DEFAULT_WEIGHT_AUTO } | null)
        ?.value ?? DEFAULT_WEIGHT_AUTO
    const mode = b.mode === 'percent' ? 'percent' : 'abs'
    const merged = {
      mode,
      absPlus: typeof b.absPlus === 'number' ? b.absPlus : Number(b.absPlus) || cur.absPlus,
      absMinus: typeof b.absMinus === 'number' ? b.absMinus : Number(b.absMinus) || cur.absMinus,
      percentHalfWidth:
        typeof b.percentHalfWidth === 'number'
          ? b.percentHalfWidth
          : Number(b.percentHalfWidth) || cur.percentHalfWidth,
      stabilityWindowSec:
        typeof b.stabilityWindowSec === 'number'
          ? b.stabilityWindowSec
          : Number(b.stabilityWindowSec) || cur.stabilityWindowSec
    }
    await SystemConfig.updateOne({ key: 'weightAuto' }, { $set: { value: merged } }, { upsert: true })
    res.json({ ok: true, value: merged })
  })

  app.get('/api/system-config/emulation', auth, async (_req: AuthedRequest, res) => {
    const doc = (await SystemConfig.findOne({ key: 'ltmesEmulation' }).lean()) as
      | { value?: { enabled?: boolean } }
      | null
    res.json({ value: { enabled: doc?.value?.enabled === true } })
  })

  app.put('/api/system-config/emulation', auth, async (req: AuthedRequest, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>
    const enabled = b.enabled === true
    await SystemConfig.updateOne(
      { key: 'ltmesEmulation' },
      { $set: { value: { enabled } } },
      { upsert: true }
    )
    invalidateEmulationConfig()
    if (!enabled) stopWeightEmulation()
    res.json({ ok: true, value: { enabled } })
  })

  const weightBody = (b: Record<string, unknown>) => ({
    G1: b.G1 != null ? Number(b.G1) : null,
    S2: b.S2 != null ? Number(b.S2) : null,
    S1: b.S1 != null ? Number(b.S1) : null,
    W: b.W != null ? Number(b.W) : null,
    M3: b.M3 != null ? Number(b.M3) : null,
    C1: b.C1 != null ? Number(b.C1) : null,
    C2: b.C2 != null ? Number(b.C2) : null,
    Ad1: b.Ad1 != null ? Number(b.Ad1) : null,
    Ad2: b.Ad2 != null ? Number(b.Ad2) : null,
    specId: String(b.specId ?? ''),
    batchId: String(b.batchId ?? ''),
    note: String(b.note ?? '')
  })

  function recordLogDateFilter(req: AuthedRequest) {
    const filter: Record<string, unknown> = {}
    const from = (req.query.from as string)?.trim()
    const to = (req.query.to as string)?.trim()
    if (from || to) {
      filter.createdAt = {}
      if (from) (filter.createdAt as Record<string, Date>).$gte = new Date(from)
      if (to) (filter.createdAt as Record<string, Date>).$lte = new Date(to)
    }
    return filter
  }

  function escapeCsvCell(v: unknown): string {
    if (v === null || v === undefined) return ''
    const s = String(v)
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  app.get('/api/record-logs/export/csv', auth, async (req: AuthedRequest, res) => {
    const filter = recordLogDateFilter(req)
    const rows = await RecordLog.find(filter).sort({ createdAt: -1 }).limit(5000).lean()
    const cols = [
      '_id',
      'createdAt',
      'specId',
      'batchId',
      'note',
      'createdBy',
      'G1',
      'S2',
      'S1',
      'W',
      'M3',
      'C1',
      'C2',
      'Ad1',
      'Ad2'
    ] as const
    const lines = [cols.join(',')]
    for (const r of rows) {
      const row = r as Record<string, unknown>
      lines.push(cols.map(c => escapeCsvCell(row[c])).join(','))
    }
    const bom = '\uFEFF'
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="record-logs.csv"')
    res.send(bom + lines.join('\n'))
  })

  app.get('/api/record-logs/export/print', auth, async (req: AuthedRequest, res) => {
    const filter = recordLogDateFilter(req)
    const rows = await RecordLog.find(filter).sort({ createdAt: -1 }).limit(500).lean()
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const trs = rows
      .map(r => {
        const x = r as Record<string, unknown>
        return `<tr><td>${esc(String(x._id))}</td><td>${esc(String(x.createdAt))}</td><td>${esc(String(x.specId ?? ''))}</td><td>${esc(String(x.G1 ?? ''))}</td><td>${esc(String(x.S2 ?? ''))}</td><td>${esc(String(x.S1 ?? ''))}</td><td>${esc(String(x.W ?? ''))}</td><td>${esc(String(x.M3 ?? ''))}</td><td>${esc(String(x.C1 ?? ''))}</td><td>${esc(String(x.C2 ?? ''))}</td><td>${esc(String(x.Ad1 ?? ''))}</td><td>${esc(String(x.Ad2 ?? ''))}</td><td>${esc(String(x.note ?? ''))}</td></tr>`
      })
      .join('')
    const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"/><title>recordLogs</title>
<style>body{font-family:sans-serif} table{border-collapse:collapse;width:100%} th,td{border:1px solid #ccc;padding:6px;font-size:12px} th{background:#f0f0f0}</style></head><body>
<h1>LTMES recordLogs</h1><p>브라우저 인쇄(Ctrl+P) → PDF 저장</p>
<table><thead><tr><th>_id</th><th>createdAt</th><th>specId</th><th>G1</th><th>S2</th><th>S1</th><th>W</th><th>M3</th><th>C1</th><th>C2</th><th>Ad1</th><th>Ad2</th><th>note</th></tr></thead><tbody>${trs}</tbody></table>
</body></html>`
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="record-logs-print.html"')
    res.send(html)
  })

  app.get('/api/record-logs/export/xlsx', auth, async (req: AuthedRequest, res) => {
    try {
      const filter = recordLogDateFilter(req)
      const rows = await RecordLog.find(filter).sort({ createdAt: -1 }).limit(2000).lean()
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('recordLogs')
      const cols = [
        '_id',
        'createdAt',
        'specId',
        'batchId',
        'note',
        'createdBy',
        'G1',
        'S2',
        'S1',
        'W',
        'M3',
        'C1',
        'C2',
        'Ad1',
        'Ad2'
      ] as const
      ws.addRow([...cols])
      for (const r of rows) {
        const x = r as Record<string, unknown>
        ws.addRow(cols.map(c => x[c]))
      }
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      res.setHeader('Content-Disposition', 'attachment; filename="record-logs.xlsx"')
      await wb.xlsx.write(res)
    } catch (e) {
      console.error('[export/xlsx]', e)
      res.status(500).json({ error: 'xlsx export failed' })
    }
  })

  app.get('/api/record-logs/export/pdf', auth, async (req: AuthedRequest, res) => {
    try {
      const filter = recordLogDateFilter(req)
      const rows = await RecordLog.find(filter).sort({ createdAt: -1 }).limit(120).lean()
      const PDFDocument = (await import('pdfkit')).default
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', 'attachment; filename="record-logs.pdf"')
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 })
      doc.pipe(res)
      doc.fontSize(11).text('LTMES recordLogs', { underline: true })
      doc.moveDown(0.5)
      doc.fontSize(7)
      const line = (r: Record<string, unknown>) =>
        [
          String(r._id).slice(-8),
          String(r.createdAt ?? '').slice(0, 19),
          String(r.specId ?? ''),
          String(r.G1 ?? ''),
          String(r.S2 ?? ''),
          String(r.S1 ?? ''),
          String(r.W ?? ''),
          String(r.M3 ?? '')
        ].join('  ')
      doc.text('id… time spec G1 S2 S1 W M3', { continued: false })
      doc.moveDown(0.25)
      for (const r of rows) {
        doc.text(line(r as Record<string, unknown>), { width: 780 })
      }
      doc.end()
    } catch (e) {
      console.error('[export/pdf]', e)
      if (!res.headersSent) res.status(500).json({ error: 'pdf export failed' })
    }
  })

  app.get('/api/record-logs', auth, async (req: AuthedRequest, res) => {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50))
    const skip = (page - 1) * limit
    const filter = recordLogDateFilter(req)
    const [rows, total] = await Promise.all([
      RecordLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      RecordLog.countDocuments(filter)
    ])
    res.json({ data: rows, total, page, limit })
  })

  app.get('/api/record-logs/:id', auth, async (req: AuthedRequest, res) => {
    const r = await RecordLog.findById(req.params.id).lean()
    if (!r) return res.status(404).json({ error: 'not found' })
    res.json(r)
  })

  app.post('/api/record-logs', auth, async (req: AuthedRequest, res) => {
    const w = weightBody((req.body ?? {}) as Record<string, unknown>)
    const doc = await RecordLog.create({
      ...w,
      createdBy: req.username || ''
    })
    res.status(201).json(doc.toJSON())
  })

  app.put('/api/record-logs/:id', auth, async (req: AuthedRequest, res) => {
    const w = weightBody((req.body ?? {}) as Record<string, unknown>)
    const doc = await RecordLog.findByIdAndUpdate(
      req.params.id,
      { $set: w },
      { new: true }
    )
    if (!doc) return res.status(404).json({ error: 'not found' })
    res.json(doc.toJSON())
  })

  app.delete('/api/record-logs/:id', auth, async (req: AuthedRequest, res) => {
    const d = await RecordLog.findByIdAndDelete(req.params.id)
    if (!d) return res.status(404).json({ error: 'not found' })
    res.json({ ok: true })
  })

  let server: http.Server | https.Server
  if (SSL_CERT_PATH && SSL_KEY_PATH && fs.existsSync(SSL_CERT_PATH) && fs.existsSync(SSL_KEY_PATH)) {
    const opts = {
      cert: fs.readFileSync(SSL_CERT_PATH),
      key: fs.readFileSync(SSL_KEY_PATH)
    }
    server = https.createServer(opts, app)
    console.log(`[tls] cert ${SSL_CERT_PATH}`)
  } else {
    server = http.createServer(app)
    console.log('[tls] HTTP (set SSL_CERT_PATH + SSL_KEY_PATH for WSS)')
  }

  const wssIngest = createWssIngest()
  const wssApp = createWssApp(JWT_SECRET)
  server.on('upgrade', (req, socket, head) => {
    const pathname = (req.url || '/').split('?')[0] || ''
    if (pathname === WS_PATH_INGEST) {
      wssIngest.handleUpgrade(req, socket, head, ws => {
        wssIngest.emit('connection', ws, req)
      })
      return
    }
    if (pathname === WS_PATH_APP) {
      wssApp.handleUpgrade(req, socket, head, ws => {
        wssApp.emit('connection', ws, req)
      })
      return
    }
    socket.destroy()
  })

  server.listen(PORT, () => {
    console.log(`[http] listening ${PORT} (REST + WSS ${WS_PATH_INGEST} + ${WS_PATH_APP})`)
  })
}

main().catch((e: Error) => {
  console.error(e)
  process.exit(1)
})
