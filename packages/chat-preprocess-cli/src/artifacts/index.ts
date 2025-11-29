import type { ArtifactWriterConfig } from '../types';
import type { ArtifactWriter } from './types';
import { createLocalArtifactWriter } from './localWriter';
import { createS3ArtifactWriter } from './s3Writer';

export function buildArtifactWriters(configs: ArtifactWriterConfig[] | undefined): ArtifactWriter[] {
  const writers: ArtifactWriter[] = [createLocalArtifactWriter()];
  for (const config of configs ?? []) {
    if (config.type === 's3') {
      writers.push(createS3ArtifactWriter(config));
    }
  }
  return writers;
}
