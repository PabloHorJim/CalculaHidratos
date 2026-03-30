import React from 'react';
import { Plus, Trash2, CheckCircle2, Circle, Users, CloudOff, UserPlus, LogOut, User as UserIcon } from 'lucide-react';
import { AppState } from '../hooks/useAppState';

interface FamilyTabProps {
    state: AppState;
}

export function FamilyTab({ state }: FamilyTabProps) {
    const {
        family, addFamilyMember, toggleFamilyMember, updateFamilyMember, removeFamilyMember,
        user, groupId, familyGroup, groupMembers,
        groupNameInput, setGroupNameInput,
        inviteInput, setInviteInput,
        handleLogin, createGroup, joinGroup, leaveGroup, setToast,
    } = state;

    return (
        <div className="space-y-6">
            {/* Family Members */}
            <div className="space-y-3">
                <div className="flex justify-between items-center mb-1">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Familia</h2>
                    <button
                        onClick={addFamilyMember}
                        className="p-1.5 bg-blue-500 text-white rounded-full hover:bg-blue-600"
                    >
                        <Plus size={18} />
                    </button>
                </div>
                <div className="space-y-2">
                    {family.map(member => (
                        <div key={member.id} className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                            <div className="flex items-center gap-2 mb-2">
                                <button onClick={() => toggleFamilyMember(member.id)}>
                                    {member.isActive ? (
                                        <CheckCircle2 className="text-green-500" size={20} />
                                    ) : (
                                        <Circle className="text-gray-300 dark:text-gray-600" size={20} />
                                    )}
                                </button>
                                <input
                                    type="text"
                                    value={member.name}
                                    onChange={(e) => updateFamilyMember(member.id, { name: e.target.value })}
                                    className="flex-1 font-bold text-sm outline-none bg-transparent dark:text-gray-100"
                                />
                                <button
                                    onClick={() => removeFamilyMember(member.id)}
                                    className="text-gray-300 dark:text-gray-600 hover:text-red-500"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Proporción</label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        value={member.proportion}
                                        onChange={(e) => updateFamilyMember(member.id, { proportion: Number(e.target.value) })}
                                        className="w-full px-2 py-1 bg-gray-50 dark:bg-gray-700 rounded text-sm outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 dark:text-gray-100"
                                    />
                                </div>
                                <div className="flex flex-col justify-end">
                                    <button
                                        onClick={() => updateFamilyMember(member.id, { isDiabetic: !member.isDiabetic })}
                                        className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${member.isDiabetic ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}
                                    >
                                        {member.isDiabetic ? 'Diabético' : 'No Diabético'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Cloud Sync / Group Section — Integrated */}
            <div className="border-t border-gray-100 dark:border-gray-700 pt-6">
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2 mb-4">
                    <Users className="text-blue-500" size={22} />
                    Familia Compartida
                </h2>

                {!user ? (
                    <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 text-center transition-colors">
                        <CloudOff className="mx-auto text-gray-300 dark:text-gray-600 mb-3" size={36} />
                        <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">Inicia sesión para sincronizar datos con tu familia.</p>
                        <button
                            onClick={handleLogin}
                            className="w-full py-2.5 bg-blue-500 text-white rounded-xl font-bold text-sm hover:bg-blue-600 transition-colors"
                        >
                            Iniciar Sesión con Google
                        </button>
                    </div>
                ) : groupId && familyGroup ? (
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-blue-100 dark:border-blue-800 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <div className="text-[10px] font-bold text-blue-400 uppercase">Grupo Activo</div>
                                <h3 className="text-lg font-black text-gray-800 dark:text-gray-100">{familyGroup.name}</h3>
                            </div>
                            <button
                                onClick={leaveGroup}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                title="Salir del grupo"
                            >
                                <LogOut size={18} />
                            </button>
                        </div>

                        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl border border-blue-100 dark:border-blue-800 mb-3">
                            <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase mb-1">Código</div>
                            <div className="flex items-center justify-between">
                                <div className="text-base font-mono font-black text-blue-800 dark:text-blue-300 tracking-widest">{familyGroup.inviteCode}</div>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(familyGroup.inviteCode);
                                        setToast('Código copiado');
                                    }}
                                    className="text-[10px] font-bold text-blue-600 dark:text-blue-400 underline"
                                >
                                    Copiar
                                </button>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <div className="text-[9px] text-gray-400 font-black uppercase tracking-widest">Miembros</div>
                            {groupMembers.map(member => (
                                <div key={member.uid} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 p-2 rounded-lg">
                                    {member.photoURL ? (
                                        <img src={member.photoURL} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                                    ) : (
                                        <div className="w-6 h-6 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center text-blue-500">
                                            <UserIcon size={12} />
                                        </div>
                                    )}
                                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 flex-1">{member.displayName || 'Usuario'}</span>
                                    {member.uid === familyGroup.adminUid && (
                                        <span className="text-[7px] font-black uppercase bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-400 px-1 py-0.5 rounded">Admin</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                            <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2 text-sm">
                                <Plus className="text-green-500" size={16} />
                                Crear Grupo
                            </h3>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Nombre (ej: Los García)"
                                    className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm dark:text-gray-100 focus:ring-2 focus:ring-green-200 dark:focus:ring-green-800"
                                    value={groupNameInput}
                                    onChange={(e) => setGroupNameInput(e.target.value)}
                                />
                                <button
                                    onClick={() => createGroup(groupNameInput)}
                                    disabled={!groupNameInput}
                                    className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors ${groupNameInput ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}
                                >
                                    Crear
                                </button>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                            <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2 text-sm">
                                <UserPlus className="text-blue-500" size={16} />
                                Unirse a Grupo
                            </h3>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Código de invitación"
                                    className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm uppercase font-mono dark:text-gray-100 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
                                    value={inviteInput}
                                    onChange={(e) => setInviteInput(e.target.value)}
                                />
                                <button
                                    onClick={() => joinGroup(inviteInput)}
                                    disabled={!inviteInput}
                                    className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors ${inviteInput ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}
                                >
                                    Unirse
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
