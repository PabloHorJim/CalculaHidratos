import React from 'react';
import { motion } from 'motion/react';

interface NavButtonProps {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
}

export function NavButton({ active, onClick, icon, label }: NavButtonProps) {
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center gap-1 transition-all ${active ? 'text-orange-500 scale-110' : 'text-gray-400'}`}
        >
            {icon}
            <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
            {active && <motion.div layoutId="nav-indicator" className="w-1 h-1 bg-orange-500 rounded-full mt-0.5" />}
        </button>
    );
}
