import { describe, expect, it } from 'bun:test'
import { connectWithRetry } from '../src/features/connection/connectWithRetry'

const quiet = async <T>(fn: () => Promise<T>) => {
    const { warn, error } = console
    console.warn = () => {}
    console.error = () => {}
    try {
        return await fn()
    } finally {
        console.warn = warn
        console.error = error
    }
}

describe('connectWithRetry', () => {
    it('returns the first successful connection without retrying', async () => {
        let calls = 0
        const result = await connectWithRetry(async () => ++calls, { retryDelayMs: 0 })
        expect(result).toBe(1)
        expect(calls).toBe(1)
    })

    it('retries failures and resolves once an attempt succeeds', async () => {
        let calls = 0
        const result = await quiet(() =>
            connectWithRetry(
                async () => {
                    calls++
                    if (calls < 3) throw new Error('not ready')
                    return 'bus'
                },
                { retryDelayMs: 0 },
            ),
        )
        expect(result).toBe('bus')
        expect(calls).toBe(3)
    })

    it('gives up with undefined after maxAttempts failures', async () => {
        let calls = 0
        const result = await quiet(() =>
            connectWithRetry(
                async () => {
                    calls++
                    throw new Error('nope')
                },
                { maxAttempts: 2, retryDelayMs: 0 },
            ),
        )
        expect(result).toBeUndefined()
        expect(calls).toBe(2)
    })
})
