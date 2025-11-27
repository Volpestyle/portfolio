export type ArtifactWriteRequest = {
  id: string;
  absolutePath: string;
  relativePath: string;
  contentType: string;
  body: string | Buffer;
};

export type ArtifactWriter = {
  name: string;
  write: (request: ArtifactWriteRequest) => Promise<void>;
};
