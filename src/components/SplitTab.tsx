import React from 'react';
import { Scale, Save, Share2, MessageSquare } from 'lucide-react';
import { motion } from 'motion/react';
import { AppState } from '../hooks/useAppState';

interface SplitTabProps {
    state: AppState;
}

export function SplitTab({ state }: SplitTabProps) {
    const {
        family, cookware, activeFamilyProportionSum,
        selectedCookwareId, setSelectedCookwareId,
        totalWeightWithCookware, setTotalWeightWithCookware,
        totalCarbs, cachedTotalCarbs,
        setAsideMode, setSetAsideMode,
        setAsideValue, setSetAsideValue,
        portionErrorPercent,
        isErrorDisabledForCurrentSplit, setIsErrorDisabledForCurrentSplit,
        currentRecipeName,
        saveMealToHistory, sharePortion, copyPortionToClipboard, shareFullMeal,
    } = state;

    const selectedItem = cookware.find(c => c.id === selectedCookwareId);
    const cookwareMass = selectedCookwareId === 'none' ? 0 : (selectedItem?.mass ?? 0);
    const hasCookwareSelection = selectedCookwareId === 'none' || !!selectedItem;
    const netWeightRaw = (typeof totalWeightWithCookware === 'number' && hasCookwareSelection)
        ? Math.max(0, totalWeightWithCookware - cookwareMass)
        : 0;

    const setAsideAmount = typeof setAsideValue === 'number' && setAsideValue > 0 ? setAsideValue : 0;
    const setAsideWeight = setAsideMode === 'percentage'
        ? netWeightRaw * (setAsideAmount / 100)
        : setAsideMode === 'absolute'
            ? Math.min(setAsideAmount, netWeightRaw)
            : 0;
    const netWeight = Math.max(0, netWeightRaw - setAsideWeight);

    const effectiveCarbs = totalCarbs > 0 ? totalCarbs : cachedTotalCarbs;
    const adjustedCarbs = netWeightRaw > 0 ? effectiveCarbs * (netWeight / netWeightRaw) : effectiveCarbs;

    const errorMultiplier = (portionErrorPercent > 0 && !isErrorDisabledForCurrentSplit)
        ? 1 - (portionErrorPercent / 100)
        : 1;

    const calculatedPortions = family.filter(m => m.isActive).map(member => {
        const portionRaw = (member.proportion / activeFamilyProportionSum) * netWeight;
        const portion = portionRaw * errorMultiplier;
        const portionCarbs = adjustedCarbs > 0 && netWeight > 0 ? (portionRaw * (adjustedCarbs / netWeight)) : 0;
        return { member, portion, portionCarbs };
    });

    const portionsForSharing = calculatedPortions.map(p => ({
        memberName: p.member.name,
        weight: p.portion,
        carbs: p.portionCarbs,
        isDiabetic: p.member.isDiabetic
    }));

    return (
        <div className="space-y-6">
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <Scale className="text-green-500" size={24} />
                        Reparto de Comida
                    </h2>
                    {netWeight > 0 && (
                        <button
                            onClick={() => saveMealToHistory(
                                currentRecipeName || 'Comida sin nombre',
                                adjustedCarbs,
                                netWeight,
                                portionsForSharing
                            )}
                            className="p-2 bg-orange-100 text-orange-600 rounded-xl hover:bg-orange-200 transition-colors"
                            title="Guardar en historial"
                        >
                            <Save size={20} />
                        </button>
                    )}
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Seleccionar Utensilio</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setSelectedCookwareId('none')}
                                className={`px-3 py-3 rounded-xl text-sm font-medium transition-all ${selectedCookwareId === 'none' ? 'bg-green-500 text-white shadow-md' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                            >
                                Sin utensilio
                                <div className={`text-[10px] ${selectedCookwareId === 'none' ? 'text-green-100' : 'text-gray-400'}`}>Peso directo</div>
                            </button>
                            {cookware.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => setSelectedCookwareId(c.id)}
                                    className={`px-3 py-3 rounded-xl text-sm font-medium transition-all ${selectedCookwareId === c.id ? 'bg-purple-500 text-white shadow-md' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                                >
                                    {c.name}
                                    <div className={`text-[10px] ${selectedCookwareId === c.id ? 'text-purple-100' : 'text-gray-400'}`}>{c.mass}g</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">
                            {selectedCookwareId === 'none' ? 'Peso Total' : 'Peso Total (con utensilio)'}
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                type="number"
                                placeholder="0"
                                value={totalWeightWithCookware}
                                onChange={(e) => setTotalWeightWithCookware(e.target.value === '' ? '' : Number(e.target.value))}
                                className="flex-1 px-4 py-3 bg-gray-50 rounded-2xl text-xl font-bold outline-none focus:ring-2 focus:ring-green-200"
                            />
                            <span className="text-lg font-bold text-gray-400">g</span>
                        </div>
                    </div>

                    {netWeightRaw > 0 && (
                        <>
                            <div className="bg-green-50 p-4 rounded-2xl border border-green-100">
                                <div className="text-xs text-green-600 font-bold uppercase mb-1">Peso Neto de la Comida</div>
                                <div className="text-2xl font-black text-green-700">{netWeightRaw} g</div>
                            </div>

                            <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs font-bold text-gray-400 uppercase">Apartar comida</div>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => { setSetAsideMode(setAsideMode === 'none' ? 'percentage' : 'none'); setSetAsideValue(''); }}
                                            className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors ${setAsideMode !== 'none' ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400'}`}
                                        >
                                            {setAsideMode !== 'none' ? 'Activado' : 'Desactivado'}
                                        </button>
                                    </div>
                                </div>
                                {setAsideMode !== 'none' && (
                                    <div className="space-y-2">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setSetAsideMode('percentage')}
                                                className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-colors ${setAsideMode === 'percentage' ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}
                                            >
                                                Porcentaje
                                            </button>
                                            <button
                                                onClick={() => setSetAsideMode('absolute')}
                                                className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-colors ${setAsideMode === 'absolute' ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}
                                            >
                                                Gramos
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                placeholder={setAsideMode === 'percentage' ? '25' : '500'}
                                                value={setAsideValue}
                                                onChange={(e) => setSetAsideValue(e.target.value === '' ? '' : Number(e.target.value))}
                                                className="flex-1 px-3 py-2 bg-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-200 border border-gray-200"
                                            />
                                            <span className="text-sm font-bold text-gray-400">{setAsideMode === 'percentage' ? '%' : 'g'}</span>
                                        </div>
                                        {setAsideWeight > 0 && (
                                            <div className="text-xs text-gray-400">
                                                Apartando <span className="font-bold text-orange-500">{setAsideWeight.toFixed(0)}g</span> → Queda <span className="font-bold text-green-600">{netWeight.toFixed(0)}g</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {effectiveCarbs > 0 && netWeightRaw > 0 && (
                        <div className="bg-orange-50 p-3 rounded-2xl border border-orange-100">
                            <div className="text-xs text-orange-600 font-bold uppercase mb-1">Carbohidratos</div>
                            <div className="text-lg font-black text-orange-700">{adjustedCarbs.toFixed(1)} g HC</div>
                        </div>
                    )}
                </div>
            </div>

            {netWeight > 0 && activeFamilyProportionSum > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-sm font-bold text-gray-400 uppercase">Raciones Calculadas</h3>
                        {portionErrorPercent > 0 && (
                            <button
                                onClick={() => setIsErrorDisabledForCurrentSplit(!isErrorDisabledForCurrentSplit)}
                                className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors ${isErrorDisabledForCurrentSplit ? 'bg-gray-100 text-gray-400' : 'bg-yellow-100 text-yellow-700'}`}
                                title={isErrorDisabledForCurrentSplit ? 'Error de pesaje desactivado' : `Aplicando -${portionErrorPercent}% de error`}
                            >
                                {isErrorDisabledForCurrentSplit ? 'Error OFF' : `-${portionErrorPercent}%`}
                            </button>
                        )}
                    </div>
                    {calculatedPortions.map(({ member, portion, portionCarbs }) => (
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={member.id}
                            className={`bg-white p-3 rounded-xl shadow-sm border flex justify-between items-center ${member.isDiabetic ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100'}`}
                        >
                            <div className="flex-1">
                                <div className="font-bold text-gray-800 flex items-center gap-2 text-sm">
                                    {member.name}
                                    {member.isDiabetic && <span className="text-[8px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full uppercase">Diabético</span>}
                                </div>
                                <div className="text-[10px] text-gray-400">Prop: {member.proportion}</div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <div className="text-lg font-black text-gray-900 leading-none">{portion.toFixed(0)} <span className="text-xs font-normal">g</span></div>
                                    {adjustedCarbs > 0 && (
                                        <div className="text-xs font-bold text-orange-600 mt-0.5">{portionCarbs.toFixed(1)} <span className="text-[10px] font-normal">g HC</span></div>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => copyPortionToClipboard(member.name, portion, portionCarbs, member.isDiabetic)}
                                        className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"
                                        title="Copiar al portapapeles"
                                    >
                                        <Share2 size={18} />
                                    </button>
                                    <button
                                        onClick={() => sharePortion(member.name, portion, portionCarbs, member.isDiabetic)}
                                        className="p-2 text-green-500 hover:bg-green-50 rounded-full transition-colors"
                                        title="Compartir por WhatsApp"
                                    >
                                        <MessageSquare size={18} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))}

                    <div className="flex gap-2 pt-2">
                        <button
                            onClick={() => shareFullMeal(currentRecipeName || 'Comida sin nombre', adjustedCarbs, netWeight, portionsForSharing, 'clipboard')}
                            className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-bold flex items-center justify-center gap-2 text-xs hover:bg-gray-200 transition-colors"
                        >
                            <Share2 size={16} />
                            Copiar Reparto
                        </button>
                        <button
                            onClick={() => shareFullMeal(currentRecipeName || 'Comida sin nombre', adjustedCarbs, netWeight, portionsForSharing, 'whatsapp')}
                            className="flex-1 py-2.5 bg-green-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 text-xs hover:bg-green-600 transition-colors"
                        >
                            <MessageSquare size={16} />
                            WhatsApp
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
