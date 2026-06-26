/** Periodic Massey → BT refresh driven by RatingsConfig.interval (seconds). */
export const startRefreshScheduler = (
  intervalSeconds: number,
  onRefresh: () => Promise<unknown>,
): (() => void) => {
  if (intervalSeconds <= 0) return () => {};

  const timer = setInterval(() => {
    onRefresh().catch((err) => {
      console.error("[scheduler] refresh failed:", err);
    });
  }, intervalSeconds * 1000);

  return () => clearInterval(timer);
};
