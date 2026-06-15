export type RagDocument = {
  id: string;
  uri: string;
  sourceType: "repo_doc" | "user_doc" | "code";
  updatedAt: string;
  content: string;
};

export type RagChunk = {
  id: string;
  sourceId: string;
  uri: string;
  sourceType: string;
  updatedAt: string;
  content: string;
};
