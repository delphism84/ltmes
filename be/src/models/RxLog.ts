import mongoose from 'mongoose'

const rxLogSchema = new mongoose.Schema(
  {
    senderIp: { type: String, required: true, index: true },
    userid: { type: String, default: '', index: true },
    eqid: { type: String, default: '', index: true },
    /** 클라이언트 메시지의 time (문자열·숫자·객체 등) */
    time: { type: mongoose.Schema.Types.Mixed },
    txpacket: { type: mongoose.Schema.Types.Mixed },
    rxpacket: { type: mongoose.Schema.Types.Mixed },
    rawMessage: { type: String, default: '' },
    parseError: { type: String, default: '' }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

rxLogSchema.index({ createdAt: -1 })

export type RxLogDoc = mongoose.InferSchemaType<typeof rxLogSchema>
export const RxLog = mongoose.models.RxLog || mongoose.model('RxLog', rxLogSchema)
