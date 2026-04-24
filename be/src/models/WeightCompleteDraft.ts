import mongoose from 'mongoose'

const draftSchema = new mongoose.Schema(
  {
    G1: { type: Number, default: null },
    S2: { type: Number, default: null },
    S1: { type: Number, default: null },
    W: { type: Number, default: null },
    M3: { type: Number, default: null },
    C1: { type: Number, default: null },
    C2: { type: Number, default: null },
    Ad1: { type: Number, default: null },
    Ad2: { type: Number, default: null },
    specId: { type: String, default: '' },
    batchId: { type: String, default: '' },
    status: { type: String, default: 'draft', index: true },
    recordLogId: { type: mongoose.Schema.Types.ObjectId, ref: 'RecordLog', default: null }
  },
  { timestamps: true, collection: 'weightCompleteDraft' }
)

draftSchema.index({ createdAt: -1 })

export const WeightCompleteDraft = mongoose.models.WeightCompleteDraft || mongoose.model('WeightCompleteDraft', draftSchema)
