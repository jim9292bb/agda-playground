/**
 * Retries a network operation with exponential backoff. Meant for wrapping
 * a full "fetch + read the body" attempt (not just the initial fetch()
 * call) since a socket can drop mid-read after fetch() already resolved
 * with a 200 — e.g. `TypeError: terminated` / `SocketError: other side
 * closed` from undici, observed downloading large release assets during a
 * Vercel build.
 *
 * @template T
 * @param {() => Promise<T>} attempt
 * @param {{retries?: number, baseDelayMs?: number, label?: string}} [options]
 * @returns {Promise<T>}
 */
export async function withRetry(attempt, options = {}) {
  const { retries = 3, baseDelayMs = 500, label = 'operation' } = options
  let lastErr
  for (let i = 0; i <= retries; i++) {
    try {
      return await attempt()
    } catch (err) {
      lastErr = err
      if (i === retries) break
      const delayMs = baseDelayMs * 2 ** i
      console.warn(`  ${label} failed (attempt ${i + 1}/${retries + 1}): ${err.message}; retrying in ${delayMs}ms`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
  throw lastErr
}
