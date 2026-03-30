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
            className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all ${active
                    ? 'text-orange-500 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
        >
            {icon}
            <span className="text-[9px] font-bold uppercase tracking-wider">{label}</span>
        </button>
    );
}
