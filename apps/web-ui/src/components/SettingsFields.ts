import { StatusBadge } from "./Card.js";
import {
  Component,
  createElement,
  type ComponentProps,
} from "../shared/Component.js";

interface SettingsFieldProps extends ComponentProps {
  label: string;
  children?: unknown;
  className?: string;
}

interface SettingsTextFieldProps extends ComponentProps {
  label: string;
  value: string;
  placeholder: string;
  testId: string;
  type?: "text" | "password";
  onChange: (value: string) => void;
}

interface SettingsNumberFieldProps extends ComponentProps {
  label: string;
  value: number;
  disabled?: boolean;
  testId: string;
  onChange: (value: string) => void;
}

interface SettingsDateTimeFieldProps extends ComponentProps {
  label: string;
  value: string;
  disabled: boolean;
  testId: string;
  onChange: (value: string) => void;
}

interface SettingsSelectFieldOption {
  value: string;
  label: string;
}

interface SettingsSelectFieldProps extends ComponentProps {
  label: string;
  value: string;
  testId: string;
  options: ReadonlyArray<SettingsSelectFieldOption>;
  onChange: (value: string) => void;
}

interface SettingsSecretFieldProps extends ComponentProps {
  label: string;
  value: string;
  placeholder: string;
  testId: string;
  onChange: (value: string) => void;
}

interface SettingsTextareaFieldProps extends ComponentProps {
  label: string;
  value: string;
  placeholder: string;
  testId: string;
  rows?: number;
  hint?: string | null;
  onChange: (value: string) => void;
}

export interface JsonContractState {
  valid: boolean;
  message: string;
}

/**
 * Single owner of the "JSON contract field" rule shared by every asset form:
 * the text must parse, be an object, and (optionally) satisfy a schema check.
 */
export const readJsonContractState = (
  value: string,
  input: {
    required: boolean;
    /** Returns an error message or null for an additional structural check. */
    validate?: (parsed: Record<string, unknown>) => string | null;
  },
): JsonContractState => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return input.required
      ? { valid: false, message: "Required: paste a JSON object." }
      : {
          valid: true,
          message: "Empty: the server keeps its default contract.",
        };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return {
      valid: false,
      message: `Invalid JSON: ${error instanceof Error ? error.message : "could not parse"}`,
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, message: "Must be a JSON object." };
  }
  const schemaError = input.validate?.(parsed as Record<string, unknown>);
  return schemaError
    ? { valid: false, message: schemaError }
    : { valid: true, message: "Valid JSON object." };
};

/** Structural check for the versioned JSON-schema contracts the server accepts. */
export const readSchemaContractError = (
  parsed: Record<string, unknown>,
): string | null => {
  const type = parsed["type"];
  return type === "array" ||
    type === "boolean" ||
    type === "number" ||
    type === "object" ||
    type === "string"
    ? null
    : 'A root "type" of array, boolean, number, object, or string is required.';
};

interface SettingsToggleFieldProps extends ComponentProps {
  label: string;
  description: string;
  checked: boolean;
  testId: string;
  onChange: (checked: boolean) => void;
}

interface SettingsCheckboxGroupOption<TValue extends string> {
  value: TValue;
  label: string;
  description: string;
}

export interface SettingsCheckboxGroupProps<
  TValue extends string,
> extends ComponentProps {
  label: string;
  description: string;
  values: ReadonlyArray<TValue>;
  options: ReadonlyArray<SettingsCheckboxGroupOption<TValue>>;
  testId: string;
  onChange: (value: TValue, checked: boolean) => void;
}

class SettingsField extends Component<SettingsFieldProps> {
  override render(): HTMLElement {
    const { label, children, className = "" } = this.props;

    return createElement(
      "label",
      {
        className: joinClasses("flex flex-col gap-2", className),
      },
      [
        createElement(
          "span",
          { className: "text-[13px] font-medium text-slate-100" },
          [label],
        ),
        children,
      ],
    );
  }
}

export class SettingsTextField extends Component<SettingsTextFieldProps> {
  override render(): HTMLElement {
    const {
      label,
      value,
      placeholder,
      testId,
      type = "text",
      onChange,
    } = this.props;

    return createElement(SettingsField, {
      label,
      children: createElement("input", {
        type,
        value,
        placeholder,
        "data-testid": testId,
        className: readSettingsInputClassName(),
        onChange: (event: Event) => {
          const target = event.target;
          if (target instanceof HTMLInputElement) {
            onChange(target.value);
          }
        },
      }),
    });
  }
}

export class SettingsNumberField extends Component<SettingsNumberFieldProps> {
  override render(): HTMLElement {
    const { label, value, disabled = false, testId, onChange } = this.props;

    return createElement(SettingsField, {
      label,
      children: createElement("input", {
        type: "number",
        value: value.toString(),
        disabled,
        "data-testid": testId,
        className: `${readSettingsInputClassName()} disabled:opacity-50`,
        onChange: (event: Event) => {
          const target = event.target;
          if (target instanceof HTMLInputElement) {
            onChange(target.value);
          }
        },
      }),
    });
  }
}

export class SettingsDateTimeField extends Component<SettingsDateTimeFieldProps> {
  override render(): HTMLElement {
    const { label, value, disabled, testId, onChange } = this.props;

    return createElement(SettingsField, {
      label,
      children: createElement("input", {
        type: "datetime-local",
        value,
        disabled,
        "data-testid": testId,
        className: `${readSettingsInputClassName()} disabled:cursor-not-allowed disabled:opacity-50`,
        onChange: (event: Event) => {
          const target = event.target;
          if (target instanceof HTMLInputElement) {
            onChange(target.value);
          }
        },
      }),
    });
  }
}

export class SettingsSelectField extends Component<SettingsSelectFieldProps> {
  override render(): HTMLElement {
    const { label, value, testId, options, onChange } = this.props;

    return createElement(SettingsField, {
      label,
      children: createElement(
        "select",
        {
          value,
          "data-testid": testId,
          className: readSettingsSelectClassName(),
          onChange: (event: Event) => {
            const target = event.target;
            if (target instanceof HTMLSelectElement) {
              onChange(target.value);
            }
          },
        },
        options.map((option) =>
          createElement(
            "option",
            {
              value: option.value,
              selected: option.value === value,
            },
            [option.label],
          ),
        ),
      ),
    });
  }
}

export class SettingsSecretField extends Component<SettingsSecretFieldProps> {
  override render(): HTMLElement {
    const { label, value, placeholder, testId, onChange } = this.props;

    return createElement("label", { className: "flex flex-col gap-2" }, [
      createElement(
        "div",
        { className: "flex items-center justify-between gap-3" },
        [
          createElement(
            "span",
            { className: "text-[13px] font-medium text-slate-100" },
            [label],
          ),
          createElement(StatusBadge, { status: "warning" }, ["session only"]),
        ],
      ),
      createElement("input", {
        type: "password",
        value,
        placeholder,
        "data-testid": testId,
        className: readSettingsInputClassName(),
        onChange: (event: Event) => {
          const target = event.target;
          if (target instanceof HTMLInputElement) {
            onChange(target.value);
          }
        },
      }),
      createElement("span", { className: "text-xs text-text-secondary" }, [
        "The browser keeps this key only in memory for the current session.",
      ]),
    ]);
  }
}

export class SettingsTextareaField extends Component<SettingsTextareaFieldProps> {
  override render(): HTMLElement {
    const {
      label,
      value,
      placeholder,
      testId,
      rows = 4,
      hint = null,
      onChange,
    } = this.props;

    return createElement(SettingsField, {
      label,
      children: createElement("div", { className: "flex flex-col gap-1" }, [
        createElement("textarea", {
          value,
          rows,
          placeholder,
          spellcheck: "false",
          "data-testid": testId,
          className: `${readSettingsInputClassName()} font-mono leading-6`,
          onChange: (event: Event) => {
            const target = event.target;
            if (target instanceof HTMLTextAreaElement) {
              onChange(target.value);
            }
          },
        }),
        hint
          ? createElement(
              "span",
              { className: "text-xs text-text-secondary" },
              [hint],
            )
          : "",
      ]),
    });
  }
}

export class SettingsJsonField extends Component<
  SettingsTextareaFieldProps & {
    contractState: JsonContractState;
  }
> {
  override render(): HTMLElement {
    const {
      label,
      value,
      placeholder,
      testId,
      rows = 6,
      hint = null,
      contractState,
      onChange,
    } = this.props;

    return createElement(SettingsField, {
      label,
      children: createElement("div", { className: "flex flex-col gap-1" }, [
        createElement("textarea", {
          value,
          rows,
          placeholder,
          spellcheck: "false",
          "data-testid": testId,
          "aria-invalid": String(!contractState.valid),
          className: joinClasses(
            readSettingsInputClassName(),
            "font-mono leading-6",
            contractState.valid
              ? ""
              : "border-rose-500/60 focus:border-rose-400 focus:ring-rose-400",
          ),
          onChange: (event: Event) => {
            const target = event.target;
            if (target instanceof HTMLTextAreaElement) {
              onChange(target.value);
            }
          },
        }),
        createElement(
          "span",
          {
            className: joinClasses(
              "text-xs",
              contractState.valid ? "text-emerald-400" : "text-rose-300",
            ),
            role: "status",
            "aria-live": "polite",
            "data-testid": `${testId}-state`,
          },
          [contractState.message],
        ),
        hint
          ? createElement(
              "span",
              { className: "text-xs text-text-secondary" },
              [hint],
            )
          : "",
      ]),
    });
  }
}

export class SettingsToggleField extends Component<SettingsToggleFieldProps> {
  override render(): HTMLElement {
    const { label, description, checked, testId, onChange } = this.props;

    return createElement(
      "div",
      {
        className:
          "flex items-center justify-between gap-4 rounded-xl border border-[#2b3644] bg-[#1a2129] px-4 py-4",
      },
      [
        createElement("div", { className: "flex min-w-0 flex-col gap-1" }, [
          createElement(
            "span",
            { className: "text-sm font-medium text-white" },
            [label],
          ),
          createElement("span", { className: "text-xs text-text-secondary" }, [
            description,
          ]),
        ]),
        createElement(
          "button",
          {
            type: "button",
            role: "switch",
            "aria-checked": String(checked),
            "data-testid": testId,
            className: readSettingsToggleTrackClassName(checked),
            onClick: () => onChange(!checked),
          },
          [
            createElement("span", {
              className: readSettingsToggleKnobClassName(checked),
            }),
          ],
        ),
      ],
    );
  }
}

export class SettingsCheckboxGroup<
  TValue extends string = string,
> extends Component<SettingsCheckboxGroupProps<TValue>> {
  override render(): HTMLElement {
    const { label, description, values, options, testId, onChange } =
      this.props;
    const selectedValues = new Set(values);
    const descriptionId = `${testId}-description`;

    return createElement("fieldset", { className: "flex flex-col gap-3" }, [
      createElement(
        "legend",
        { className: "text-[13px] font-medium text-slate-100" },
        [label],
      ),
      createElement(
        "p",
        { id: descriptionId, className: "text-xs text-text-secondary" },
        [description],
      ),
      createElement(
        "div",
        {
          role: "group",
          "aria-describedby": descriptionId,
          className: "grid gap-2 sm:grid-cols-2 xl:grid-cols-3",
        },
        options.map((option) =>
          createElement(
            "label",
            {
              className:
                "flex min-h-20 cursor-pointer items-start gap-3 rounded-lg border border-[#2b3644] bg-[#1a2129] px-3 py-3 transition-colors hover:border-[#4a5c70] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/70",
            },
            [
              createElement("input", {
                type: "checkbox",
                value: option.value,
                checked: selectedValues.has(option.value),
                "data-testid": `${testId}-${readCheckboxTestIdSuffix(option.value)}`,
                className:
                  "mt-0.5 h-4 w-4 shrink-0 accent-primary focus-visible:outline-none",
                onChange: (event: Event) => {
                  const target = event.target;
                  if (target instanceof HTMLInputElement) {
                    onChange(option.value, target.checked);
                  }
                },
              }),
              createElement("span", { className: "flex flex-col gap-1" }, [
                createElement(
                  "span",
                  { className: "text-sm font-medium text-white" },
                  [option.label],
                ),
                createElement(
                  "span",
                  { className: "text-xs leading-5 text-text-secondary" },
                  [option.description],
                ),
              ]),
            ],
          ),
        ),
      ),
    ]);
  }
}

const readSettingsInputClassName = (): string =>
  "min-h-11 w-full rounded-xl border border-[#2b3644] bg-[#1a2129] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

const readSettingsSelectClassName = (): string =>
  "min-h-11 w-full rounded-xl border border-[#2b3644] bg-[#1a2129] px-3.5 py-2.5 text-sm text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export const readSettingsToggleTrackClassName = (checked: boolean): string =>
  joinClasses(
    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40",
    checked ? "border-primary bg-primary" : "border-[#3a4655] bg-[#2b3644]",
  );

export const readSettingsToggleKnobClassName = (checked: boolean): string =>
  joinClasses(
    "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
    checked ? "translate-x-5" : "translate-x-0.5",
  );

const readCheckboxTestIdSuffix = (value: string): string =>
  value.replaceAll(".", "-");

const joinClasses = (...values: ReadonlyArray<string>): string =>
  values
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .join(" ");
