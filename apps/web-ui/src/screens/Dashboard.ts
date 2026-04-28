import { Component, createElement } from '../shared/Component.js';
import { Card, StatusBadge } from '../components/Card.js';
import { Button, IconButton } from '../components/Button.js';

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

interface LogEntry {
  time: string;
  color: string;
  icon: string | undefined;
  message: string;
  code?: string;
  details?: string;
  trigger?: string;
  error?: boolean;
  opacity?: string;
}

export class DashboardScreen extends Component {
  override render(): HTMLElement {
    return createElement('div', { className: 'max-w-[1600px] mx-auto flex flex-col gap-6 p-6' }, [
      // Page Heading & Stats
      createElement('div', { className: 'flex flex-col gap-6' }, [
        createElement('div', { className: 'flex flex-col sm:flex-row sm:items-end justify-between gap-4' }, [
          createElement('div', {}, [
            createElement('h1', { 
              className: 'text-3xl font-bold text-white tracking-tight' 
            }, ['Overview']),
            createElement('p', { 
              className: 'text-text-secondary mt-1' 
            }, ['Manage your autonomous coding workflows and repositories.'])
          ]),
          createElement('div', { className: 'flex gap-2' }, [])
        ]),

        // Stats Grid
        createElement('div', { className: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4' }, [
          // Total Projects Card
          createElement(Card, { hover: true, className: 'hover:border-primary/30' }, [
            createElement('div', { className: 'flex justify-between items-start mb-4' }, [
              createElement('div', {
                className: 'p-2 bg-blue-500/10 rounded-lg text-blue-500 group-hover:text-blue-400 group-hover:bg-blue-500/20 transition-colors'
              }, [
                createElement('span', { className: 'material-symbols-outlined' }, ['folder_open'])
              ]),
              createElement('span', {
                className: 'text-xs font-medium text-emerald-400'
              }, ['+2 this week'])
            ]),
            createElement('div', { className: 'flex flex-col gap-1' }, [
              createElement('span', { className: 'text-text-secondary text-sm font-medium' }, ['Total Projects']),
              createElement('span', { className: 'text-2xl font-bold text-white' }, ['12'])
            ])
          ]),

          // Active Runners Card
          createElement(Card, { hover: true, className: 'hover:border-primary/30' }, [
            createElement('div', { className: 'flex justify-between items-start mb-4' }, [
              createElement('div', {
                className: 'p-2 bg-orange-500/10 rounded-lg text-orange-500 group-hover:text-orange-400 group-hover:bg-orange-500/20 transition-colors'
              }, [
                createElement('span', { className: 'material-symbols-outlined' }, ['terminal'])
              ]),
              createElement('span', {
                className: 'text-xs font-medium text-text-secondary'
              }, ['4 idle'])
            ]),
            createElement('div', { className: 'flex flex-col gap-1' }, [
              createElement('span', { className: 'text-text-secondary text-sm font-medium' }, ['Active Runners']),
              createElement('span', { className: 'text-2xl font-bold text-white' }, ['8'])
            ])
          ]),

          // API Requests Card
          createElement(Card, { hover: true, className: 'hover:border-primary/30' }, [
            createElement('div', { className: 'flex justify-between items-start mb-4' }, [
              createElement('div', {
                className: 'p-2 bg-purple-500/10 rounded-lg text-purple-500 group-hover:text-purple-400 group-hover:bg-purple-500/20 transition-colors'
              }, [
                createElement('span', { className: 'material-symbols-outlined' }, ['api'])
              ]),
              createElement('span', {
                className: 'text-xs font-medium text-emerald-400'
              }, ['99.9% uptime'])
            ]),
            createElement('div', { className: 'flex flex-col gap-1' }, [
              createElement('span', { className: 'text-text-secondary text-sm font-medium' }, ['API Requests']),
              createElement('span', { className: 'text-2xl font-bold text-white font-mono' }, ['14,203'])
            ])
          ]),

          // Monthly Cost Card
          createElement(Card, { hover: true, className: 'hover:border-primary/30' }, [
            createElement('div', { className: 'flex justify-between items-start mb-4' }, [
              createElement('div', {
                className: 'p-2 bg-emerald-500/10 rounded-lg text-emerald-500 group-hover:text-emerald-400 group-hover:bg-emerald-500/20 transition-colors'
              }, [
                createElement('span', { className: 'material-symbols-outlined' }, ['payments'])
              ]),
              createElement('span', {
                className: 'text-xs font-medium text-text-secondary'
              }, ['Current cycle'])
            ]),
            createElement('div', { className: 'flex flex-col gap-1' }, [
              createElement('span', { className: 'text-text-secondary text-sm font-medium' }, ['Monthly Cost']),
              createElement('span', { className: 'text-2xl font-bold text-white' }, ['$14.50'])
            ])
          ])
        ])
      ]),

      // Main Layout Grid
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
          // Live Logs
          createElement('div', {
            className: 'bg-[#0d1117] border border-border-dark rounded-xl flex flex-col h-full min-h-[400px]'
          }, [
            createElement('div', {
              className: 'px-4 py-3 border-b border-border-dark flex items-center justify-between bg-surface-dark rounded-t-xl'
            }, [
              createElement('div', { className: 'flex items-center gap-2 text-sm font-semibold text-white' }, [
                createElement('span', { className: 'material-symbols-outlined text-text-secondary text-[18px]' }, ['terminal']),
                'Live Logs'
              ]),
              createElement('div', { className: 'flex gap-1.5' }, [
                createElement('div', { className: 'size-2.5 rounded-full bg-red-500/20 border border-red-500/50' }),
                createElement('div', { className: 'size-2.5 rounded-full bg-amber-500/20 border border-amber-500/50' }),
                createElement('div', { className: 'size-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/50' })
              ])
            ]),
            // Logs Content
            this.renderLogsContent()
          ]),

          // Quick Actions
          createElement('div', {
            className: 'bg-gradient-to-br from-surface-dark to-slate-900 border border-border-dark rounded-xl p-5'
          }, [
            createElement('h3', { className: 'text-sm font-semibold text-white mb-3' }, ['Quick Actions']),
            createElement('div', { className: 'space-y-2' }, [
              createElement(Button, {
                variant: 'ghost',
                className: 'w-full justify-start text-sm group',
                icon: 'add_circle',
                onClick: () => console.log('Import from GitHub')
              }, ['Import from GitHub']),
              createElement(Button, {
                variant: 'ghost',
                className: 'w-full justify-start text-sm group',
                icon: 'key',
                onClick: () => console.log('Manage API Keys')
              }, ['Manage API Keys']),
              createElement(Button, {
                variant: 'ghost',
                className: 'w-full justify-start text-sm group',
                icon: 'history',
                onClick: () => console.log('View Audit Logs')
              }, ['View Audit Logs'])
            ])
          ])
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

  renderLogsContent(): HTMLElement {
    const logs: LogEntry[] = [
      {
        time: '10:42:15 AM',
        color: 'blue',
        icon: 'started',
        message: 'Started optimization task on',
        code: 'backend/db.py',
        details: '> Analyzing query performance...\n> Found 3 inefficient joins.'
      },
      {
        time: '10:38:22 AM',
        color: 'emerald',
        icon: 'check_circle',
        message: 'Pull Request merged:',
        code: '#42 Fix auth logic',
        details: 'Triggered by',
        trigger: 'Auto-Reviewer'
      },
      {
        time: '10:15:00 AM',
        color: 'rose',
        icon: 'error',
        message: 'Test suite failed on',
        code: 'Auth-Service',
        details: 'Error: JWT signature invalid\nat verifyToken (auth.go:154)',
        error: true
      },
      {
        time: '09:55:12 AM',
        color: 'gray',
        icon: undefined,
        message: 'System initialization complete',
        opacity: '60'
      }
    ];

    return createElement('div', { 
      className: 'p-4 font-mono text-xs flex-1 overflow-y-auto space-y-4 max-h-[500px]' 
    }, [
      logs.map((log, index) =>
        createElement('div', { 
          key: `log-${index}`,
          className: 'flex gap-3' + (log.opacity ? ` opacity-${log.opacity}` : '')
        }, [
          // Timeline connector
          createElement('div', { className: 'flex flex-col items-center' }, [
            createElement('div', {
              className: `size-2 rounded-full bg-${log.color}-500${log.color === 'blue' ? ' shadow-[0_0_8px_rgba(59,130,246,0.5)]' : ''} mt-1.5`
            }, []),
            index < logs.length - 1 && createElement('div', { 
              className: 'w-px h-full bg-border-dark my-1' 
            }, [])
          ]),

          // Log content
          createElement('div', { className: 'flex flex-col gap-1 pb-2' }, [
            createElement('div', { className: 'text-text-secondary' }, [log.time]),
            createElement('div', { className: 'text-white' }, [
              log.message,
              log.code && createElement('span', { 
                className: `text-${log.color}-400` 
              }, [log.code]),
              log.trigger && createElement('div', { 
                className: 'text-text-secondary' 
              }, [
                log.details || '',
                createElement('span', { className: 'text-white' }, [log.trigger])
              ])
            ]),
            log.details && !log.trigger && createElement('div', {
              className: `bg-surface-dark p-2 rounded border border-border-dark text-${log.color === 'rose' ? 'rose-300' : 'text-text-secondary'} mt-1${log.error ? ' bg-rose-950/20 border-rose-900/50' : ''}`
            }, [log.details])
          ])
        ])
      )
    ]);
  }
}
