/**
 * Runs `connect` until it succeeds. The M8 Headless is slower to enumerate and may not be
 * immediately ready when the user clicks Connect, so failures are retried after a delay.
 * Resolves to undefined once all attempts have failed.
 */
export const connectWithRetry = async <T>(
    connect: () => Promise<T>,
    { maxAttempts = 3, retryDelayMs = 1500 }: { maxAttempts?: number; retryDelayMs?: number } = {},
): Promise<T | undefined> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await connect()
        } catch (err) {
            console.warn(`Connection attempt ${attempt}/${maxAttempts} failed:`, err)
            if (attempt < maxAttempts) {
                await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs))
            } else {
                console.error('Could not connect to M8 after all attempts:', err)
            }
        }
    }
    return undefined
}
