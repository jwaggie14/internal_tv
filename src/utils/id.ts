export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try {
      return crypto.randomUUID()
    } catch (error) {
      // Fallback below if randomUUID is not available at runtime
    }
  }
  const random = Math.random().toString(36).slice(2, 10)
  const timestamp = Date.now().toString(36)
  return `${prefix}-${timestamp}-${random}`
}
