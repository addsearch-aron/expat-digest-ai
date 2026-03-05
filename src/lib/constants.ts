export const TOPICS = [
  "Housing",
  "Public Transport",
  "Immigration / Visas",
  "Safety",
  "Healthcare",
  "Local Events",
  "Economy",
  "Education",
] as const;

export type Topic = typeof TOPICS[number];

export const LANGUAGES = [
  "English",
  "French",
  "German",
  "Spanish",
  "Portuguese",
  "Italian",
  "Dutch",
  "Polish",
  "Turkish",
  "Arabic",
  "Chinese",
  "Japanese",
  "Korean",
  "Russian",
  "Hindi",
] as const;
