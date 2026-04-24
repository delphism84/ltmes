import { SystemConfig, DEFAULT_WEIGHT_AUTO } from './models/SystemConfig.js'
import { TagList } from './models/TagList.js'
import { DEFAULT_LTMES_SPECS } from './defaultSpecs.js'

const DEFAULT_TAGS = [
  { code: 'G1', name: '자갈', eqid: '10', deviceName: 'lt.ww01', inputMode: '자동', active: true },
  { code: 'S2', name: '석분', eqid: '20', deviceName: 'lt.ww02', inputMode: '자동', active: true },
  { code: 'S1', name: '모래', eqid: '30', deviceName: 'lt.ww03', inputMode: '자동', active: true },
  { code: 'W', name: '물', eqid: '40', deviceName: 'lt.ww04', inputMode: '자동', active: true },
  { code: 'M3', name: '혼화제', eqid: '50', deviceName: 'lt.ww05', inputMode: '자동', active: true },
  { code: 'C1', name: '시멘트', eqid: '60', deviceName: 'lt.ww06', inputMode: '자동', active: true },
  { code: 'C2', name: '예비', eqid: '70', deviceName: 'lt.ww07', inputMode: '자동', active: true },
  { code: 'Ad1', name: 'AE감수제', eqid: '80', deviceName: 'lt.ww08', inputMode: '자동', active: true },
  { code: 'Ad2', name: 'AE감수제2', eqid: '90', deviceName: 'lt.ww09', inputMode: '자동', active: true }
]

export async function seedSystemConfig() {
  const k = 'weightAuto'
  const cur = await SystemConfig.findOne({ key: k }).lean()
  if (!cur) {
    await SystemConfig.create({ key: k, value: DEFAULT_WEIGHT_AUTO })
    console.log('[seed] systemConfig weightAuto')
  }
}

export async function seedLtmesEmulation() {
  const k = 'ltmesEmulation'
  const cur = await SystemConfig.findOne({ key: k }).lean()
  if (!cur) {
    await SystemConfig.create({ key: k, value: { enabled: false } })
    console.log('[seed] ltmesEmulation')
  }
}

export async function seedTagsAndSpecs() {
  const n = await TagList.countDocuments()
  if (n === 0) {
    await TagList.insertMany(DEFAULT_TAGS)
    console.log('[seed] tagList defaults')
  }
  const sp = await SystemConfig.findOne({ key: 'ltmesSpecs' }).lean()
  if (!sp) {
    await SystemConfig.create({ key: 'ltmesSpecs', value: DEFAULT_LTMES_SPECS })
    console.log('[seed] ltmesSpecs defaults')
  }
}
