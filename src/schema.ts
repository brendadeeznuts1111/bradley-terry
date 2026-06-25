export const FitResultSchema = Schema.Struct({ /* ... */ });

// New enhancement: runtime helper
FitResult.prototype.toJSON = function() {
  return {
    ...this,
    timestamp: new Date().toISOString(),
    version: '0.2.3-dev'
  };
};