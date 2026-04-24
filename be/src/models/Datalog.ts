import mongoose from 'mongoose'

/** 저울/시리얼 등 구조화 페이로드 — 컬렉션명 `datalog` */
const datalogSchema = new mongoose.Schema(
  {
    senderIp: { type: String, required: true, index: true },
    userid: { type: String, default: '', index: true },
    eqid: { type: String, default: '', index: true },
    time: { type: mongoose.Schema.Types.Mixed },
    ST: { type: String, default: '' },
    NT: { type: String, default: '' },
    W: { type: Number, default: null },
    unit: { type: String, default: '' },
    msg: { type: String, required: true },
    rawMessage: { type: String, default: '' }
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'datalog' }
)

datalogSchema.index({ createdAt: -1 })

export const Datalog = mongoose.models.Datalog || mongoose.model('Datalog', datalogSchema)
