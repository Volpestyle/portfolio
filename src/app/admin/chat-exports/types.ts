export type ChatExport = {
  key: string;
  bucket: string;
  size?: number;
  lastModified?: string;
  downloadUrl?: string;
};

export type ChatLogMetadata = {
  filename: string;
  s3Key: string;
  timestamp: string;
  sessionId: string;
  messageCount: number;
  tags: string[];
  size: number;
};

export type CombinedExport = ChatExport & {
  metadata?: ChatLogMetadata;
};
