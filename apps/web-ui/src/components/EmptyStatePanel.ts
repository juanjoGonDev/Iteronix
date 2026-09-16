import {
  Component,
  createElement,
  type ComponentProps,
} from "../shared/Component.js";

interface EmptyStatePanelProps extends ComponentProps {
  icon: string;
  title: string;
  description: string;
  className?: string;
}

export class EmptyStatePanel extends Component<EmptyStatePanelProps> {
  override render(): HTMLElement {
    const { icon, title, description, className = "" } = this.props;

    return createElement(
      "section",
      {
        className: `flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-dark bg-background-dark/40 px-6 py-10 text-center ${className}`,
      },
      [
        createElement(
          "span",
          {
            className: "material-symbols-outlined text-3xl text-text-secondary",
          },
          [icon],
        ),
        createElement(
          "h2",
          { className: "text-base font-semibold text-white" },
          [title],
        ),
        createElement(
          "p",
          { className: "max-w-md text-sm text-text-secondary" },
          [description],
        ),
      ],
    );
  }
}
