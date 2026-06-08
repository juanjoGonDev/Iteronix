import { Component, createElement, ComponentProps } from '../shared/Component.js';
import { css } from '../shared/tokens.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ComponentProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string | null;
  children?: string | null;
  disabled?: boolean;
  onClick?: (event: MouseEvent) => void;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

export interface IconButtonProps extends ComponentProps {
  icon: string;
  tooltip?: string | null;
  disabled?: boolean;
  onClick?: (event: MouseEvent) => void;
  className?: string;
}

export class Button extends Component<ButtonProps> {
  override render(): HTMLElement {
    const { 
      variant = 'primary', 
      size = 'md', 
      icon = null, 
      children = null,
      disabled = false,
      onClick,
      type = 'button',
      className = '',
      ...restProps
    } = this.props;

    const baseClasses = 'font-medium rounded-lg transition-all inline-flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary/50';
    const variantClasses = css.button[variant] || css.button.primary;
    const sizeClassesRecord: Record<ButtonSize, string> = {
      sm: 'py-1.5 px-3 text-sm',
      md: 'py-2 px-4 text-sm', 
      lg: 'py-3 px-6 text-base'
    };
    const sizeClasses = sizeClassesRecord[size] || sizeClassesRecord.md;
    
    const disabledClasses = disabled ? 'opacity-50 cursor-not-allowed' : '';
    const finalClasses = `${baseClasses} ${variantClasses} ${sizeClasses} ${disabledClasses} ${className}`;

    const buttonChildren = [
      icon && createElement('span', { 
        className: 'material-symbols-outlined text-[18px]' 
      }, [icon]),
      children
    ].filter(Boolean) as (string | HTMLElement)[];

    return createElement('button', {
      ...restProps,
      type,
      className: finalClasses,
      disabled,
      onClick: onClick ? (e: Event) => onClick(e as MouseEvent) : undefined
    }, buttonChildren);
  }
}

export class IconButton extends Component<IconButtonProps> {
  override render(): HTMLElement {
    const { 
      icon, 
      tooltip = null,
      disabled = false,
      onClick,
      className = '',
      ...restProps
    } = this.props;

    return createElement('button', {
      ...restProps,
      className: `${css.button.icon} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`,
      disabled,
      onClick: onClick ? (e: Event) => onClick(e as MouseEvent) : undefined,
      title: tooltip || undefined
    }, [
      createElement('span', { 
        className: 'material-symbols-outlined text-[20px]' 
      }, [icon])
    ]);
  }
}
