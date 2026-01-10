import { Component, createElement, ComponentProps } from '../shared/Component.js';

interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path: string;
}

interface ExplorerState {
  files: FileNode[];
  selectedFile: FileNode | null;
  searchTerm: string;
  fileName: string;
}

interface ExplorerProps extends ComponentProps {
  className?: string;
}

export class Explorer extends Component<ExplorerProps, ExplorerState> {
  constructor(props: ExplorerProps = {}) {
    super(props, {
      files: [
        {
          id: '1',
          name: 'src',
          type: 'folder',
          path: '/src'
        },
        {
          id: '2',
          name: 'Button.tsx',
          type: 'file',
          path: '/src/components/Button.tsx'
        },
        {
          id: '3',
          name: 'Navigation.tsx',
          type: 'file',
          path: '/src/components/Navigation.tsx'
        },
        {
          id: '4',
          name: 'package.json',
          type: 'file',
          path: '/package.json'
        }
      ],
      selectedFile: null,
      searchTerm: '',
      fileName: ''
    });
  }

  selectFile(file: FileNode): void {
    if (file.type === 'file') {
      this.setState({
        selectedFile: file,
        fileName: file.name
      });
    }
  }

  getFileContent(path: string): string {
    return `// Content for ${path}`;
  }

  handleSearch(searchTerm: string): void {
    this.setState({ searchTerm });
  }

  renderFileNode(file: FileNode): HTMLElement {
    const isFolder = file.type === 'folder';
    const isSelected = this.state.selectedFile?.id === file.id;

    return createElement('div', {
      key: file.id
    }, [
      createElement('div', {
        className: `flex items-center gap-2 py-1 cursor-pointer hover:bg-surface-dark-hover transition-colors ${isSelected ? 'bg-primary/10' : ''}`,
        onClick: () => this.selectFile(file)
      }, [
        createElement('span', {
          className: `material-symbols-outlined text-lg ${isFolder ? 'text-blue-500' : isSelected ? 'text-blue-400' : 'text-text-secondary'}`
        }, [isFolder ? 'folder' : 'description']),
        createElement('span', {
          className: `text-sm text-white ${isFolder ? 'font-bold' : ''}`
        }, [file.name])
      ])
    ]);
  }

  override render(): HTMLElement {
    const { files, selectedFile, searchTerm, fileName } = this.state;

    const filteredFiles = searchTerm 
      ? files.filter(file => 
          file.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : files;

    return createElement('div', { 
      className: 'flex-1 flex bg-background-dark text-white'
    }, [
      // Sidebar
      createElement('aside', { 
        className: 'w-80 flex-shrink-0 border-r border-border-dark bg-surface-dark flex flex-col'
      }, [
        // Header
        createElement('div', { 
          className: 'p-4 border-b border-border-dark'
        }, [
          createElement('h2', { 
            className: 'text-xl font-bold text-white'
          }, ['Explorer'])
        ]),

        // Search
        createElement('div', { 
          className: 'p-4'
        }, [
          createElement('input', {
            type: 'text',
            placeholder: 'Search files...',
            value: searchTerm,
            className: 'w-full bg-surface-dark border border-border-dark text-white rounded-lg pl-3 pr-3 placeholder-text-secondary',
            onChange: (e: Event) => this.handleSearch((e.target as HTMLInputElement).value)
          })
        ]),

        // File Tree
        createElement('div', { 
          className: 'flex-1 overflow-y-auto p-2'
        }, [
          ...filteredFiles.map(file => this.renderFileNode(file))
        ])
      ]),

      // Main Content
      createElement('main', { 
        className: 'flex-1 flex-col min-w-0'
      }, [
        // File Header
        selectedFile && createElement('div', { 
          className: 'bg-surface-dark border-b border-border-dark px-6 py-4'
        }, [
          createElement('div', { 
            className: 'flex items-center justify-between'
          }, [
            createElement('div', { 
              className: 'flex items-center gap-3'
            }, [
              createElement('span', { 
                className: 'material-symbols-outlined text-lg text-blue-500'
              }, ['description']),
              createElement('span', { 
                className: 'text-sm font-medium text-white'
              }, [fileName])
            ]),
            createElement('div', { 
              className: 'flex items-center gap-2'
            }, [
              createElement('span', { 
                className: 'text-xs text-text-secondary font-mono'
              }, [selectedFile.path])
            ])
          ])
        ])
      ]),

      // Monaco Editor
      createElement('div', { 
        className: 'flex-1 bg-[#1e1e1e]'
      }, [
        fileName && createElement('div', {
          className: 'flex items-center justify-between px-4 py-2 bg-surface-dark text-xs font-mono border-b border-border-dark'
        }, [
          createElement('span', {}, [fileName]),
          createElement('span', {
            className: 'text-blue-500'
          }, ['TypeScript'])
        ])
      ]),
      createElement('div', {
        id: 'monaco-editor-container',
        className: 'h-[calc(100vh-120px)] w-full'
      })
    ]);
  }
}