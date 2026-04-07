export interface CategoryColor {
    bg: string;
    text: string;
    border: string;
    badge: string;
}

export function getCategoryColor(category?: string): CategoryColor {
    const defaultColor: CategoryColor = {
        bg: 'bg-gray-50 dark:bg-gray-800',
        text: 'text-gray-800 dark:text-gray-200',
        border: 'border-gray-100 dark:border-gray-700',
        badge: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
    };

    if (!category) return defaultColor;

    const lower = category.toLowerCase().trim();

    if (lower.includes('cereales')) return {
        bg: 'bg-amber-50 dark:bg-amber-900/10',
        text: 'text-amber-800 dark:text-amber-200',
        border: 'border-amber-200 dark:border-amber-800/50',
        badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
    };
    if (lower.includes('leche')) return {
        bg: 'bg-sky-50 dark:bg-sky-900/10',
        text: 'text-sky-800 dark:text-sky-200',
        border: 'border-sky-200 dark:border-sky-800/50',
        badge: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400'
    };
    if (lower.includes('huevo')) return {
        bg: 'bg-yellow-50 dark:bg-yellow-900/10',
        text: 'text-yellow-800 dark:text-yellow-200',
        border: 'border-yellow-200 dark:border-yellow-800/50',
        badge: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
    };
    if (lower.includes('azúcares') || lower.includes('azucares')) return {
        bg: 'bg-fuchsia-50 dark:bg-fuchsia-900/10',
        text: 'text-fuchsia-800 dark:text-fuchsia-200',
        border: 'border-fuchsia-200 dark:border-fuchsia-800/50',
        badge: 'bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-400'
    };
    if (lower.includes('aceite') || lower.includes('grasa')) return {
        bg: 'bg-rose-50 dark:bg-rose-900/10',
        text: 'text-rose-800 dark:text-rose-200',
        border: 'border-rose-200 dark:border-rose-800/50',
        badge: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'
    };
    if (lower.includes('verdura') || lower.includes('hortaliza')) return {
        bg: 'bg-green-50 dark:bg-green-900/10',
        text: 'text-green-800 dark:text-green-200',
        border: 'border-green-200 dark:border-green-800/50',
        badge: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
    };
    if (lower.includes('legumbre')) return {
        bg: 'bg-emerald-50 dark:bg-emerald-900/10',
        text: 'text-emerald-800 dark:text-emerald-200',
        border: 'border-emerald-200 dark:border-emerald-800/50',
        badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
    };
    if (lower.includes('frutas')) return {
        bg: 'bg-orange-50 dark:bg-orange-900/10',
        text: 'text-orange-800 dark:text-orange-200',
        border: 'border-orange-200 dark:border-orange-800/50',
        badge: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
    };
    if (lower.includes('frutos secos')) return {
        bg: 'bg-indigo-50 dark:bg-indigo-900/10',
        text: 'text-indigo-800 dark:text-indigo-200',
        border: 'border-indigo-200 dark:border-indigo-800/50',
        badge: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
    };
    if (lower.includes('carne')) return {
        bg: 'bg-red-50 dark:bg-red-900/10',
        text: 'text-red-800 dark:text-red-200',
        border: 'border-red-200 dark:border-red-800/50',
        badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
    };
    if (lower.includes('pescado')) return {
        bg: 'bg-cyan-50 dark:bg-cyan-900/10',
        text: 'text-cyan-800 dark:text-cyan-200',
        border: 'border-cyan-200 dark:border-cyan-800/50',
        badge: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400'
    };
    if (lower.includes('crustáceo') || lower.includes('crustaceo') || lower.includes('molusco')) return {
        bg: 'bg-teal-50 dark:bg-teal-900/10',
        text: 'text-teal-800 dark:text-teal-200',
        border: 'border-teal-200 dark:border-teal-800/50',
        badge: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400'
    };
    if (lower.includes('condimento') || lower.includes('aperitivo')) return {
        bg: 'bg-purple-50 dark:bg-purple-900/10',
        text: 'text-purple-800 dark:text-purple-200',
        border: 'border-purple-200 dark:border-purple-800/50',
        badge: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
    };
    if (lower.includes('bebida')) return {
        bg: 'bg-violet-50 dark:bg-violet-900/10',
        text: 'text-violet-800 dark:text-violet-200',
        border: 'border-violet-200 dark:border-violet-800/50',
        badge: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'
    };

    return defaultColor;
}
