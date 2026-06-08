import { Component, createElement, ComponentProps } from '../shared/Component';
import { css } from '../shared/tokens';
import { Button, IconButton } from './Button';
import { Avatar } from './Card';
import { Breadcrumb } from './Navigation';

interface HeaderActions {
  status?: {
    api?: string;
    runners?: string;
  };
  cost?: {
    provider?: string;
    amount: string;
  };
  notifications?: {
    unread: number;
    onClick: () => void;
  };
  primary?: {
    icon: string;
    label: string;
    onClick: () => void;
  };
}

interface User {
  name: string;
  email?: string;
  avatar?: string | null;
}

interface HeaderProps extends ComponentProps {
  title?: string | null;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  actions?: HeaderActions;
  user?: User | null;
  className?: string;
}

interface MainLayoutProps extends ComponentProps {
  sidebar?: (() => HTMLElement) | HTMLElement | null;
  header?: (() => unknown) | unknown | null;
  children?: unknown;
  className?: string;
  sidebarCollapsed?: boolean;
}

export class Header extends Component<HeaderProps> {
  override render(): HTMLElement {
    const { 
      title = null,
      breadcrumbs = [],
      actions = {},
      className = ''
    } = this.props;

    return createElement('header', {
      className: `${css.layout.header} ${className}`
    }, [
      // Left side: Breadcrumbs
      createElement('div', { className: 'flex items-center gap-2 text-sm' }, [
        breadcrumbs.length > 0 && createElement(Breadcrumb, { items: breadcrumbs }),
        title && createElement('div', { className: 'flex items-center gap-2' }, [
          createElement('span', { className: 'material-symbols-outlined text-text-secondary' }, ['grid_view']),
          createElement('span', { className: 'text-white font-medium' }, [title])
        ])
      ]),

      // Right side: Actions
      createElement('div', { className: 'flex items-center gap-3' }, [
        // Status Indicators
        actions.status && createElement('div', {
          className: 'flex items-center gap-4 mr-4 px-3 py-1.5 rounded-full bg-surface-dark border border-border-dark'
        }, [
          actions.status.api && createElement('div', { className: 'flex items-center gap-2' }, [
            createElement('div', {
              className: 'size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
            }),
            createElement('span', {
              className: 'text-xs font-medium text-emerald-500'
            }, [actions.status.api])
          ]),
          actions.status.runners && createElement('div', { className: 'flex items-center gap-2' }, [
            createElement('span', {
              className: 'text-xs font-medium text-text-secondary'
            }, ['Runners:']),
            createElement('span', {
              className: 'text-xs font-bold text-white'
            }, [actions.status.runners])
          ])
        ].filter(Boolean)),

        actions.cost && createElement('div', { className: 'flex items-center gap-2' }, [
          createElement('span', { className: 'material-symbols-outlined text-[18px] text-purple-400' }, ['smart_toy']),
          createElement('span', {
            className: 'text-xs font-medium text-text-secondary'
          }, [actions.cost.provider || 'GPT-4o']),
          createElement('span', {
            className: 'font-mono text-xs font-bold text-white group-hover:text-primary transition-colors'
          }, [actions.cost.amount])
        ]),

        // Notifications
        actions.notifications && createElement(IconButton, {
          icon: 'notifications',
          onClick: actions.notifications.onClick
        }),

        // Primary Action
        actions.primary && createElement(Button, {
          variant: 'primary',
          icon: actions.primary.icon,
          onClick: actions.primary.onClick,
          children: actions.primary.label
        }),

        this.props.user && createElement('button', {
          type: 'button',
          className: 'flex items-center gap-2 rounded-xl border border-border-dark bg-surface-dark px-2.5 py-2 text-left transition-colors hover:bg-surface-dark-hover',
          title: this.props.user.name,
          'data-testid': 'header-user-menu'
        }, [
          createElement(Avatar, {
            src: this.props.user.avatar || null,
            name: this.props.user.name,
            size: 'sm'
          }),
          createElement('span', { className: 'hidden max-w-32 truncate text-sm font-medium text-white md:inline' }, [
            this.props.user.name
          ])
        ])
      ])
    ]);
  }
}

export class MainLayout extends Component<MainLayoutProps> {
  override render(): HTMLElement {
    const { 
      sidebar = null,
      header = null,
      children,
      className = '',
      sidebarCollapsed = false
    } = this.props;

      return createElement('div', { className: `w-full h-full flex` }, [
      sidebar && createElement('aside', {
        className: sidebarCollapsed ? css.layout.sidebarCollapsed : css.layout.sidebar,
        'data-testid': 'app-sidebar-shell'
      }, [
        typeof sidebar === 'function' ? sidebar : sidebar
      ]),

      createElement('main', {
        className: `${css.layout.main} ${className}`
      }, [
        header && createElement('div', {
          className: 'h-16 flex-shrink-0'
        }, [
          typeof header === 'function' ? (header as (() => unknown))() : header
        ]),

        createElement('div', {
          className: 'flex-1 overflow-y-auto scrollbar-hide'
        }, [children])
      ])
    ]);
  }


}
