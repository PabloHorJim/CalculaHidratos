import React from 'react';
import { Users, CloudOff, Plus, UserPlus, LogOut, User as UserIcon } from 'lucide-react';
import { AppState } from '../hooks/useAppState';

interface GroupTabProps {
    state: AppState;
}

export function GroupTab({ state }: GroupTabProps) {
    const {
        user, groupId, familyGroup, groupMembers,
        groupNameInput, setGroupNameInput,
        inviteInput, setInviteInput,
        handleLogin, createGroup, joinGroup, leaveGroup, setToast,
    } = state;

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Users className="text-blue-500" size={24} />
                Familia Compartida
            </h2>

            {!user ? (
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 text-center">
                    <CloudOff className="mx-auto text-gray-300 mb-4" size={48} />
                    <p className="text-gray-600 mb-4">Inicia sesión para compartir tus datos con tu familia.</p>
                    <button
                        onClick={handleLogin}
                        className="w-full py-3 bg-blue-500 text-white rounded-2xl font-bold hover:bg-blue-600 transition-colors"
                    >
                        Iniciar Sesión
                    </button>
                </div>
            ) : groupId && familyGroup ? (
                <div className="space-y-4">
                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-blue-100">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <div className="text-xs font-bold text-blue-400 uppercase">Grupo Activo</div>
                                <h3 className="text-2xl font-black text-gray-800">{familyGroup.name}</h3>
                            </div>
                            <button
                                onClick={leaveGroup}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                                title="Salir del grupo"
                            >
                                <LogOut size={20} />
                            </button>
                        </div>

                        <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 mb-4">
                            <div className="text-[10px] text-blue-600 font-bold uppercase mb-1">Código de Invitación</div>
                            <div className="flex items-center justify-between">
                                <div className="text-xl font-mono font-black text-blue-800 tracking-widest">{familyGroup.inviteCode}</div>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(familyGroup.inviteCode);
                                        setToast('Código copiado');
                                    }}
                                    className="text-xs font-bold text-blue-600 underline"
                                >
                                    Copiar
                                </button>
                            </div>
                        </div>

                        <p className="text-xs text-gray-500 leading-relaxed mb-6">
                            Todos los miembros con este código compartirán ingredientes, recetas, familia y utensilios en tiempo real.
                        </p>

                        <div className="space-y-3">
                            <div className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Miembros del Grupo</div>
                            <div className="space-y-2">
                                {groupMembers.map(member => (
                                    <div key={member.uid} className="flex items-center gap-3 bg-gray-50 p-2 rounded-xl">
                                        {member.photoURL ? (
                                            <img src={member.photoURL} alt="" className="w-8 h-8 rounded-full border border-white shadow-sm" referrerPolicy="no-referrer" />
                                        ) : (
                                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-500">
                                                <UserIcon size={14} />
                                            </div>
                                        )}
                                        <div className="flex-1">
                                            <div className="text-sm font-bold text-gray-800">{member.displayName || 'Usuario'}</div>
                                            <div className="text-[10px] text-gray-400">{member.email}</div>
                                        </div>
                                        {member.uid === familyGroup.adminUid && (
                                            <span className="text-[8px] font-black uppercase bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">Admin</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Plus className="text-green-500" size={20} />
                            Crear Nuevo Grupo
                        </h3>
                        <div className="space-y-3">
                            <input
                                type="text"
                                placeholder="Nombre de la familia (ej: Los García)"
                                className="w-full px-4 py-3 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-green-200"
                                value={groupNameInput}
                                onChange={(e) => setGroupNameInput(e.target.value)}
                            />
                            <button
                                onClick={() => createGroup(groupNameInput)}
                                disabled={!groupNameInput}
                                className={`w-full py-3 rounded-2xl font-bold transition-colors ${groupNameInput ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                            >
                                Crear Grupo
                            </button>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <UserPlus className="text-blue-500" size={20} />
                            Unirse a un Grupo
                        </h3>
                        <div className="space-y-3">
                            <input
                                type="text"
                                placeholder="Código de invitación"
                                className="w-full px-4 py-3 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-blue-200 uppercase font-mono"
                                value={inviteInput}
                                onChange={(e) => setInviteInput(e.target.value)}
                            />
                            <button
                                onClick={() => joinGroup(inviteInput)}
                                disabled={!inviteInput}
                                className={`w-full py-3 rounded-2xl font-bold transition-colors ${inviteInput ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                            >
                                Unirse
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
