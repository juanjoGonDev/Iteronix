import { createScreen } from "./screen.js";

const title = "Projects";
const description = "Create, open, and manage project workspaces.";
const badges = ["Workspace", "Routes"];
const cards = [
  { title: "Recent", description: "Recent projects will appear here once connected." },
  { title: "Templates", description: "Reusable project setups for faster onboarding." }
];

export const renderProjectsScreen = (): HTMLElement =>
  createScreen({ title, description, badges, cards });
