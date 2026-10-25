// Backend returns { id | _id, name, email, role }. Anything unknown is an analyst.
export const normalizeUser = (raw) =>
  raw
    ? {
        id: raw.id || raw._id || null,
        name: raw.name || '',
        email: raw.email || '',
        role: raw.role === 'admin' ? 'admin' : 'analyst',
      }
    : null;
