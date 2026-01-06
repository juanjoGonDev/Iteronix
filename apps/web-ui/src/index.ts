import { Component, createElement, ComponentProps } from './shared/Component';
import { MainLayout } from './components/Layout';
import { Sidebar } from './components/Navigation';
import { ROUTES, APP_VERSION } from './shared/constants';

// Import screens
import { DashboardScreen } from './screens/Dashboard';
import { SettingsScreen } from './screens/Settings';

interface AppState {
  currentScreen: string;
  sidebarCollapsed: boolean;
}

interface AppProps extends ComponentProps {
  [key: string]: unknown;
}

export class App extends Component<AppProps, AppState> {
  constructor(props: AppProps) {
    super(props, {
      currentScreen: 'overview',
      sidebarCollapsed: false
    });
  }

  override   render(): HTMLElement {
    const { currentScreen } = this.state;

    // Navigation configuration
    const navigation = [
      {
        icon: 'dashboard',
        label: 'Overview',
        href: ROUTES.OVERVIEW,
        active: currentScreen === 'overview',
        onClick: () => this.setState({ currentScreen: 'overview' })
      },
      {
        icon: 'folder_open',
        label: 'Projects',
        href: ROUTES.PROJECTS,
        active: currentScreen === 'projects',
        onClick: () => this.setState({ currentScreen: 'projects' })
      },
      {
        icon: 'account_tree',
        label: 'Workflows',
        href: ROUTES.WORKFLOWS,
        active: currentScreen === 'workflows',
        onClick: () => this.setState({ currentScreen: 'workflows' })
      },
      {
        icon: 'history',
        label: 'History',
        href: ROUTES.HISTORY,
        active: currentScreen === 'history',
        onClick: () => this.setState({ currentScreen: 'history' })
      }
    ];

    // Brand configuration
    const brand = {
      name: 'Iteronix',
      icon: 'terminal',
      version: `v${APP_VERSION} (Stable)`
    };

    // User configuration
    const user = {
      name: 'John Doe',
      role: 'DevOps Lead',
      avatar: null // Will use initials
    };

    // Render current screen
    const renderScreen = (): HTMLElement => {
      switch (currentScreen) {
        case 'overview':
          return createElement(DashboardScreen, {});
        case 'settings':
          return createElement(SettingsScreen, {});
        case 'projects':
          return createElement('div', { 
            className: 'max-w-[1600px] mx-auto p-6' 
          }, [
            createElement('h1', { className: 'text-3xl font-bold text-white mb-4' }, ['Projects']),
            createElement('div', { 
              className: 'bg-surface-dark border border-border-dark rounded-xl p-8 text-center' 
            }, [
              createElement('span', { 
                className: 'material-symbols-outlined text-6xl text-text-secondary mb-4' 
              }, ['folder_open']),
              createElement('h2', { 
                className: 'text-xl font-bold text-white mb-2' 
              }, ['Projects Management']),
              createElement('p', { 
                className: 'text-text-secondary mb-4' 
              }, ['Browse and manage your coding projects. Full implementation coming soon.']),
              createElement('button', {
                className: 'bg-surface-dark-hover border border-border-dark rounded-lg px-4 py-2 text-text-secondary hover:text-white transition-colors cursor-not-allowed',
                disabled: true
              }, ['Not available yet'])
            ])
          ]);
        case 'workflows':
          return createElement('div', { 
            className: 'max-w-[1600px] mx-auto p-6' 
          }, [
            createElement('h1', { className: 'text-3xl font-bold text-white mb-4' }, ['Workflows']),
            createElement('div', { 
              className: 'bg-surface-dark border border-border-dark rounded-xl p-8 text-center' 
            }, [
              createElement('span', { 
                className: 'material-symbols-outlined text-6xl text-text-secondary mb-4' 
              }, ['account_tree']),
              createElement('h2', { 
                className: 'text-xl font-bold text-white mb-2' 
              }, ['Workflow Editor']),
              createElement('p', { 
                className: 'text-text-secondary mb-4' 
              }, ['Design and automate your coding workflows. Full implementation coming soon.']),
              createElement('button', {
                className: 'bg-surface-dark-hover border border-border-dark rounded-lg px-4 py-2 text-text-secondary hover:text-white transition-colors cursor-not-allowed',
                disabled: true
              }, ['Not available yet'])
            ])
          ]);
        case 'history':
          return createElement('div', { 
            className: 'max-w-[1600px] mx-auto p-6' 
          }, [
            createElement('h1', { className: 'text-3xl font-bold text-white mb-4' }, ['History']),
            createElement('div', { 
              className: 'bg-surface-dark border border-border-dark rounded-xl p-8 text-center' 
            }, [
              createElement('span', { 
                className: 'material-symbols-outlined text-6xl text-text-secondary mb-4' 
              }, ['history']),
              createElement('h2', { 
                className: 'text-xl font-bold text-white mb-2' 
              }, ['Run History']),
              createElement('p', { 
                className: 'text-text-secondary mb-4' 
              }, ['View past coding sessions and their results. Full implementation coming soon.']),
              createElement('button', {
                className: 'bg-surface-dark-hover border border-border-dark rounded-lg px-4 py-2 text-text-secondary hover:text-white transition-colors cursor-not-allowed',
                disabled: true
              }, ['Not available yet'])
            ])
          ]);
        default:
          return createElement('div', { 
            className: 'flex items-center justify-center h-full text-text-secondary' 
          }, [
            createElement('div', { className: 'text-center' }, [
              createElement('span', { 
                className: 'material-symbols-outlined text-6xl mb-4' 
              }, ['error_outline']),
              createElement('h2', { 
                className: 'text-2xl font-bold text-white mb-2' 
              }, ['Screen Not Found']),
              createElement('p', { 
                className: 'text-text-secondary max-w-md' 
              }, [`The screen "${currentScreen}" does not exist`])
            ])
          ]);
      }
    };

    // Header configuration
    const header = () => ({
      title: currentScreen === 'overview' ? null : currentScreen.charAt(0).toUpperCase() + currentScreen.slice(1),
      breadcrumbs: currentScreen === 'overview' ? [] : [
        { label: 'Iteronix', href: ROUTES.OVERVIEW },
        { label: currentScreen.charAt(0).toUpperCase() + currentScreen.slice(1) }
      ],
      actions: {
        status: currentScreen === 'overview' ? {
          api: 'API Online',
          runners: '4/12 Active'
        } : null,
        notifications: {
          unread: 2,
          onClick: () => console.log('Notifications clicked')
        },
        primary: currentScreen === 'overview' ? {
          icon: 'add',
          label: 'New Project',
          onClick: () => console.log('New project clicked')
        } : null
      }
    });

    // Sidebar component
    const sidebarComponent = createElement(Sidebar, {
      brand,
      navigation: [...navigation, {
        icon: 'settings',
        label: 'Settings',
        href: ROUTES.SETTINGS,
        active: currentScreen === 'settings',
        onClick: () => this.setState({ currentScreen: 'settings' })
      }],
      user,
      onToggle: () => this.setState({ sidebarCollapsed: !this.state.sidebarCollapsed }),
      collapsed: this.state.sidebarCollapsed
    });

    return createElement(MainLayout, {
      sidebar: sidebarComponent,
      header: header,
      className: 'transition-all duration-300'
    }, [renderScreen()]);
  }



  updateDOM(): void {
    const appRoot = document.getElementById('app-root');
    if (appRoot) {
      // Remove existing content
      appRoot.innerHTML = '';
      
      // Render new content
      const newElement = this.render();
      appRoot.appendChild(newElement);
    }
  }
}

  // Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Hide loading screen
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    (loadingScreen as HTMLElement).style.display = 'none';
  }

  // Show app root
  const appRoot = document.getElementById('app-root');
  if (appRoot) {
    appRoot.classList.remove('hidden');
    
    // Create and mount app
    const appInstance = new App({});
    const appElement = appInstance.render();
    appRoot.appendChild(appElement);

    // Handle hash changes for routing
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.slice(1) || 'overview';
      appInstance.setState({ currentScreen: hash });
    });

  // Handle initial hash
  const initialHash = window.location.hash.slice(1) || 'overview';
  if (initialHash !== 'overview') {
    appInstance.setState({ currentScreen: initialHash });
  }
  }
});