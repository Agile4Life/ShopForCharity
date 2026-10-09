// Vercel project Root Directory must be the repository root, not frontend/.
// Reads non-secret backend routing config per Production/Preview environment.
import { createVercelConfig } from './deployment/vercel-config.mjs';

export const config = createVercelConfig(process.env);
