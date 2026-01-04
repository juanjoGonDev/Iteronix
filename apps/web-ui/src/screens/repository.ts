import { createScreen } from "./screen.js";

const title = "Repository";
const description = "Browse files and inspect repository activity.";
const badges = ["Explorer", "Read-only"];
const cards = [
  { title: "Tree", description: "Repository tree and file navigation." },
  { title: "Editor", description: "Code preview and diff details." }
];

export const renderRepositoryScreen = (): HTMLElement =>
  createScreen({ title, description, badges, cards });
