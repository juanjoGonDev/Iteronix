import { createScreen } from "./screen.js";

const title = "Runs";
const description = "Launch and monitor agent sessions with live events.";
const badges = ["Streaming", "Sessions"];
const cards = [
  { title: "Active", description: "Currently running sessions will appear here." },
  { title: "History", description: "Completed runs and summaries." }
];

export const renderRunsScreen = (): HTMLElement =>
  createScreen({ title, description, badges, cards });
