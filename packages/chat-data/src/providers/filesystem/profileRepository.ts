import { assertProfileSummary, createProfileProvider } from '../../index';
import type { ProfileRepository } from '../types';

type FilesystemProfileRepositoryOptions = {
  profileFile: unknown;
};

export function createFilesystemProfileRepository(options: FilesystemProfileRepositoryOptions): ProfileRepository {
  const profileSummary = assertProfileSummary(options.profileFile);
  const provider = createProfileProvider(profileSummary);

  return {
    async getProfile() {
      return provider.getProfile();
    },
  };
}
