import { createScreen } from "./screen.js";

const title = "Overview";
const description = "Global snapshot of workspace status and system health.";
const badges = ["Shell", "Baseline"];
const cards = [
  { title: "Providers", description: "Provider registry status and capabilities." },
  { title: "Workspace", description: "Current project root and access policies." }
];

export const renderOverviewScreen = (): HTMLElement =>
  createScreen({ title, description, badges, cards });
