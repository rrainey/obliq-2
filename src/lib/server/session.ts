/**
 * Local single-user session.
 *
 * The app runs on localhost as the OS user. Browser requests carry an
 * httpOnly, SameSite=Strict cookie whose value is an HMAC of a constant under
 * a per-install secret (<OBLIQ_HOME>/local-secret). Non-browser clients (MCP,
 * automations, scripts) use API tokens instead.
 */

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { getStorage } from './storage'

export const LOCAL_USER_ID = 'local'
export const SESSION_COOKIE = 'obliq_session'

let cachedSecret: { file: string; secret: Buffer } | null = null

function getLocalSecret(): Buffer {
  const file = getStorage().paths.localSecret
  if (cachedSecret?.file === file) return cachedSecret.secret
  let hex: string
  try {
    hex = fs.readFileSync(file, 'utf8').trim()
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    hex = crypto.randomBytes(32).toString('hex')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    try {
      fs.writeFileSync(file, hex + '\n', { mode: 0o600, flag: 'wx' })
    } catch (writeErr) {
      // Lost a race with another process; use whatever it wrote.
      if ((writeErr as NodeJS.ErrnoException).code !== 'EEXIST') throw writeErr
      hex = fs.readFileSync(file, 'utf8').trim()
    }
  }
  cachedSecret = { file, secret: Buffer.from(hex, 'hex') }
  return cachedSecret.secret
}

export function sessionCookieValue(): string {
  return crypto.createHmac('sha256', getLocalSecret()).update('obliq-local-session-v1').digest('hex')
}

export function isValidSessionCookie(value: string | undefined | null): boolean {
  if (!value) return false
  const expected = Buffer.from(sessionCookieValue())
  const actual = Buffer.from(value)
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

export function localUserInfo() {
  let username = 'local'
  try {
    username = os.userInfo().username
  } catch {
    // userInfo can throw in unusual environments; fall back to a constant.
  }
  return { id: LOCAL_USER_ID, username, home: getStorage().paths.home }
}
