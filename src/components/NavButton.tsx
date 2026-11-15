import React, { ReactElement } from 'react';

interface NavButtonProps {
    active: boolean;
    onClick: () => void;
    icon: ReactElement;
    label: string;
}

export function NavButton({ active, onClick, icon, label }: NavButtonProps) {
    return (
        <button
            onClick={onClick}
            aria-current={active ? 'page' : undefined}
            className={`flex-1 min-w-0 max-w-28 min-h-12 flex flex-col items-center justify-center gap-0.5 px-1 py-1 rounded-xl transition-all ${active
                    ? 'text-orange-500 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
        >
            {icon}
            <span className="text-[0.6875rem] font-bold tracking-tight max-w-full truncate">{label}</span>
        </button>
    );
}
