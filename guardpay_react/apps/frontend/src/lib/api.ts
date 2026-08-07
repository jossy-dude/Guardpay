// API client — typed fetch wrapper for the GuardPay backend

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

const BASE = '/api'
const TIMEOUT_MS = 15000

// Guards against re-entrancy: the auth re-check itself makes a request that
// can also 401, which must not loop back and trigger this handler again.
let authRecheckInFlight = false

/** Session lapsed → flip `authenticated` so the LockScreen returns, then let
 *  the store re-verify (a transient 401 re-authorizes; a real expiry stays
 *  locked). Loaded dynamically to avoid a circular import (authStore imports
 *  this module). */
async function handleUnauthorized(path: string) {
  if (path.startsWith('/auth') || authRecheckInFlight) return
  authRecheckInFlight = true
  try {
    const { useAuthStore } = await import('@/features/auth/authStore')
    useAuthStore.setState({ authenticated: false, loading: false })
    await useAuthStore.getState().check()
  } catch {
    /* check() handles its own errors */
  } finally {
    authRecheckInFlight = false
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isForm = options.body instanceof FormData
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: isForm ? undefined : { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      signal: controller.signal,
      ...options,
    })
  } catch (err) {
    if (controller.signal.aborted) {
      throw new ApiError(0, 'Request timed out — is the server running?')
    }
    throw new ApiError(0, 'Network error — could not reach the server')
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    if (res.status === 401) void handleUnauthorized(path)
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.detail) message = body.detail
      else if (body?.error) message = body.error
    } catch {
      /* ignore non-JSON */
    }
    throw new ApiError(res.status, message)
  }

  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
}