export function buildHeaders(): Record<string, string> {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer 7f3ac9e21b6d4f8aa0c5e2d918b6a4f0c3e7b9a1',
  };
  console.log('buildHeaders', headers);
  return headers;
}
