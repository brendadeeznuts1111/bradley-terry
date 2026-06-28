let refreshInFlight = false;

export const tryAcquireRefreshLock = (): boolean => {
	if (refreshInFlight) return false;
	refreshInFlight = true;
	return true;
};

export const releaseRefreshLock = (): void => {
	refreshInFlight = false;
};

export const isRefreshInFlight = (): boolean => refreshInFlight;

/** Test helper */
export const resetRefreshLock = (): void => {
	refreshInFlight = false;
};
