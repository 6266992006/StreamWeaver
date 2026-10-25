import { API_BASE } from '../api/config';

// One place that turns a failed request into a sentence a person can act on.
// `fallback` is used when the server gave no message of its own.
export function describeApiError(err, fallback = 'Something went wrong. Please try again.') {
  const status = err?.response?.status;
  const serverMessage = err?.response?.data?.message;

  if (!err?.response) {
    // Never got an answer: backend down, wrong VITE_API_URL, or CORS/network.
    return `Can't reach the backend at ${API_BASE}. Is it running?`;
  }
  if (status === 401) return serverMessage || 'Your session has expired. Please sign in again.';
  if (status === 403) return serverMessage || "You don't have permission to do that.";
  if (status === 413) return 'That file is too large.';
  if (status === 429) return serverMessage || 'Too many requests. Wait a moment, then try again.';
  if (status >= 500) return serverMessage || 'The server hit an error. Please try again.';
  return serverMessage || fallback;
}

export const isUnauthorized = (err) => err?.response?.status === 401;
