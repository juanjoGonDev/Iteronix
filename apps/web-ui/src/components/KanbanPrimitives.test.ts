import { describe, expect, it } from "vitest";
import {
  readKanbanColumnTitleClassName,
  readKanbanPriorityClassName,
  readKanbanPriorityIcon,
  readKanbanTaskCardClassName
} from "./KanbanPrimitives.js";

describe("KanbanPrimitives", () => {
  it("maps column, task and priority styles through shared helpers", () => {
    expect(readKanbanColumnTitleClassName("qa")).toContain("text-yellow-500");
    expect(readKanbanColumnTitleClassName("done")).toContain("text-emerald-500");
    expect(readKanbanPriorityClassName("high")).toContain("text-red-400");
    expect(readKanbanPriorityIcon("medium")).toBe("remove");
    expect(readKanbanTaskCardClassName("ideas", false)).toContain("border-purple-500/30");
    expect(readKanbanTaskCardClassName("qa", true)).toContain("ring-2 ring-primary/40");
  });

  it("keeps column and card shells centralized outside the screen", () => {
    expect(readKanbanColumnTitleClassName("ideas")).toBe("font-bold text-sm tracking-wide text-[#9dabb9]");
    expect(readKanbanTaskCardClassName("todo", false)).toContain("bg-card-dark rounded-lg p-4");
    expect(readKanbanTaskCardClassName("done", false)).toContain("hover:border-primary/50");
    expect(readKanbanPriorityClassName("low")).toContain("w-6 h-6 rounded-full");
    expect(readKanbanPriorityIcon("high")).toBe("priority_high");
  });
});
