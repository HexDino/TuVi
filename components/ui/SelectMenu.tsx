'use client';

import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

interface SelectMenuProps {
  id: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
}

export function SelectMenu({
  id,
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = 'Chọn',
}: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex >= 0 ? selectedIndex : 0];

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const openMenu = () => {
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    close(true);
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      openMenu();
    }
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(options.length - 1, index + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActive(options.length - 1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(active);
    }
  };

  const onRootBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!open) return;
    const next = event.relatedTarget as Node | null;
    if (next && rootRef.current?.contains(next)) return;
    setOpen(false);
  };

  const triggerLabel = selected
    ? `${ariaLabel}: ${selected.label}${selected.hint ? `, ${selected.hint}` : ''}`
    : `${ariaLabel}: ${placeholder}`;

  return (
    <div className="ctl" ref={rootRef} onBlur={onRootBlur}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="ctl-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-listbox` : undefined}
        aria-label={triggerLabel}
        onClick={() => (open ? close(true) : openMenu())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="ctl-value">{selected?.label ?? placeholder}</span>
        {selected?.hint && <span className="ctl-trigger-hint">{selected.hint}</span>}
        <span className="ctl-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={listRef}
          id={`${id}-listbox`}
          className="ctl-popover"
          role="listbox"
          aria-label={ariaLabel}
          aria-activedescendant={`${id}-option-${active}`}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={option.value === value}
              data-index={index}
              data-active={index === active}
              className="ctl-option"
              onPointerEnter={() => setActive(index)}
              onClick={() => choose(index)}
            >
              <span className="ctl-option-label">{option.label}</span>
              {option.hint && <span className="ctl-option-hint">{option.hint}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
