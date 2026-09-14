import 'server-only';

type Stage =
  | 'auth.verify-session'
  | 'auth.migration'
  | 'auth.account'
  | 'page.dashboard'
  | 'page.assignment'
  | 'page.admin-options';

// Server logs contain timings and deployment region only, never account data,
// URLs, tokens or errors. Slow requests remain observable without logging every read.
export async function measureServer<T>(stage: Stage, run: () => PromiseLike<T>): Promise<T> {
  const start = performance.now();
  try {
    return await run();
  } finally {
    const duration = Math.round(performance.now() - start);
    if (duration >= 1000) {
      const region = process.env.AWS_REGION;
      console.info('[performance]', {
        stage,
        duration_ms: duration,
        region: region && /^[a-z]{2}(?:-[a-z]+)+-\d$/.test(region) ? region : 'unknown',
      });
    }
  }
}
