import { createScreen } from "./screen.js";

const title = "Settings";
const description = "Manage provider settings and project configuration.";
const badges = ["Profiles", "Policies"];
const cards = [
  { title: "Providers", description: "Model selection and precision options." },
  { title: "Security", description: "Tokens and workspace access policies." }
];

export const renderSettingsScreen = (): HTMLElement =>
  createScreen({ title, description, badges, cards });
