export const TOPICS = [
  "Immigration",
  "Taxes",
  "Housing",
  "Healthcare",
  "Education",
  "Transport",
  "Safety",
  "Politics",
  "Business",
  "Economy",
  "Events",
  "Weather",
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
