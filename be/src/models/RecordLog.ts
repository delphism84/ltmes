import mongoose from 'mongoose'

const weightFields = {
  G1: { type: Number, default: null },
  S2: { type: Number, default: null },
  S1: { type: Number, default: null },
  W: { type: Number, default: null },
  M3: { type: Number, default: null },
  C1: { type: Number, default: null },
  C2: { type: Number, default: null },
  Ad1: { type: Number, default: null },
  Ad2: { type: Number, default: null }
} as const

const recordLogSchema = new mongoose.Schema(
  {
    ...weightFields,
    specId: { type: String, default: '' },
    batchId: { type: String, default: '' },
    note: { type: String, default: '' },
    createdBy: { type: String, default: '' }
  },
  { timestamps: true, collection: 'recordLogs' }
)

recordLogSchema.index({ createdAt: -1 })

export type RecordLogDoc = mongoose.InferSchemaType<typeof recordLogSchema>

export const RecordLog = mongoose.models.RecordLog || mongoose.model('RecordLog', recordLogSchema)
