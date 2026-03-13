import { Component, createElement, ComponentProps } from './shared/Component';
import { MainLayout } from './components/Layout';
import { Sidebar } from './components/Navigation';
import { ROUTES, APP_VERSION } from './shared/constants';
import { router } from './shared/Router';
import { installClientLogForwarder } from './shared/logger-impl';

// Import screens
import { DashboardScreen } from './screens/Dashboard';
import { Explorer } from './screens/Explorer';
import { KanbanBoard } from './screens/Kanban';
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

    installClientLogForwarder();

    this.setupRouter();

    console.info('Application started', {
      version: APP_VERSION,
      screen: 'overview'
    });
  }

  private setupRouter(): void {
    // Register routes - bind to this instance to maintain context
    router.register('', () => {
      this.updateScreen('overview');
    });
    
    router.register('overview', () => {
      this.updateScreen('overview');
    });
    
    router.register('projects', () => {
      this.updateScreen('projects');
    });
    
    router.register('workflows', () => {
      this.updateScreen('workflows');
    });
    
    router.register('explorer', () => {
      this.updateScreen('explorer');
    });
    
    router.register('history', () => {
      this.updateScreen('history');
    });
    
    router.register('settings', () => {
      this.updateScreen('settings');
    });
  }

  private updateScreen(screen: string): void {
    if (this.state.currentScreen !== screen) {
      this.setState({ currentScreen: screen });
      this.updateDOM();
    }
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
        onClick: (e: Event) => {
          e.preventDefault();
          router.navigate(ROUTES.OVERVIEW);
        }
      },
      {
        icon: 'folder_open',
        label: 'Projects',
        href: ROUTES.PROJECTS,
        active: currentScreen === 'projects',
        onClick: (e: Event) => {
          e.preventDefault();
          router.navigate(ROUTES.PROJECTS);
        }
      },
      {
        icon: 'code',
        label: 'Explorer',
        href: ROUTES.EXPLORER,
        active: currentScreen === 'explorer',
        onClick: (e: Event) => {
          e.preventDefault();
          router.navigate(ROUTES.EXPLORER);
        }
      },
      {
        icon: 'view_kanban',
        label: 'Kanban',
        href: ROUTES.KANBAN,
        active: currentScreen === 'kanban',
        onClick: (e: Event) => {
          e.preventDefault();
          router.navigate(ROUTES.KANBAN);
        }
      },
      {
        icon: 'account_tree',
        label: 'Workflows',
        href: ROUTES.WORKFLOWS,
        active: currentScreen === 'workflows',
        onClick: (e: Event) => {
          e.preventDefault();
          router.navigate(ROUTES.WORKFLOWS);
        }
      },
      {
        icon: 'history',
        label: 'History',
        href: ROUTES.HISTORY,
        active: currentScreen === 'history',
        onClick: (e: Event) => {
          e.preventDefault();
          router.navigate(ROUTES.HISTORY);
        }
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
        case 'explorer':
          return createElement(Explorer, {});
        case 'projects':
          return createElement('div', { 
            className: 'flex items-center justify-center h-full text-text-secondary' 
          }, [
            createElement('div', { className: 'text-center' }, [
              createElement('h1', { 
                className: 'text-6xl font-bold text-white mb-4' 
              }, ['Projects'])
            ])
          ]);
        case 'kanban':
          return createElement(KanbanBoard, {});
        case 'explorer':
          return createElement(Explorer, {});
        case 'workflows':
          return createElement('div', { 
            className: 'flex items-center justify-center h-full text-text-secondary' 
          }, [
            createElement('div', { className: 'text-center' }, [
              createElement('h1', { 
                className: 'text-6xl font-bold text-white mb-4' 
              }, ['Workflows'])
            ])
          ]);
        case 'history':
          return createElement('div', { 
            className: 'flex items-center justify-center h-full text-text-secondary' 
          }, [
            createElement('div', { className: 'text-center' }, [
              createElement('h1', { 
                className: 'text-6xl font-bold text-white mb-4' 
              }, ['History'])
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
        onClick: (e: Event) => {
          e.preventDefault();
          router.navigate(ROUTES.SETTINGS);
        }
      }],
      user,
      onToggle: () => this.setState({ sidebarCollapsed: !this.state.sidebarCollapsed }),
      collapsed: this.state.sidebarCollapsed
    });

    return createElement(MainLayout, {
      sidebar: sidebarComponent,
      header: header,
      className: 'transition-all duration-300',
      sidebarCollapsed: this.state.sidebarCollapsed
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
    appInstance.mount(appRoot);


  }
});