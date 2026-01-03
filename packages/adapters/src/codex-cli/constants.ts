export const CodexCliProviderId = "codex-cli";
export const CodexCliProviderDisplayName = "Codex CLI";
export const CodexCliDefaultCommand = "codex";

export const CodexCliPromptMode = {
  Stdin: "stdin",
  Arg: "arg"
} as const;

export type CodexCliPromptMode =
  typeof CodexCliPromptMode[keyof typeof CodexCliPromptMode];