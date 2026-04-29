import { Component, createElement, ComponentProps } from '../shared/Component';
import { css } from '../shared/tokens';

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
  navigation?: Array<{
    icon: string;
    label: string;
    href?: string;
    active?: boolean;
    onClick?: (e: Event) => void;
  }>;
  user?: {
    name: string;
    avatar?: string | null;
    role?: string;
  } | null;
  project?: {
    label: string;
    rootPath: string | null;
  } | null;
  onProjectClick?: () => void;
  onToggle?: () => void;
  collapsed?: boolean;
  className?: string;
}

interface SidebarState {
  collapsed: boolean;
}

export class NavigationItem extends Component<NavigationItemProps> {
  override render(): HTMLElement {
    const { 
      icon,
      label,
      active = false,
      href = '#',
      onClick,
      badge = null,
      className = '',
      collapsed = false
    } = this.props;

    const baseClasses = css.navItem.default;
    const activeClasses = active ? css.navItem.active : '';
    const finalClasses = `${baseClasses} ${activeClasses} ${className}`;

    return createElement('a', {
      href,
      className: finalClasses,
      onClick: onClick ? (e: Event) => {
        e.preventDefault();
        onClick(e);
      } : undefined
    }, [
      createElement('span', { 
        className: `material-symbols-outlined text-[24px] ${active ? 'fill-1' : ''}` 
      }, [icon]),
      !collapsed && createElement('span', { 
        className: 'text-sm font-medium' 
      }, [label]),
      !collapsed && badge && createElement('span', {
        className: 'bg-surface-dark text-white text-xs font-medium px-2 py-0.5 rounded-full border border-border-dark'
      }, [String(badge)])
    ]);
  }
}

export class Breadcrumb extends Component<BreadcrumbProps> {
  override render(): HTMLElement {
    const { items = [], className = '' } = this.props;

    return createElement('nav', { 
      className: `flex items-center text-sm ${className}` 
    }, 
      items.map((item: BreadcrumbItem, index: number) => {
        const isLast = index === items.length - 1;
        const itemClasses = isLast ? 'text-white font-medium' : 'text-text-secondary hover:text-white transition-colors';
        
        return [
          createElement('a', {
            key: `item-${index}`,
            href: item.href || '#',
            className: itemClasses,
          onClick: item.onClick ? (e: Event) => {
            e.preventDefault();
            item.onClick?.(e);
          } : undefined
          }, [item.label]),
          !isLast && createElement('span', {
            key: `separator-${index}`,
            className: 'material-symbols-outlined text-text-secondary text-[16px] mx-2'
          }, ['chevron_right'])
        ];
      }).flat()
    );
  }
}

export class Sidebar extends Component<SidebarProps, SidebarState> {
  constructor(props: SidebarProps = {}) {
    super(props, { collapsed: false });
  }

  override render(): HTMLElement {
    const { 
      brand = { name: 'Iteronix', icon: 'terminal', version: null },
      navigation = [],
      project = null,
      onProjectClick,
      onToggle,
      collapsed = false,
      className = ''
    } = this.props;

    return createElement('aside', {
      className: readSidebarRootClassName(className)
    }, [
      // Brand
      createElement('div', { 
        className: collapsed ? 'p-3 flex flex-col gap-1' : 'p-4 flex flex-col gap-1'
      }, [
        createElement('div', { 
          className: `flex items-center ${collapsed ? 'justify-center' : 'gap-3 px-2'}`
        }, [
          createElement('div', {
            className: 'w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-primary/20 shrink-0'
          }, [
            createElement('span', { className: 'material-symbols-outlined text-[20px]' }, [brand.icon])
          ]),
          !collapsed && createElement('div', { className: 'flex flex-col' }, [
            createElement('span', {
              className: 'font-bold text-lg tracking-tight leading-none text-white'
            }, [brand.name]),
            brand.version && createElement('span', {
              className: 'text-xs text-text-secondary font-mono mt-0.5'
            }, [brand.version])
          ]),
          onToggle && createElement('button', {
            onClick: onToggle,
            className: `${collapsed ? '' : 'ml-auto'} p-1 rounded hover:bg-surface-dark-hover text-text-secondary hover:text-white transition-all duration-300`,
            title: collapsed ? 'Expand sidebar' : 'Collapse sidebar',
            'data-testid': 'app-sidebar-toggle'
          }, [
            createElement('span', {
              className: 'material-symbols-outlined text-[18px] transition-all duration-300'
            }, [collapsed ? 'arrow_forward_ios' : 'arrow_back_ios'])
          ])
        ])
      ]),

      createElement('nav', { 
        className: readSidebarNavigationClassName(collapsed)
      }, [
        navigation.map((item: NavigationItemProps, index: number) => {
          const navItem = new NavigationItem({
            key: `nav-${index}`,
            ...item,
            collapsed,
            className: collapsed ? 'justify-center' : ''
          });
          return navItem.render();
        })
      ]),

      createElement('div', {
        className: `${collapsed ? 'p-3' : 'p-4'} border-t border-border-dark`
      }, [
        renderProjectButton({ project, collapsed, onProjectClick })
      ])
    ]);
  }

  // Method to toggle collapse state
  toggle(): void {
    this.setState({ collapsed: !this.state.collapsed });
  }


}

export const readSidebarRootClassName = (className: string): string =>
  `flex h-full min-h-0 flex-col overflow-hidden ${className}`.trim();

export const readSidebarNavigationClassName = (collapsed: boolean): string =>
  `min-h-0 flex-1 overflow-y-auto overscroll-contain ${collapsed ? 'py-4 px-1' : 'py-6 px-3'} flex flex-col gap-1`;

const renderProjectButton = (input: {
  project: {
    label: string;
    rootPath: string | null;
  } | null;
  collapsed: boolean;
  onProjectClick: (() => void) | undefined;
}): HTMLElement =>
  createElement('button', {
    type: 'button',
    className: `flex w-full items-center rounded-xl border border-border-dark bg-surface-dark/60 transition-colors hover:bg-surface-dark-hover ${
      input.collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-3 text-left'
    }`,
    'data-testid': 'sidebar-project-button',
    onClick: input.onProjectClick
  }, [
    createElement('span', {
      className: `material-symbols-outlined shrink-0 text-[20px] ${
        input.project ? 'text-primary' : 'text-text-secondary'
      }`
    }, [input.project ? 'folder_open' : 'folder']),
    !input.collapsed && createElement('div', {
      className: 'flex min-w-0 flex-1 flex-col'
    }, [
      createElement('span', {
        className: 'text-xs font-semibold uppercase tracking-wide text-text-secondary'
      }, [input.project ? 'Active project' : 'Project']),
      createElement('span', {
        className: 'truncate text-sm font-medium text-white',
        'data-testid': 'sidebar-project-label'
      }, [input.project?.label ?? 'Select project']),
      createElement('span', {
        className: 'truncate text-xs text-text-secondary'
      }, [input.project?.rootPath ?? (input.project ? 'Workflow-only project' : 'Open or create a project')])
    ]),
    !input.collapsed && createElement('span', {
      className: 'material-symbols-outlined ml-auto text-[18px] text-text-secondary'
    }, ['chevron_right'])
  ]);
