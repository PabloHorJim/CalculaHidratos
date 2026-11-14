import { FamilyMember, MealHistoryEntry } from '../types';

type Portion = MealHistoryEntry['portions'][number];

const openWhatsApp = (message: string, phone = '') => {
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
};

export async function copyText(message: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(message);
        return true;
    } catch {
        return false;
    }
}

export function portionMessage(name: string, weight: number, carbs: number, isDiabetic: boolean, bold: boolean): string {
    const b = bold ? '*' : '';
    return `🍽️ ${b}Reparto de Comida${b}\n\nPara ${b}${name}${b}:\n- Ración: ${b}${weight.toFixed(0)}g${b}\n- Carbohidratos: ${b}${carbs.toFixed(1)}g HC${b}${isDiabetic ? ' (¡Diabético! ⚠️)' : ''}\n\nCalculado con CarbCalc`;
}

export function fullMealMessage(recipeName: string, totalCarbs: number, netWeight: number, portions: Portion[], bold: boolean): string {
    const b = bold ? '*' : '';
    const lines = portions.map(p =>
        `- ${p.memberName}: ${p.weight.toFixed(0)}g (${p.carbs.toFixed(1)}g HC)${p.isDiabetic ? ' ⚠️' : ''}`
    ).join('\n');
    return `🍽️ ${b}Reparto: ${recipeName}${b}\n\nPeso neto: ${netWeight.toFixed(0)}g\nHC totales: ${totalCarbs.toFixed(1)}g\n\n${lines}\n\nCalculado con CarbCalc`;
}

export function sharePortionOnWhatsApp(name: string, weight: number, carbs: number, isDiabetic: boolean) {
    openWhatsApp(portionMessage(name, weight, carbs, isDiabetic, true));
}

export function shareFullMealOnWhatsApp(recipeName: string, totalCarbs: number, netWeight: number, portions: Portion[]) {
    openWhatsApp(fullMealMessage(recipeName, totalCarbs, netWeight, portions, true));
}

/** wa.me expects the international number with digits only (no "+", spaces or leading 00). */
export function whatsappNumber(phone: string | undefined): string {
    return phone ? phone.replace(/\D/g, '').replace(/^00/, '') : '';
}

/** Sends a diabetic member their carbs; goes straight to their chat when a phone is configured. */
export function shareDiabeticCarbsOnWhatsApp(member: FamilyMember, carbs: number) {
    openWhatsApp(`🩺 *HC para ${member.name}*: *${carbs.toFixed(1)}g HC*\n\nCalculado con CarbCalc 💙`, whatsappNumber(member.phone));
}
