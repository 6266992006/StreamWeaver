// One place for the backend address. Override it without touching code by
// creating StreamWeaver-frontend/.env with:  VITE_API_URL=http://localhost:5000
export const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');
