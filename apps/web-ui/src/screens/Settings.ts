import { Component, createElement, ComponentProps } from '../shared/Component.js';
import { Button } from '../components/Button.js';

interface SettingsState {
  activeTab: 'general' | 'provider' | 'limits' | 'notifications' | 'api';
  selectedProvider: string;
  infiniteLoops: boolean;
  maxLoops: number;
  externalCalls: boolean;
  soundEnabled: boolean;
  webhookUrl: string;
  apiKey: string;
}

export class SettingsScreen extends Component<ComponentProps, SettingsState> {
  constructor(props: ComponentProps = {}) {
    super(props);
    this.state = {
      activeTab: 'general',
      selectedProvider: 'openai',
      infiniteLoops: false,
      maxLoops: 50,
      externalCalls: true,
      soundEnabled: true,
      webhookUrl: '',
      apiKey: 'sk-proj-************************'
    };
  }

  override render() {
    const { activeTab } = this.state;
    
    return createElement('div', { className: 'max-w-[960px] mx-auto flex flex-col gap-8 pb-20 p-4 md:p-8 lg:px-12' }, [
      // Page Heading
      createElement('div', { className: 'flex flex-col gap-2' }, [
        createElement('h1', { 
          className: 'text-3xl md:text-4xl font-bold text-white tracking-tight' 
        }, ['Settings']),
        createElement('p', { 
          className: 'text-text-secondary text-base max-w-2xl' 
        }, ['Configure your autonomous coding environment, manage LLM providers, and set critical safety limits for your agents.'])
      ]),

      // Tabs
      createElement('div', { className: 'border-b border-border-dark' }, [
        createElement('div', { className: 'flex gap-8 overflow-x-auto scrollbar-hide' }, [
          this.renderTab('general', 'General'),
          this.renderTab('provider', 'LLM Provider'),
          this.renderTab('limits', 'Workflow Limits'),
          this.renderTab('notifications', 'Notifications'),
          this.renderTab('api', 'API Access')
        ])
      ]),

      // Tab Content
      activeTab === 'provider' && this.renderProviderContent(),
      activeTab === 'limits' && this.renderLimitsContent(),
      activeTab === 'notifications' && this.renderNotificationsContent(),
      activeTab === 'general' && this.renderGeneralContent(),
      activeTab === 'api' && this.renderApiContent(),

      // Save Action Bar
      this.renderSaveBar()
    ]);
  }

  private renderTab(id: SettingsState['activeTab'], label: string) {
    const { activeTab } = this.state;
    const isActive = activeTab === id;
    
    return createElement('button', {
      key: id,
      className: `flex pb-3 border-b-2 ${
        isActive ? 'border-white text-white' : 'border-transparent text-text-secondary'
      } text-sm font-bold hover:text-white whitespace-nowrap transition-colors`,
      onClick: () => this.setState({ activeTab: id })
    }, [label]);
  }

  private renderProviderContent() {
    const { apiKey } = this.state;
    
    return createElement('section', { className: 'flex flex-col gap-6' }, [
      createElement('div', { className: 'flex items-center justify-between' }, [
        createElement('h2', { className: 'text-xl font-bold text-white' }, ['Provider Configuration']),
        createElement('span', {
          className: 'text-xs font-mono text-text-secondary bg-surface-dark px-2 py-1 rounded'
        }, ['ENV: PRODUCTION'])
      ]),

      // Provider Cards
      createElement('div', { className: 'grid grid-cols-1 md:grid-cols-3 gap-4' }, [
        // OpenAI Card
        this.renderProviderCard('openai', 'OpenAI', 'GPT-4o, GPT-3.5 Turbo', 'openai-logo'),
        
        // Anthropic Card
        this.renderProviderCard('anthropic', 'Anthropic', 'Claude 3.5 Sonnet, Opus', 'C'),
        
        // Ollama Card
        this.renderProviderCard('ollama', 'Ollama (Local)', 'Llama 3, Mixtral', 'terminal', true)
      ]),

      // Provider Settings Form
      createElement('div', {
        className: 'grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 rounded-xl bg-[#1a2027] border border-border-dark'
      }, [
        // Model Selection
        createElement('div', { className: 'flex flex-col gap-2' }, [
          createElement('label', { className: 'text-sm font-medium text-white' }, ['Model']),
          createElement('div', { className: 'relative' }, [
            createElement('select', {
              className: 'w-full h-10 bg-surface-dark border-none rounded-lg px-3 text-white focus:ring-1 focus:ring-primary cursor-pointer text-sm',
              value: 'gpt-4o'
            }, [
              createElement('option', { value: 'gpt-4o' }, ['gpt-4o (Recommended)']),
              createElement('option', { value: 'gpt-4-turbo' }, ['gpt-4-turbo']),
              createElement('option', { value: 'gpt-3.5-turbo' }, ['gpt-3.5-turbo'])
            ]),
            createElement('div', {
              className: 'absolute right-3 top-2.5 pointer-events-none text-text-secondary'
            }, [
              createElement('span', { className: 'material-symbols-outlined text-lg' }, ['expand_more'])
            ])
          ]),
          createElement('p', { className: 'text-xs text-text-secondary' }, ['Estimated cost: ~$0.03 / 1k tokens'])
        ]),

        // Precision
        createElement('div', { className: 'flex flex-col gap-2' }, [
          createElement('label', { className: 'text-sm font-medium text-white' }, ['Precision & Context']),
          createElement('div', { className: 'relative' }, [
            createElement('select', {
              className: 'w-full h-10 bg-surface-dark border-none rounded-lg px-3 text-white focus:ring-1 focus:ring-primary cursor-pointer text-sm'
            }, [
              createElement('option', { value: 'fp32' }, ['FP32 (Standard)']),
              createElement('option', { value: 'fp16' }, ['FP16 (Half Precision)']),
              createElement('option', { value: 'bf16' }, ['BF16'])
            ]),
            createElement('div', {
              className: 'absolute right-3 top-2.5 pointer-events-none text-text-secondary'
            }, [
              createElement('span', { className: 'material-symbols-outlined text-lg' }, ['expand_more'])
            ])
          ])
        ]),

        // API Key
        createElement('div', { 
          className: 'flex flex-col gap-2 lg:col-span-2' 
        }, [
          createElement('label', { className: 'text-sm font-medium text-white' }, ['API Key']),
          createElement('div', { className: 'relative flex items-center' }, [
            createElement('span', {
              className: 'absolute left-3 text-text-secondary material-symbols-outlined text-[20px]'
            }, ['key']),
            createElement('input', {
              type: 'password',
              value: apiKey,
              className: 'w-full h-10 bg-surface-dark border-none rounded-lg pl-10 pr-3 text-white focus:ring-1 focus:ring-primary font-mono text-sm placeholder-text-secondary',
              onChange: (e: Event) => {
                const target = e.target as HTMLInputElement;
                this.setState({ apiKey: target.value });
              }
            }),
            createElement('button', {
              className: 'absolute right-2 text-primary text-xs font-bold hover:underline px-2',
              onClick: () => console.log('Edit API key')
            }, ['EDIT'])
          ])
        ])
      ])
    ]);
  }

  private renderProviderCard(id: string, name: string, description: string, icon: string, isLocal: boolean = false) {
    const { selectedProvider } = this.state;
    const isSelected = selectedProvider === id;
    
    return createElement('label', {
      key: id,
      className: `relative flex flex-col gap-4 p-5 rounded-xl border-2 cursor-pointer transition-all hover:${
        isSelected 
          ? 'bg-primary/20' 
          : 'bg-surface-dark hover:border-primary/50'
      } ${isSelected ? 'border-primary bg-primary/10' : 'border-border-dark'}`
    }, [
      createElement('input', {
        type: 'radio',
        name: 'provider',
        checked: isSelected,
        onChange: () => this.setState({ selectedProvider: id }),
        className: 'sr-only'
      }),
      createElement('div', { className: 'flex items-center justify-between' }, [
        createElement('div', {
          className: `size-10 ${isLocal ? 'bg-white' : 'bg-gradient-to-br from-primary to-blue-600'} rounded-lg flex items-center justify-center p-1.5`,
          title: `${name} Logo`
        }, [
          icon === 'openai-logo' 
            ? createElement('svg', { 
                className: 'w-full h-full text-black',
                fill: 'none',
                viewBox: '0 0 24 24'
              }, [
                createElement('path', {
                  d: 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0843 3.5398-2.0466.1877-.1096V14.9918l-3.8082 2.2045-2.7818 1.6138a4.5292 4.5292 0 0 1-.2994-5.2263l.1171-.064 3.7915-2.1966.1953-.1127v4.1561l3.5246 2.0375a4.4707 4.4707 0 0 1-1.732 4.0255zm7.2272-5.4623-2.8094 1.6247-.1133.0655-3.5246-2.0375-.1953-.1127V12.35l3.821-2.2017 2.7687-1.599a4.5077 4.5077 0 0 1 2.9102 1.1009 4.5363 4.5363 0 0 1-2.8572 7.1802zm-3.1537-8.7906a4.4693 4.4693 0 0 1 2.668 1.5546l-.1352.0789-3.5413 2.0476-.1846.1062v4.1481l3.8052-2.203 2.7818-1.6138a4.522 4.522 0 0 1 .301 5.231l-.1129.065-3.7997 2.1986-.1969.1142V11.233l-3.5186-2.0354a4.4693 4.4693 0 0 1 1.9333-3.8247zm-11.666 4.6062L8.47 11.1466l.1133-.0655 3.5247 2.0375.1953.1127v4.1624l-3.817 2.1986-2.7662 1.5943a4.5077 4.5077 0 0 1-2.9118-1.0962 4.5363 4.5363 0 0 1 2.8592-7.1648zm3.1422-3.7937a4.522 4.522 0 0 1 2.6288-1.0717l.1128-.065 3.8008-2.1991.1969-.1142v4.1566l-3.5212 2.037a4.4717 4.4717 0 0 1-1.745-4.025l2.8093-1.6238z',
                  fill: 'currentColor'
                })
              ])
            : createElement('span', { 
                className: `material-symbols-outlined text-[32px] ${isLocal ? 'text-black' : 'text-white'}` 
              }, [icon])
        ]),
        createElement('span', {
          className: `material-symbols-outlined ${isSelected ? 'text-primary' : 'text-text-secondary'}`
        }, [isSelected ? 'check_circle' : 'radio_button_unchecked'])
      ]),
      createElement('div', {}, [
        createElement('p', { className: 'font-bold text-white' }, [name]),
        createElement('p', { className: 'text-xs text-text-secondary' }, [description])
      ])
    ]);
  }

  private renderLimitsContent() {
    const { infiniteLoops, maxLoops, externalCalls } = this.state;
    
    return createElement('section', { className: 'flex flex-col gap-6 pt-6 border-t border-border-dark' }, [
      createElement('div', { className: 'flex flex-col' }, [
        createElement('h2', { className: 'text-xl font-bold text-white' }, ['Workflow Limits']),
        createElement('p', { className: 'text-sm text-text-secondary' }, ['Safety constraints for autonomous loops.'])
      ]),

      // Dangerous Settings Panel
      createElement('div', { className: 'flex flex-col gap-6 p-6 rounded-xl bg-[#1a2027] border border-border-dark' }, [
        // Max Loops Configuration
        createElement('div', { className: 'flex flex-col gap-4' }, [
          createElement('div', { className: 'flex items-center justify-between' }, [
            createElement('div', { className: 'flex flex-col' }, [
              createElement('p', { className: 'text-white font-medium' }, ['Maximum Loops per Agent']),
              createElement('p', { className: 'text-xs text-text-secondary' }, ['Prevents runaway agents from consuming excessive tokens.'])
            ]),
            createElement('div', { className: 'flex items-center gap-3' }, [
              createElement('span', {
                className: 'text-xs font-bold text-text-secondary uppercase tracking-wider'
              }, ['Finite']),
              this.renderToggle('infinite-loops', infiniteLoops),
              createElement('span', {
                className: 'text-xs font-bold text-white uppercase tracking-wider'
              }, ['Infinite'])
            ])
          ]),
          
          // Input for finite loops
          createElement('div', { className: 'flex items-center gap-2' }, [
            createElement('input', {
              type: 'number',
              value: maxLoops.toString(),
              disabled: infiniteLoops,
              className: 'w-32 h-10 bg-surface-dark border border-border-dark text-white rounded-lg px-3 focus:ring-0 disabled:opacity-50',
              onChange: (e: Event) => {
                const target = e.target as HTMLInputElement;
                this.setState({ maxLoops: parseInt(target.value) });
              }
            }),
            createElement('span', { className: 'text-sm text-text-secondary' }, ['iterations'])
          ]),

          // Warning Banner
          infiniteLoops && createElement('div', {
            className: 'flex gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 items-start'
          }, [
            createElement('span', { className: 'material-symbols-outlined text-[20px] mt-0.5' }, ['warning']),
            createElement('div', { className: 'flex flex-col gap-1' }, [
              createElement('p', { className: 'text-sm font-bold' }, ['Infinite Loops Enabled']),
              createElement('p', { className: 'text-xs opacity-90' }, ['Agents will run continuously until manually stopped or an error occurs. This can lead to significant API costs. Ensure you have spending limits configured on your provider dashboard.'])
            ])
          ])
        ]),

        createElement('div', { className: 'h-px bg-border-dark' }),

        // External Calls
        createElement('div', { className: 'flex items-center justify-between' }, [
          createElement('div', { className: 'flex gap-3' }, [
            createElement('div', {
              className: 'flex items-center justify-center size-10 rounded-lg bg-surface-dark text-white shrink-0'
            }, [
              createElement('span', { className: 'material-symbols-outlined' }, ['public'])
            ]),
            createElement('div', { className: 'flex flex-col' }, [
              createElement('p', { className: 'text-white font-medium' }, ['Allow External API Calls']),
              createElement('p', { className: 'text-xs text-text-secondary' }, ['Agents can fetch data from open internet via curl/wget.'])
            ])
          ]),
          this.renderToggle('external-calls', externalCalls)
        ])
      ])
    ]);
  }

  private renderNotificationsContent() {
    const { soundEnabled, webhookUrl } = this.state;
    
    return createElement('section', { className: 'flex flex-col gap-6 pt-6 border-t border-border-dark' }, [
      createElement('div', { className: 'flex items-center justify-between' }, [
        createElement('div', { className: 'flex flex-col' }, [
          createElement('h2', { className: 'text-xl font-bold text-white' }, ['Notifications']),
          createElement('p', { className: 'text-sm text-text-secondary' }, ['Alerts for agent completion and errors.'])
        ])
      ]),
      
      createElement('div', { className: 'flex flex-col gap-4' }, [
        // Sound Toggle
        createElement('div', {
          className: 'flex items-center justify-between p-4 rounded-lg bg-[#1a2027] border border-border-dark'
        }, [
          createElement('div', { className: 'flex items-center gap-3' }, [
            createElement('span', { className: 'material-symbols-outlined text-text-secondary' }, ['volume_up']),
            createElement('span', { className: 'text-sm font-medium text-white' }, ['Play sound on completion'])
          ]),
          this.renderToggle('sound-enabled', soundEnabled)
        ]),

        // Webhook
        createElement('div', {
          className: 'flex flex-col gap-3 p-4 rounded-lg bg-[#1a2027] border border-border-dark'
        }, [
          createElement('div', { className: 'flex justify-between items-center' }, [
            createElement('label', {
              className: 'text-sm font-medium text-white flex items-center gap-2'
            }, [
              createElement('span', { className: 'material-symbols-outlined text-text-secondary text-[18px]' }, ['webhook']),
              'Webhook URL'
            ]),
            createElement('button', {
              className: 'text-xs font-bold text-primary hover:text-blue-400',
              onClick: () => console.log('Test webhook payload')
            }, ['TEST PAYLOAD'])
          ]),
          createElement('input', {
            type: 'text',
            value: webhookUrl,
            placeholder: 'https://hooks.slack.com/services/...',
            className: 'w-full h-10 bg-surface-dark border border-border-dark rounded-lg px-3 text-white focus:ring-1 focus:ring-primary text-sm font-mono placeholder-text-secondary',
            onChange: (e: Event) => {
              const target = e.target as HTMLInputElement;
              this.setState({ webhookUrl: target.value });
            }
          }),
          createElement('p', { className: 'text-xs text-text-secondary' }, ['We will send a POST request with JSON payload upon workflow events.'])
        ])
      ])
    ]);
  }

  private renderGeneralContent() {
    return createElement('section', { className: 'flex flex-col gap-6' }, [
      createElement('div', { className: 'text-center py-12' }, [
        createElement('p', { className: 'text-text-secondary' }, ['General settings coming soon...'])
      ])
    ]);
  }

  private renderApiContent() {
    return createElement('section', { className: 'flex flex-col gap-6' }, [
      createElement('div', { className: 'text-center py-12' }, [
        createElement('p', { className: 'text-text-secondary' }, ['API Access settings coming soon...'])
      ])
    ]);
  }

  private renderToggle(id: string, checked: boolean) {
    return createElement('label', {
      className: 'relative inline-flex items-center cursor-pointer',
      htmlFor: id
    }, [
      createElement('input', {
        type: 'checkbox',
        id: id,
        checked: checked,
        className: 'sr-only peer',
        onChange: (e: Event) => {
          const target = e.target as HTMLInputElement;
          if (id === 'infinite-loops') this.setState({ infiniteLoops: target.checked });
          else if (id === 'external-calls') this.setState({ externalCalls: target.checked });
          else if (id === 'sound-enabled') this.setState({ soundEnabled: target.checked });
        }
      }),
      createElement('div', {
        className: 'w-11 h-6 bg-border-dark peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary'
      })
    ]);
  }

  private renderSaveBar() {
    return createElement('div', {
      className: 'fixed bottom-0 right-0 left-0 md:left-64 p-4 bg-background-dark/90 backdrop-blur-sm border-t border-border-dark flex justify-end gap-3 z-30'
    }, [
      createElement(Button, {
        variant: 'secondary',
        onClick: () => console.log('Reset to defaults')
      }, ['Reset Defaults']),
      createElement(Button, {
        variant: 'primary',
        icon: 'save',
        onClick: () => this.handleSave()
      }, ['Save Changes'])
    ]);
  }

  private handleSave() {
    console.log('Saving settings:', this.state);
    // Here you would save to backend/storage
  }


}