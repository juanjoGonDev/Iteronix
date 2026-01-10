import { Component, createElement, ComponentProps } from '../shared/Component.js';
import { css } from '../shared/tokens.js';

interface InputState {
  value: string;
}

interface InputProps extends ComponentProps {
  type?: 'text' | 'password' | 'email' | 'number' | 'search';
  placeholder?: string;
  variant?: 'default' | 'search';
  icon?: string | null;
  iconPosition?: 'left' | 'right';
  disabled?: boolean;
  error?: string | null;
  value?: string;
  onChange?: (e: Event) => void;
  onFocus?: (e: Event) => void;
  onBlur?: (e: Event) => void;
  className?: string;
}

export class Input extends Component<InputProps, InputState> {
  constructor(props: InputProps) {
    super(props);
    this.state = { value: props.value || '' };
  }

  override render() {
    const { 
      type = 'text',
      placeholder = '',
      variant = 'default',
      icon = null,
      iconPosition = 'left',
      disabled = false,
      error = null,
      onChange,
      onFocus,
      onBlur,
      className = ''
    } = this.props;

    const { value } = this.state;
    const baseClasses = css.input[variant] || css.input.default;
    const errorClasses = error ? 'border-red-500 focus:ring-red-500' : '';
    const finalClasses = `${baseClasses} ${errorClasses} ${className}`;

    const inputElement = createElement('input', {
      type,
      placeholder,
      value,
      disabled,
      className: finalClasses,
      onChange: (e: Event) => {
        const target = e.target as HTMLInputElement;
        this.setState({ value: target.value });
        if (onChange) onChange(e);
      },
      onFocus,
      onBlur
    });

    if (!icon) return inputElement;

    const iconElement = createElement('span', {
      className: `material-symbols-outlined text-text-secondary ${iconPosition === 'left' ? 'ml-3' : 'mr-3'}`
    }, [icon]);

    const containerClasses = 'relative flex items-center';
    const inputWithIconClasses = iconPosition === 'left' ? 'pl-10 pr-3' : 'pl-3 pr-10';

    return createElement('div', { className: containerClasses }, [
      iconPosition === 'left' && iconElement,
      createElement('input', {
        type,
        placeholder,
        value,
        disabled,
        className: `${baseClasses} ${inputWithIconClasses} ${errorClasses} ${className}`,
        onChange: (e: Event) => {
          const target = e.target as HTMLInputElement;
          this.setState({ value: target.value });
          if (onChange) onChange(e);
        },
        onFocus,
        onBlur
      }),
      iconPosition === 'right' && iconElement
    ]);
  }
}

interface SearchInputProps extends ComponentProps {
  placeholder?: string;
  onSearch?: (value: string) => void;
  className?: string;
}

export class SearchInput extends Component<SearchInputProps> {
  override render() {
    const { placeholder = 'Search...', onSearch, className = '' } = this.props;

    return createElement('div', { className: 'relative flex-1' }, [
      createElement('div', {
        className: 'absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'
      }, [
        createElement('span', {
          className: 'material-symbols-outlined text-text-secondary'
        }, ['search'])
      ]),
      createElement('input', {
        type: 'text',
        placeholder,
        className: `block w-full pl-10 pr-3 py-2.5 bg-surface-dark border border-border-dark rounded-lg text-white placeholder-text-secondary focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm font-medium transition-shadow ${className}`,
        onChange: (e: Event) => {
          const target = e.target as HTMLInputElement;
          if (onSearch) onSearch(target.value);
        }
      })
    ]);
  }
}