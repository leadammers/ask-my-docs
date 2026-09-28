/** Text of one page; non-paginated sources are a single page 1. */
export type PageText = { page: number; text: string };

export type Chunk = {
  ordinal: number;
  content: string;
  pageFrom: number;
  pageTo: number;
  tokenCount: number;
};
