/**
 * Where the FastAPI service lives.
 *
 * Set `NEXT_PUBLIC_API_URL` (see `.env.example`) when the API isn't on the
 * default local port. Read at build time, so it must be a `NEXT_PUBLIC_*` var.
 */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
).replace(/\/+$/, '');
