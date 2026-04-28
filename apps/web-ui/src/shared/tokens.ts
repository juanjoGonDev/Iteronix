// Token definitions for consistent styling

interface TokenColors {
  primary: string;
  'primary-hover': string;
  'background-light': string;
  'background-dark': string;
  'surface-dark': string;
  'surface-dark-hover': string;
  'border-dark': string;
  'text-secondary': string;
  'card-dark': string;
  'node-bg': string;
}

interface TokenSpacing {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
}

interface TokenBorderRadius {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  full: string;
}

interface TokenFontFamily {
  display: string;
  mono: string;
}

interface TokenFontSize {
  xs: string;
  sm: string;
  base: string;
  lg: string;
  xl: string;
  '2xl': string;
  '3xl': string;
  '4xl': string;
}

interface TokenTypography {
  fontFamily: TokenFontFamily;
  fontSize: TokenFontSize;
}

interface TokenDefinition {
  colors: TokenColors;
  spacing: TokenSpacing;
  borderRadius: TokenBorderRadius;
  typography: TokenTypography;
}

interface ButtonVariants {
  primary: string;
  secondary: string;
  ghost: string;
  danger: string;
  icon: string;
}

interface CardVariants {
  default: string;
  hover: string;
  active: string;
}

interface InputVariants {
  default: string;
  search: string;
}

interface NavItemVariants {
  default: string;
  active: string;
}

interface StatusVariants {
  success: string;
  warning: string;
  error: string;
  info: string;
  running: string;
  failed: string;
  paused: string;
}

interface LayoutVariants {
  sidebar: string;
  sidebarCollapsed: string;
  header: string;
  main: string;
}

interface CSSClasses {
  button: ButtonVariants;
  card: CardVariants;
  input: InputVariants;
  navItem: NavItemVariants;
  status: StatusVariants;
  layout: LayoutVariants;
}

export const TOKENS: TokenDefinition = {
  colors: {
    primary: '#137fec',
    'primary-hover': '#106cc9', 
    'background-light': '#f6f7f8',
    'background-dark': '#101922',
    'surface-dark': '#1c2127',
    'surface-dark-hover': '#1c2631',
    'border-dark': '#2b3644',
    'text-secondary': '#9dabb9',
    'card-dark': '#242e38',
    'node-bg': '#23262b',
  },
  
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem', 
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    '2xl': '3rem',
  },
  
  borderRadius: {
    sm: '0.25rem',
    md: '0.375rem',
    lg: '0.5rem',
    xl: '0.75rem',
    full: '9999px',
  },
  
  typography: {
    fontFamily: {
      display: '"Inter", sans-serif',
      mono: '"JetBrains Mono", monospace',
    },
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem', 
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem',
      '4xl': '2.25rem',
    },
  },
};

// CSS Class generators
export const css: CSSClasses = {
  // Button variants
  button: {
    primary: 'bg-primary hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors',
    secondary: 'bg-surface-dark hover:bg-surface-dark-hover border border-border-dark text-white font-medium py-2 px-4 rounded-lg transition-colors',
    ghost: 'text-text-secondary hover:text-white hover:bg-surface-dark-hover py-2 px-3 rounded-lg transition-colors',
    danger: 'bg-rose-500/15 hover:bg-rose-500/20 text-rose-100 hover:text-white border border-rose-500/40 hover:border-rose-400/60 font-medium py-2 px-4 rounded-lg transition-colors',
    icon: 'w-9 h-9 flex items-center justify-center rounded-lg bg-surface-dark hover:bg-surface-dark-hover border border-border-dark text-text-secondary hover:text-white transition-colors',
  },
  
  // Card variants  
  card: {
    default: 'bg-surface-dark border border-border-dark rounded-xl shadow-sm',
    hover: 'bg-surface-dark border border-border-dark rounded-xl shadow-sm hover:border-primary/50 transition-colors',
    active: 'bg-surface-dark border border-primary/40 rounded-xl shadow-lg shadow-blue-900/10',
  },
  
  // Input variants
  input: {
    default: 'w-full bg-surface-dark border border-border-dark text-white rounded-lg focus:ring-1 focus:ring-primary focus:border-primary px-3 py-2 placeholder-text-secondary',
    search: 'bg-surface-dark border border-border-dark text-white text-sm rounded-lg focus:ring-primary focus:border-primary block pl-10 pr-3 py-2 placeholder-text-secondary',
  },
  
  // Navigation
  navItem: {
    default: 'flex items-center gap-3 px-3 py-2 rounded-lg text-text-secondary hover:bg-surface-dark-hover hover:text-white transition-colors group',
    active: 'flex items-center gap-3 px-3 py-2 rounded-lg bg-primary/10 text-primary border border-primary/20',
  },
  
  // Status badges
  status: {
    success: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20',
    warning: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20',
    error: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-500 border border-rose-500/20',
    info: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20',
    running: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20',
    failed: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-500 border border-rose-500/20',
    paused: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20',
  },
  
  // Layout utilities
  layout: {
    sidebar: 'w-[248px] bg-surface-dark border-r border-border-dark flex flex-col shrink-0 transition-all duration-300 ease-in-out',
    sidebarCollapsed: 'w-[72px] bg-surface-dark border-r border-border-dark flex flex-col shrink-0 transition-all duration-300 ease-in-out overflow-hidden',
    header: 'h-16 flex items-center justify-between px-6 border-b border-border-dark bg-surface-dark/50 backdrop-blur-sm sticky top-0 z-20',
    main: 'flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark',
  }
};
