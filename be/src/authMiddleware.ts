import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export type AuthedRequest = Request & { userId?: string; username?: string }

export function authMiddleware(secret: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const h = req.headers.authorization
    const tok = h?.startsWith('Bearer ') ? h.slice(7) : null
    if (!tok) return res.status(401).json({ error: 'Unauthorized' })
    try {
      const p = jwt.verify(tok, secret) as { sub: string; username: string }
      req.userId = p.sub
      req.username = p.username
      next()
    } catch {
      return res.status(401).json({ error: 'Invalid token' })
    }
  }
}
