import { retryWithBackoff } from '../utils/retry';

jest.setTimeout(20000);

describe('retryWithBackoff', () => {
  it('retries and eventually succeeds', async () => {
    let calls = 0;
    const res = await retryWithBackoff(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('fail');
        return 'ok';
      },
      { maxRetries: 5, baseDelayMs: 5, maxDelayMs: 100, timeoutMs: 1000 },
    );

    expect(res).toBe('ok');
    expect(calls).toBe(3);
  });

  it('gives up after max retries', async () => {
    let calls = 0;
    await expect(
      retryWithBackoff(
        async () => {
          calls += 1;
          throw new Error('permanent');
        },
        { maxRetries: 2, baseDelayMs: 5, maxDelayMs: 50, timeoutMs: 1000 },
      ),
    ).rejects.toThrow('permanent');

    expect(calls).toBeGreaterThanOrEqual(3); // initial + 2 retries
  });
});
