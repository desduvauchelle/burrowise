export type RouteId =
  | "home"
  | "capture"
  | "knowledge"
  | "search"
  | "library"
  | "notes"
  | "review"
  | "chat"
  | "interviews"
  | "studio"
  | "tags"
  | "settings";

export interface FocusRequest {
  kind: string;
  recordId: string | null;
  relativePath: string | null;
  token: number;
}

export interface RetrievalSettings {
  searchResultLimit: number;
  chatChunkLimit: number;
  interviewChunkLimit: number;
  studioChunkLimit: number;
  answerMode: string;
}

export type ThemePreference = "light" | "dark" | "system";
export type DensityPreference = "compact" | "comfortable" | "spacious";
