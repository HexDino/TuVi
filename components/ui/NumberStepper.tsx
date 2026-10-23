'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';

interface NumberStepperProps {
  id: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  ariaLabel: string;
}

export function NumberStepper({ id, value, min, max, onChange, ariaLabel }: NumberStepperProps) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const clamp = (valueToClamp: number) => Math.min(max, Math.max(min, Math.trunc(valueToClamp)));

  const commit = () => {
    const parsed = Number(text);
    const next = Number.isFinite(parsed) ? clamp(parsed) : clamp(value);
    setText(String(next));
    if (next !== value) onChange(next);
  };

  const step = (delta: number) => {
    const parsed = Number(text);
    const base = Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : value;
    const next = clamp(base + delta);
    setText(String(next));
    onChange(next);
  };

  const onTextChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    setText(digits);
    if (digits === '') return;
    const parsed = Number(digits);
    if (parsed >= min && parsed <= max) onChange(parsed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      step(1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'Enter') {
      commit();
    } else if (event.key === 'Escape') {
      setText(String(value));
    }
  };

  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper-btn"
        aria-label={`Giảm ${ariaLabel.toLowerCase()}`}
        disabled={value <= min}
        onClick={() => step(-1)}
      >
        −
      </button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        role="spinbutton"
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="stepper-btn"
        aria-label={`Tăng ${ariaLabel.toLowerCase()}`}
        disabled={value >= max}
        onClick={() => step(1)}
      >
        +
      </button>
    </div>
  );
}
