import React, { useEffect, useRef, useState } from 'react';

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'>;

interface NumberInputProps extends InputProps {
    value: number | '';
    /** Receives '' only when `allowEmpty` is set; otherwise an empty field counts as 0. */
    onChange: (value: number | '') => void;
    allowEmpty?: boolean;
    min?: number;
    max?: number;
}

const parse = (text: string): number | null => {
    if (text.trim() === '') return null;
    const n = Number(text.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};

/**
 * Numeric field that can be cleared and retyped (a plain controlled <input type="number">
 * snaps back to 0), accepts a decimal comma and shows the numeric keypad on phones.
 */
export function NumberInput({ value, onChange, allowEmpty = false, min = 0, max, onBlur, onFocus, ...rest }: NumberInputProps) {
    const [text, setText] = useState(value === '' ? '' : String(value));
    const focused = useRef(false);

    // Follow external changes (sync, reset…) unless they are just the echo of what was typed
    useEffect(() => {
        const typed = parse(text);
        const isEcho = typed === null
            ? value === '' || (value === 0 && focused.current) // field cleared while typing
            : typed === value;
        if (!isEcho) setText(value === '' ? '' : String(value));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/[^0-9.,]/g, '');
        setText(raw);
        const n = parse(raw);
        if (n === null) {
            if (raw.trim() === '') onChange(allowEmpty ? '' : 0);
            return; // incomplete input such as "." keeps the previous value
        }
        onChange(Math.min(max ?? Infinity, Math.max(min, n)));
    };

    return (
        <input
            {...rest}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={handleChange}
            onFocus={(e) => { focused.current = true; e.target.select(); onFocus?.(e); }}
            onBlur={(e) => {
                focused.current = false;
                setText(value === '' ? '' : String(value));
                onBlur?.(e);
            }}
        />
    );
}
