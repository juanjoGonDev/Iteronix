import { Component, createElement, ComponentProps } from '../shared/Component';
import { css } from '../shared/tokens';

type CardVariant = 'default' | 'bordered' | 'elevated';
type CardPadding = 'sm' | 'md' | 'lg' | 'xl';
type StatusType = 'info' | 'success' | 'warning' | 'error' | 'running' | 'failed' | 'paused';
type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';
type StatusIndicator = 'online' | 'away' | 'busy' | 'offline';

interface CardProps extends ComponentProps {
  variant?: CardVariant;
  hover?: boolean;
  active?: boolean;
  children?: unknown;
  padding?: CardPadding;
  className?: string;
}

interface StatusBadgeProps extends ComponentProps {
  status?: StatusType;
  children?: unknown;
  icon?: string | null;
  pulse?: boolean;
  className?: string;
}

interface AvatarProps extends ComponentProps {
  src?: string | null;
  name?: string;
  size?: AvatarSize;
  status?: StatusIndicator | null;
  className?: string;
}

export class Card extends Component<CardProps> {
  override render(): HTMLElement {
    const { 
      hover = false,
      active = false,
      children,
      padding = 'md',
      className = ''
    } = this.props;

    const baseClasses = css.card.default;
    const hoverClasses = hover ? 'hover:border-primary/50' : '';
    const activeClasses = active ? 'border-primary/40 shadow-lg shadow-blue-900/10' : '';
    const paddingClasses: Record<CardPadding, string> = {
      sm: 'p-3',
      md: 'p-4', 
      lg: 'p-6',
      xl: 'p-8'
    };
    
    const finalClasses = `${baseClasses} ${hoverClasses} ${activeClasses} ${paddingClasses[padding]} ${className}`;

    return createElement('div', {
      className: finalClasses
    }, [children]);
  }
}

export class StatusBadge extends Component<StatusBadgeProps> {
  override render(): HTMLElement {
    const { 
      status = 'info',
      children,
      icon = null,
      pulse = false,
      className = ''
    } = this.props;

    const baseClasses = css.status[status] || css.status.info;
    const pulseClasses = pulse ? 'animate-pulse' : '';
    const finalClasses = `${baseClasses} ${pulseClasses} ${className}`;

    return createElement('span', { className: finalClasses }, [
      icon && createElement('span', { 
        className: 'material-symbols-outlined text-[14px]' 
      }, [icon]),
      children
    ].filter(Boolean));
  }
}

export class Avatar extends Component<AvatarProps> {
  override render(): HTMLElement {
    const { 
      src = null,
      name = '',
      size = 'md',
      status = null,
      className = ''
    } = this.props;

    const sizeClasses: Record<AvatarSize, string> = {
      sm: 'size-6 text-xs',
      md: 'size-8 text-sm',
      lg: 'size-10 text-base',
      xl: 'size-12 text-lg'
    };

    const statusDot = status && createElement('div', {
      className: `absolute -bottom-0 -right-0 size-3 rounded-full border-2 border-surface-dark ${
        status === 'online' ? 'bg-emerald-500' : 
        status === 'away' ? 'bg-amber-500' : 
        status === 'busy' ? 'bg-red-500' : 'bg-gray-400'
      }`
    });

    if (src) {
      return createElement('div', { className: `relative ${className}` }, [
        createElement('img', {
          src,
          alt: name,
          className: `${sizeClasses[size]} rounded-full bg-cover bg-center object-cover`
        }),
        statusDot
      ]);
    }

    // Generate initials if no image
    const initials = name
      .split(' ')
      .map((word: string) => word.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');

    return createElement('div', { className: `relative ${className}` }, [
      createElement('div', {
        className: `${sizeClasses[size]} rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-white font-bold shadow-inner`
      }, [initials]),
      statusDot
    ]);
  }
}