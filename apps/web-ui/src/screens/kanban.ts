import { createScreen } from "./screen.js";

const title = "Kanban";
const description = "Track work items across the workflow board.";
const badges = ["Workflow", "Board"];
const cards = [
  { title: "Columns", description: "IDEAS to DONE workflow overview." },
  { title: "Tasks", description: "Task details and activity timeline." }
];

export const renderKanbanScreen = (): HTMLElement =>
  createScreen({ title, description, badges, cards });
