import bcrypt from 'bcryptjs'
import { User } from './models/User.js'

const DEFAULT_USER = 'admin'
const DEFAULT_PASS = 'Eogks!@34'

export async function seedDefaultAdmin(defaultPassword = DEFAULT_PASS) {
  const exists = await User.findOne({ username: DEFAULT_USER })
  if (exists) return
  const passwordHash = await bcrypt.hash(defaultPassword, 10)
  await User.create({ username: DEFAULT_USER, passwordHash })
  console.log(`[seed] created default user ${DEFAULT_USER}`)
}
