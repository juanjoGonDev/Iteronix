import { Component, createElement, ComponentProps } from '../shared/Component';
import { css } from '../shared/tokens';
import { Avatar } from './Card';

interface NavigationItemProps extends ComponentProps {
  icon: string;
  label: string;
  active?: boolean;
  href?: string;
  onClick?: (e: Event) => void;
  badge?: string | number;
  className?: string;
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
      className = ''
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
      createElement('span', { 
        className: 'text-sm font-medium' 
      }, [label]),
      badge && createElement('span', {
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
      user = null,
      onToggle,
      collapsed = false,
      className = ''
    } = this.props;

    return createElement('aside', {
      className: `${css.layout.sidebar} ${collapsed ? 'w-20' : 'w-64'} ${className}`
    }, [
      // Brand
      createElement('div', { className: 'p-4 flex flex-col gap-1' }, [
        createElement('div', { className: 'flex items-center gap-3 px-2' }, [
          createElement('div', {
            className: 'w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-primary/20'
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
            className: 'ml-auto p-1 rounded hover:bg-surface-dark-hover text-text-secondary hover:text-white transition-colors'
          }, [
            createElement('span', { 
              className: `material-symbols-outlined text-[18px] transition-transform ${collapsed ? 'rotate-180' : ''}` 
            }, ['menu_open'])
          ])
        ])
      ]),

      // Navigation
      createElement('nav', { className: 'flex flex-1 overflow-y-auto py-6 px-3 flex flex-col gap-1' }, [
        navigation.map((item: NavigationItemProps, index: number) => {
          const navItem = new NavigationItem({
            key: `nav-${index}`,
            ...item,
            className: collapsed ? 'justify-center' : ''
          });
          return navItem.render();
        })
      ]),

      // User Profile
      user && createElement('div', { className: 'p-4 border-t border-border-dark' }, [
        createElement('div', {
          className: 'flex items-center gap-3 p-2 rounded-lg hover:bg-surface-dark-hover cursor-pointer transition-colors'
        }, [
          createElement(Avatar, {
            src: user.avatar || null,
            name: user.name,
            size: 'sm'
          }),
          !collapsed && createElement('div', { className: 'flex flex-col overflow-hidden' }, [
            createElement('span', {
              className: 'text-sm font-medium truncate text-white'
            }, [user.name]),
            user.role && createElement('span', {
              className: 'text-xs text-text-secondary truncate'
            }, [user.role])
          ]),
          !collapsed && createElement('span', {
            className: 'material-symbols-outlined text-text-secondary ml-auto text-[18px]'
          }, ['unfold_more'])
        ])
      ])
    ]);
  }

  // Method to toggle collapse state
  toggle(): void {
    this.setState({ collapsed: !this.state.collapsed });
  }


}