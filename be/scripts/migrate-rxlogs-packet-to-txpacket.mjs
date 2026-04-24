#!/usr/bin/env node
/**
 * 구 스키마 `packet` 필드만 있는 문서를 `txpacket`으로 옮기고 `packet` 제거
 * 실행: node scripts/migrate-rxlogs-packet-to-txpacket.mjs
 */
import 'dotenv/config'
import mongoose from 'mongoose'

const uri = process.env.MONGODB_URI || 'mongodb://admin:Eogks%21%4034@127.0.0.1:48999/?authSource=admin'

async function main() {
  await mongoose.connect(uri)
  const col = mongoose.connection.db.collection('rxlogs')
  const cur = col.find({ packet: { $exists: true }, txpacket: { $exists: false } })
  let n = 0
  for await (const doc of cur) {
    await col.updateOne(
      { _id: doc._id },
      { $set: { txpacket: doc.packet }, $unset: { packet: '' } }
    )
    n += 1
  }
  console.log(`[migrate] updated ${n} document(s)`)
  await mongoose.disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
