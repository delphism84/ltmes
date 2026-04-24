import mongoose from 'mongoose'

/** key 단위 설정 — weightAuto, specsJson 등 */
const systemConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'systemConfig' }
)

export const SystemConfig = mongoose.models.SystemConfig || mongoose.model('SystemConfig', systemConfigSchema)

export const DEFAULT_WEIGHT_AUTO = {
  mode: 'abs' as 'abs' | 'percent',
  absPlus: 10,
  absMinus: 15,
  percentHalfWidth: 5,
  stabilityWindowSec: 3.5
}
