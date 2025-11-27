import path from 'node:path';
import type { ArtifactWriter } from './types';
import type { ArtifactManager, ArtifactWriteResult } from '../types';

type CreateArtifactManagerOptions = {
  writers: ArtifactWriter[];
  rootDir: string;
};

export function createArtifactManager(options: CreateArtifactManagerOptions): ArtifactManager {
  const { writers, rootDir } = options;

  async function writeJson({
    id,
    filePath,
    data,
  }: {
    id: string;
    filePath: string;
    data: unknown;
  }): Promise<ArtifactWriteResult> {
    const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const relativePath = path.relative(rootDir, filePath);
    await Promise.all(
      writers.map((writer) =>
        writer.write({
          id,
          absolutePath: filePath,
          relativePath,
          contentType: 'application/json',
          body: json,
        })
      )
    );
    return { id, absolutePath: filePath, relativePath };
  }

  return {
    writeJson,
  };
}
