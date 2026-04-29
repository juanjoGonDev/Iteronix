import { Component, createElement } from '../shared/Component.js';
import { Card, StatusBadge } from '../components/Card.js';
import { IconButton } from '../components/Button.js';
import { PageFrame, PageIntro } from '../components/PageScaffold.js';
import {
  OverviewActivityPanel,
  OverviewMetricCard,
  OverviewQuickActionsPanel,
  type OverviewActivityPanelProps,
  type OverviewMetricCardProps,
  type OverviewQuickAction
} from '../components/OverviewPrimitives.js';

interface ProjectItem {
  id: number;
  name: string;
  repo: string;
  icon: string;
  iconColor: string;
  stack: string[];
  status: 'running' | 'success' | 'failed' | 'paused';
  lastUpdated: string;
  version: string;
}

export class DashboardScreen extends Component {
  override render(): HTMLElement {
    const metrics = readDashboardMetrics();
    const quickActions = readDashboardQuickActions();

    return createElement(PageFrame, { className: 'max-w-[1600px]' }, [
      createElement(PageIntro, {
        title: 'Overview',
        description: 'Manage your autonomous coding workflows and repositories.'
      }),
      createElement('div', { className: 'flex flex-col gap-6' }, [
        createElement('div', { className: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4' }, [
          metrics.map((metric) =>
            createElement(OverviewMetricCard, {
              key: metric.label,
              ...metric
            })
          )
        ])
      ]),
      createElement('div', { className: 'grid grid-cols-1 xl:grid-cols-3 gap-6' }, [
        // Projects Column
        createElement('div', { className: 'xl:col-span-2 flex flex-col gap-4' }, [
          // Search & Filters
          createElement('div', { className: 'flex flex-col sm:flex-row gap-3' }, [
            createElement('div', { className: 'relative flex-1' }, [
              createElement('div', {
                className: 'absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'
              }, [
                createElement('span', { className: 'material-symbols-outlined text-text-secondary' }, ['search'])
              ]),
              createElement('input', {
                type: 'text',
                placeholder: 'Search projects, repositories, or tags...',
                className: 'block w-full pl-10 pr-3 py-2.5 bg-surface-dark border border-border-dark rounded-lg text-white placeholder-text-secondary focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm font-medium transition-shadow'
              })
            ]),
            createElement('div', { className: 'flex gap-3' }, [
              createElement('select', {
                className: 'bg-surface-dark border border-border-dark text-white text-sm rounded-lg focus:ring-primary focus:border-primary block w-full p-2.5 min-w-[140px] appearance-none cursor-pointer'
              }, [
                createElement('option', { value: 'all' }, ['All Statuses']),
                createElement('option', { value: 'running' }, ['Running']),
                createElement('option', { value: 'completed' }, ['Completed']),
                createElement('option', { value: 'failed' }, ['Failed'])
              ]),
              createElement(IconButton, {
                icon: 'filter_list',
                tooltip: 'Filter options'
              })
            ])
          ]),

          // Projects List
          createElement(Card, { className: 'overflow-hidden' }, [
            createElement('div', { className: 'overflow-x-auto' }, [
              createElement('table', { className: 'w-full text-left border-collapse' }, [
                createElement('thead', {
                  className: 'bg-surface-dark-hover/50 text-xs uppercase text-text-secondary font-semibold border-b border-border-dark'
                }, [
                  createElement('tr', {}, [
                    createElement('th', { className: 'px-6 py-4' }, ['Project / Repo']),
                    createElement('th', { className: 'px-6 py-4' }, ['Stack']),
                    createElement('th', { className: 'px-6 py-4' }, ['Status']),
                    createElement('th', { className: 'px-6 py-4 text-right' }, ['Last Updated']),
                    createElement('th', { className: 'px-6 py-4' }, [''])
                  ])
                ]),
                createElement('tbody', { className: 'divide-y divide-border-dark' }, [
                  // Project Item 1
                  this.renderProjectItem({
                    id: 1,
                    name: 'Backend-Microservices',
                    repo: 'github.com/iteronix/backend',
                    icon: 'dns',
                    iconColor: 'text-blue-500',
                    stack: ['PY', 'DK'],
                    status: 'running',
                    lastUpdated: '2 mins ago',
                    version: 'v2.1.0'
                  }),
                  // Project Item 2
                  this.renderProjectItem({
                    id: 2,
                    name: 'Frontend-Dashboard',
                    repo: 'github.com/iteronix/web-client',
                    icon: 'web',
                    iconColor: 'text-purple-500',
                    stack: ['TS', 'TW'],
                    status: 'success',
                    lastUpdated: '4 hours ago',
                    version: 'release-4.2'
                  }),
                  // Project Item 3
                  this.renderProjectItem({
                    id: 3,
                    name: 'Auth-Service',
                    repo: 'github.com/iteronix/auth',
                    icon: 'security',
                    iconColor: 'text-rose-500',
                    stack: ['GO'],
                    status: 'failed',
                    lastUpdated: '1 day ago',
                    version: 'fix/login-bug'
                  }),
                  // Project Item 4
                  this.renderProjectItem({
                    id: 4,
                    name: 'Data-Pipeline-V2',
                    repo: 'github.com/iteronix/data-pipe',
                    icon: 'dataset',
                    iconColor: 'text-indigo-500',
                    stack: ['PY', 'SQ'],
                    status: 'paused',
                    lastUpdated: '3 days ago',
                    version: 'feature/analytics'
                  })
                ])
              ])
            ])
          ])
        ]),

        // Right Column: Activity Feed / Terminal
        createElement('div', { className: 'xl:col-span-1 flex flex-col gap-4' }, [
          createElement(OverviewActivityPanel, {
            entries: readDashboardLogs()
          }),
          createElement(OverviewQuickActionsPanel, {
            actions: quickActions
          })
        ])
      ])
    ]);
  }

  renderProjectItem(project: ProjectItem): HTMLElement {
    const statusConfig = {
      running: { color: 'amber', label: 'Running', animate: true },
      success: { color: 'emerald', label: 'Success', animate: false },
      failed: { color: 'rose', label: 'Failed', animate: false },
      paused: { color: 'gray', label: 'Paused', animate: false }
    };

    const status = statusConfig[project.status] || statusConfig.success;

    return createElement('tr', { 
      className: 'group hover:bg-surface-dark-hover/50 transition-colors',
      key: `project-${project.id}`
    }, [
      // Project Name
      createElement('td', { className: 'px-6 py-4' }, [
        createElement('div', { className: 'flex items-center gap-4' }, [
          createElement('div', {
            className: `size-10 rounded-lg bg-${status.color}-500/10 flex items-center justify-center text-${status.color}-500 border border-${status.color}-500/20`
          }, [
            createElement('span', { className: 'material-symbols-outlined' }, [project.icon])
          ]),
            createElement('div', {}, [
              createElement('div', { className: 'font-semibold text-white text-sm' }, [project.name]),
              createElement('a', {
              href: '#',
              className: 'text-xs text-text-secondary hover:text-primary font-mono flex items-center gap-1 mt-0.5'
            }, [
              project.repo,
              createElement('span', { className: 'material-symbols-outlined text-[12px]' }, ['open_in_new'])
            ])
          ])
        ])
      ]),

      // Stack
      createElement('td', { className: 'px-6 py-4' }, [
        createElement('div', { className: 'flex -space-x-2' }, [
          project.stack.map(tech =>
            createElement('div', {
              key: tech,
              className: 'size-7 rounded-full bg-[#2b3644] border-2 border-surface-dark flex items-center justify-center text-[10px] text-white font-bold',
              title: tech
            }, [tech])
          )
        ])
      ]),

      // Status
      createElement('td', { className: 'px-6 py-4' }, [
        createElement(StatusBadge, {
          status: project.status,
          icon: status.animate ? null : (status.color === 'emerald' ? 'check_circle' : status.color === 'rose' ? 'error' : 'pause_circle'),
          pulse: status.animate,
          className: status.label
        })
      ]),

      // Last Updated
      createElement('td', { className: 'px-6 py-4 text-right' }, [
        createElement('div', { className: 'text-sm text-text-secondary' }, [project.lastUpdated]),
        createElement('div', { className: 'text-xs text-text-secondary/60 font-mono' }, [project.version])
      ]),

      // Actions
      createElement('td', { className: 'px-6 py-4 text-right' }, [
        createElement(IconButton, {
          icon: 'more_vert',
          onClick: () => console.log(`Actions for ${project.name}`)
        })
      ])
    ]);
  }

}

const readDashboardMetrics = (): ReadonlyArray<OverviewMetricCardProps> => [
  {
    icon: 'folder_open',
    accent: 'blue',
    badgeText: '+2 this week',
    badgeTone: 'positive',
    label: 'Total Projects',
    value: '12'
  },
  {
    icon: 'terminal',
    accent: 'orange',
    badgeText: '4 idle',
    badgeTone: 'neutral',
    label: 'Active Runners',
    value: '8'
  },
  {
    icon: 'api',
    accent: 'purple',
    badgeText: '99.9% uptime',
    badgeTone: 'positive',
    label: 'API Requests',
    value: '14,203',
    valueTone: 'mono'
  },
  {
    icon: 'payments',
    accent: 'emerald',
    badgeText: 'Current cycle',
    badgeTone: 'neutral',
    label: 'Monthly Cost',
    value: '$14.50'
  }
];

const readDashboardQuickActions = (): ReadonlyArray<OverviewQuickAction> => [
  {
    icon: 'add_circle',
    label: 'Import from GitHub',
    onClick: () => console.log('Import from GitHub')
  },
  {
    icon: 'key',
    label: 'Manage API Keys',
    onClick: () => console.log('Manage API Keys')
  },
  {
    icon: 'history',
    label: 'View Audit Logs',
    onClick: () => console.log('View Audit Logs')
  }
];

const readDashboardLogs = (): OverviewActivityPanelProps['entries'] => [
  {
    time: '10:42:15 AM',
    color: 'blue',
    message: 'Started optimization task on',
    code: 'backend/db.py',
    details: '> Analyzing query performance...\n> Found 3 inefficient joins.'
  },
  {
    time: '10:38:22 AM',
    color: 'emerald',
    message: 'Pull Request merged:',
    code: '#42 Fix auth logic',
    details: 'Triggered by',
    trigger: 'Auto-Reviewer'
  },
  {
    time: '10:15:00 AM',
    color: 'rose',
    message: 'Test suite failed on',
    code: 'Auth-Service',
    details: 'Error: JWT signature invalid\nat verifyToken (auth.go:154)',
    error: true
  },
  {
    time: '09:55:12 AM',
    color: 'gray',
    message: 'System initialization complete',
    opacity: '60'
  }
];
