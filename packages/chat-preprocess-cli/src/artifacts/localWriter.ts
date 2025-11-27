import fs from 'node:fs/promises';
import path from 'node:path';
import type { ArtifactWriter } from './types';

export function createLocalArtifactWriter(): ArtifactWriter {
  return {
    name: 'local',
    async write(request) {
      await fs.mkdir(path.dirname(request.absolutePath), { recursive: true });
      const body = typeof request.body === 'string' ? request.body : Buffer.from(request.body);
      await fs.writeFile(request.absolutePath, body);
    },
  };
}
