import React, { ReactElement } from 'react';

interface SidebarButtonProps {
    active: boolean;
    onClick: () => void;
    icon: ReactElement;
    label: string;
    description: string;
}

export function SidebarButton({ active, onClick, icon, label, description }: SidebarButtonProps) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${active
                    ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
        >
            <div className={active ? 'text-orange-500 dark:text-orange-400' : 'text-gray-400 dark:text-gray-500'}>
                {icon}
            </div>
            <div className="text-left">
                <div className="text-sm font-bold leading-none mb-1">{label}</div>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{description}</div>
            </div>
        </button>
    );
}
