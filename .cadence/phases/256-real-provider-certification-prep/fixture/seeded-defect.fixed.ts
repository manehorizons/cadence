export function buildHeaders(): Record<string, string> {
  const token = process.env.API_TOKEN;
  if (!token) {
    throw new Error('API_TOKEN environment variable is required');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}
