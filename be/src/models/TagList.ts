import mongoose from 'mongoose'

const tagListSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true, trim: true },
    name: { type: String, default: '' },
    eqid: { type: String, required: true, trim: true },
    deviceName: { type: String, default: '' },
    inputMode: { type: String, default: '자동' },
    active: { type: Boolean, default: true }
  },
  { timestamps: true, collection: 'tagList' }
)

export type TagListDoc = mongoose.InferSchemaType<typeof tagListSchema>

export const TagList = mongoose.models.TagList || mongoose.model('TagList', tagListSchema)
