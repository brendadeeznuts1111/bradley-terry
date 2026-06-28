let inFlightRequests = 0;

export const getInFlightRequests = (): number => inFlightRequests;

export const trackInFlight = async <T>(fn: () => Promise<T>): Promise<T> => {
	inFlightRequests += 1;
	try {
		return await fn();
	} finally {
		inFlightRequests -= 1;
	}
};

export const waitForInFlight = async (timeoutMs: number): Promise<boolean> => {
	const deadline = Date.now() + timeoutMs;
	while (inFlightRequests > 0 && Date.now() < deadline) {
		await Bun.sleep(50);
	}
	return inFlightRequests === 0;
};

/** Test helper */
export const resetInFlightTracking = (): void => {
	inFlightRequests = 0;
};
