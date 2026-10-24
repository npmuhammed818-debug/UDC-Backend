/**
 * Execute an asynchronous background job without allowing transient failures
 * (including synchronous task setup failures) to terminate the Node process.
 * The caller owns its retry/backoff schedule; this helper never retries or
 * logs provider/database error details.
 */
export function runBackgroundTask(
  task: () => Promise<unknown>,
  onFailure: () => void,
): void {
  void Promise.resolve()
    .then(task)
    .catch(() => {
      // Even a logging failure must not introduce an unhandled rejection.
      try {
        onFailure();
      } catch {
        // The caller's next scheduled attempt remains responsible for recovery.
      }
    });
}
