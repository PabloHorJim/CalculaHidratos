import React from 'react';

interface SidebarButtonProps {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    description: string;
}

export function SidebarButton({ active, onClick, icon, label, description }: SidebarButtonProps) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-4 p-3 rounded-2xl transition-all ${active ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}
        >
            <div className={`${active ? 'text-orange-500' : 'text-gray-400'}`}>
                {icon}
            </div>
            <div className="text-left">
                <div className="text-sm font-bold leading-none mb-1">{label}</div>
                <div className="text-[10px] text-gray-400 font-medium">{description}</div>
            </div>
        </button>
    );
}
