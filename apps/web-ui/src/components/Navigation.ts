import { Component, createElement, ComponentProps } from "../shared/Component";

interface NavigationItemProps extends ComponentProps {
  icon: string;
  label: string;
  active?: boolean;
  href?: string;
  onClick?: (e: Event) => void;
  badge?: string | number;
  className?: string;
  collapsed?: boolean;
}

export interface NavigationLink {
  icon: string;
  label: string;
  href?: string;
  active?: boolean;
  onClick?: (e: Event) => void;
}

export interface NavigationGroup extends NavigationLink {
  items: ReadonlyArray<NavigationLink>;
}

interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: (e: Event) => void;
}

interface BreadcrumbProps extends ComponentProps {
  items?: BreadcrumbItem[];
  className?: string;
}

interface SidebarProps extends ComponentProps {
  brand?: {
    name: string;
    icon: string;
    version?: string;
  };
  navigation?: ReadonlyArray<NavigationLink | NavigationGroup>;
  user?: {
    name: string;
    avatar?: string | null;
    role?: string;
  } | null;
  onToggle?: () => void;
  collapsed?: boolean;
  className?: string;
}

interface SidebarState {
  collapsed: boolean;
}

class NavigationItem extends Component<NavigationItemProps> {
  override render(): HTMLElement {
    const {
      icon,
      label,
      active = false,
      href = "#",
      onClick,
      badge = null,
      className = "",
      collapsed = false,
    } = this.props;

    const finalClasses = `${readNavigationEntryClassName({
      active,
      collapsed,
    })} ${className}`.trim();

    return createElement(
      "a",
      {
        href,
        className: finalClasses,
        title: collapsed ? label : undefined,
        onClick: onClick
          ? (e: Event) => {
              e.preventDefault();
              onClick(e);
            }
          : undefined,
      },
      [
        createElement(
          "span",
          {
            className: `material-symbols-outlined text-[24px] ${active ? "fill-1" : ""}`,
          },
          [icon],
        ),
        !collapsed &&
          createElement(
            "span",
            {
              className: "flex-1 text-left text-sm font-medium",
            },
            [label],
          ),
        !collapsed &&
          badge &&
          createElement(
            "span",
            {
              className:
                "bg-surface-dark text-white text-xs font-medium px-2 py-0.5 rounded-full border border-border-dark",
            },
            [String(badge)],
          ),
      ],
    );
  }
}

const isNavigationGroup = (
  item: NavigationLink | NavigationGroup,
): item is NavigationGroup => "items" in item;

class NavigationGroupItem extends Component<
  { group: NavigationGroup; collapsed: boolean },
  { expanded: boolean }
> {
  constructor(props: { group: NavigationGroup; collapsed: boolean }) {
    super(props, { expanded: props.group.active ?? false });
  }

  override render(): HTMLElement {
    const { group, collapsed } = this.props;
    const expanded = this.state.expanded;
    const groupId = `navigation-group-${group.label.toLowerCase().replaceAll(" ", "-")}`;

    return createElement("div", { className: "flex flex-col gap-1" }, [
      createElement(
        "button",
        {
          type: "button",
          className: readNavigationGroupToggleClassName(
            group.active ?? false,
            collapsed,
          ),
          onClick: () => this.setState({ expanded: !expanded }),
          "aria-expanded": String(expanded),
          "aria-controls": groupId,
          title: collapsed ? group.label : undefined,
          "data-testid": `navigation-group-${group.label.toLowerCase().replaceAll(" ", "-")}`,
        },
        [
          createElement(
            "span",
            {
              className: `material-symbols-outlined text-[24px] ${group.active ? "fill-1" : ""}`,
              "aria-hidden": "true",
            },
            [group.icon],
          ),
          !collapsed &&
            createElement(
              "span",
              { className: "flex-1 text-left text-sm font-medium" },
              [group.label],
            ),
          !collapsed &&
            createElement(
              "span",
              {
                className: "material-symbols-outlined text-[18px]",
                "aria-hidden": "true",
              },
              [expanded ? "expand_less" : "expand_more"],
            ),
        ],
      ),
      expanded &&
        createElement(
          "div",
          {
            id: groupId,
            className: readNavigationGroupItemsClassName(collapsed),
            "data-testid": `${groupId}-items`,
          },
          group.items.map((item, index) =>
            new NavigationItem({
              key: `group-${index}`,
              ...item,
              collapsed,
            }).render(),
          ),
        ),
    ]);
  }
}

export class Breadcrumb extends Component<BreadcrumbProps> {
  override render(): HTMLElement {
    const { items = [], className = "" } = this.props;

    return createElement(
      "nav",
      {
        className: `flex items-center text-sm ${className}`,
      },
      items
        .map((item: BreadcrumbItem, index: number) => {
          const isLast = index === items.length - 1;
          const itemClasses = isLast
            ? "text-white font-medium"
            : "text-text-secondary hover:text-white transition-colors";

          return [
            createElement(
              "a",
              {
                key: `item-${index}`,
                href: item.href || "#",
                className: itemClasses,
                onClick: item.onClick
                  ? (e: Event) => {
                      e.preventDefault();
                      item.onClick?.(e);
                    }
                  : undefined,
              },
              [item.label],
            ),
            !isLast &&
              createElement(
                "span",
                {
                  key: `separator-${index}`,
                  className:
                    "material-symbols-outlined text-text-secondary text-[16px] mx-2",
                },
                ["chevron_right"],
              ),
          ];
        })
        .flat(),
    );
  }
}

export class Sidebar extends Component<SidebarProps, SidebarState> {
  constructor(props: SidebarProps = {}) {
    super(props, { collapsed: false });
  }

  override render(): HTMLElement {
    const {
      brand = { name: "Iteronix", icon: "terminal", version: null },
      navigation = [],
      onToggle,
      collapsed = false,
      className = "",
    } = this.props;

    return createElement(
      "aside",
      {
        className: readSidebarRootClassName(className),
      },
      [
        // Brand. Expanded: single row (tile, name/version, toggle pushed right).
        // Collapsed: stacked column — the narrow rail must never squeeze two
        // tiles side by side, which read as a broken overlay before.
        createElement(
          "div",
          {
            className: collapsed
              ? "flex flex-col items-center gap-2 px-2 py-3"
              : "flex items-center gap-3 px-4 py-4",
          },
          [
            createElement(
              "div",
              {
                className:
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-primary to-blue-600 text-white shadow-lg shadow-primary/20",
              },
              [
                createElement(
                  "span",
                  { className: "material-symbols-outlined text-[20px]" },
                  [brand.icon],
                ),
              ],
            ),
            !collapsed &&
              createElement("div", { className: "flex min-w-0 flex-col" }, [
                createElement(
                  "span",
                  {
                    className:
                      "truncate font-bold text-lg leading-none tracking-tight text-white",
                  },
                  [brand.name],
                ),
                brand.version &&
                  createElement(
                    "span",
                    {
                      className:
                        "mt-0.5 font-mono text-xs leading-none text-text-secondary",
                    },
                    [brand.version],
                  ),
              ]),
            onToggle &&
              createElement(
                "button",
                {
                  type: "button",
                  onClick: onToggle,
                  className: `flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-dark-hover hover:text-white ${
                    collapsed ? "" : "ml-auto"
                  }`,
                  title: collapsed ? "Expand sidebar" : "Collapse sidebar",
                  "aria-label": collapsed
                    ? "Expand sidebar"
                    : "Collapse sidebar",
                  "aria-expanded": String(!collapsed),
                  "data-testid": "app-sidebar-toggle",
                },
                [
                  createElement(
                    "span",
                    {
                      className: "material-symbols-outlined text-[18px]",
                      "aria-hidden": "true",
                    },
                    [collapsed ? "chevron_right" : "chevron_left"],
                  ),
                ],
              ),
          ],
        ),
        collapsed &&
          createElement("div", {
            className: "mx-3 border-t border-border-dark/60",
            "aria-hidden": "true",
          }),

        createElement(
          "nav",
          {
            className: readSidebarNavigationClassName(collapsed),
          },
          [
            navigation.map(
              (item: NavigationLink | NavigationGroup, index: number) => {
                if (isNavigationGroup(item)) {
                  const navigationGroupItem = new NavigationGroupItem({
                    group: item,
                    collapsed,
                  });
                  const rendered = navigationGroupItem.render();
                  navigationGroupItem.element = rendered;
                  return rendered;
                }
                const navItem = new NavigationItem({
                  key: `nav-${index}`,
                  ...item,
                  collapsed,
                });
                return navItem.render();
              },
            ),
          ],
        ),
      ],
    );
  }

  // Method to toggle collapse state
  toggle(): void {
    this.setState({ collapsed: !this.state.collapsed });
  }
}

export const readSidebarRootClassName = (className: string): string =>
  `flex h-full min-h-0 flex-col overflow-hidden ${className}`.trim();

/**
 * The navigation column centers a uniform stack of 40px tiles when collapsed,
 * matching the icon-rail pattern n8n/Dify users already know; expanded mode
 * keeps full-width rows with an indent-safe rhythm.
 */
export const readSidebarNavigationClassName = (collapsed: boolean): string =>
  `flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain ${
    collapsed ? "px-2 py-3" : "px-3 py-4"
  }`;

/**
 * Single source of truth for a nav row (plain item or group header). Active
 * rows use a soft fill plus an inset ring so highlight and geometry never
 * shift between states; collapsed rows become identical centered squares.
 */
export const readNavigationEntryClassName = (input: {
  active: boolean;
  collapsed: boolean;
}): string => {
  const tone = input.active
    ? "bg-primary/12 text-white ring-1 ring-inset ring-primary/25"
    : "text-text-secondary hover:bg-surface-dark-hover hover:text-white";
  const shape = input.collapsed
    ? "mx-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
    : "flex w-full items-center gap-3 rounded-lg px-3 py-2.5";
  return `${shape} ${tone} transition-colors`;
};

export const readNavigationGroupToggleClassName = (
  active: boolean,
  collapsed = false,
): string =>
  [
    readNavigationEntryClassName({ active, collapsed }),
    collapsed ? "" : "text-left",
  ]
    .filter(Boolean)
    .join(" ");

export const readNavigationGroupItemsClassName = (collapsed: boolean): string =>
  `flex flex-col gap-1 ${collapsed ? "items-center" : "pl-4"}`;
