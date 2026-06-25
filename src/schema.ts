// ... existing + new helper

export const FitResult = {
  ...existing,
  toJSON: (result: FitResult) => JSON.stringify(result, null, 2)
};
// Enhancement committed