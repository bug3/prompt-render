import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const fixture = (name: string): string => path.join(here, 'fixtures', name);
