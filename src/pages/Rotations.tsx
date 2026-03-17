import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { MapPin, Plus, Trash2, Edit2, Check, X, Layers, Info } from 'lucide-react';

interface Potrero {
    id: string;
    nombre: string;
    area_hectareas: number;
    id_rotacion: string | null;
}

interface Rotacion {
    id: string;
    nombre: string;
}

export default function Rotations() {
    const { fincaId, role } = useAuth();
    const [msjError, setMsjError] = useState('');

    const [rotaciones, setRotaciones] = useState<Rotacion[]>([]);
    const [potreros, setPotreros] = useState<Potrero[]>([]);
    
    // Estados de edición
    const [editingRot, setEditingRot] = useState<string | null>(null);
    const [editRotNombre, setEditRotNombre] = useState('');

    const [editingPot, setEditingPot] = useState<string | null>(null);
    const [editPotForm, setEditPotForm] = useState({ nombre: '', area: '', id_rotacion: '' });

    const [showNuevaRotacion, setShowNuevaRotacion] = useState(false);
    const [nuevaRotNombre, setNuevaRotNombre] = useState('');
    
    const [showNuevoPotrero, setShowNuevoPotrero] = useState<string | null>(null); // null o id_rotacion
    const [nuevoPotForm, setNuevoPotForm] = useState({ nombre: '', area: '' });

    const isAdmin = role === 'administrador';

    const fetchData = async () => {
        if (!fincaId) return;
        try {
            const { data: rotData } = await supabase
                .from('rotaciones')
                .select('id, nombre')
                .eq('id_finca', fincaId)
                .order('nombre');

            const { data: potData } = await supabase
                .from('potreros')
                .select('id, nombre, area_hectareas, id_rotacion')
                .eq('id_finca', fincaId)
                .order('nombre');

            if (rotData) setRotaciones(rotData);
            if (potData) setPotreros(potData);
        } finally {
            // fetchData fin
        }
    };

    useEffect(() => {
        fetchData();
    }, [fincaId]);

    const handleUpdateRotacion = async (id: string) => {
        if (!isAdmin || !editRotNombre.trim()) return;
        try {
            const { error } = await supabase
                .from('rotaciones')
                .update({ nombre: editRotNombre.trim() })
                .eq('id', id);
            if (error) throw error;
            setEditingRot(null);
            fetchData();
        } catch (err: any) {
            setMsjError(err.message);
        }
    };

    const handleUpdatePotrero = async (id: string) => {
        if (!isAdmin || !editPotForm.nombre.trim()) return;
        try {
            const { error } = await supabase
                .from('potreros')
                .update({
                    nombre: editPotForm.nombre.trim(),
                    area_hectareas: parseFloat(editPotForm.area) || 0,
                    id_rotacion: editPotForm.id_rotacion || null
                })
                .eq('id', id);
            if (error) throw error;
            setEditingPot(null);
            fetchData();
        } catch (err: any) {
            setMsjError(err.message);
        }
    };

    const handleAddRotacion = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nuevaRotNombre.trim() || !fincaId) return;
        try {
            const { error } = await supabase.from('rotaciones').insert({ id_finca: fincaId, nombre: nuevaRotNombre.trim() });
            if (error) throw error;
            setNuevaRotNombre('');
            setShowNuevaRotacion(false);
            fetchData();
        } catch (err: any) {
            setMsjError(err.message);
        }
    };

    const handleAddPotrero = async (e: React.FormEvent, rotId: string | null) => {
        e.preventDefault();
        if (!nuevoPotForm.nombre.trim() || !fincaId) return;
        try {
            const { error } = await supabase.from('potreros').insert({
                id_finca: fincaId,
                nombre: nuevoPotForm.nombre.trim(),
                area_hectareas: parseFloat(nuevoPotForm.area) || 0,
                id_rotacion: rotId
            });
            if (error) throw error;
            setNuevoPotForm({ nombre: '', area: '' });
            setShowNuevoPotrero(null);
            fetchData();
        } catch (err: any) {
            setMsjError(err.message);
        }
    };

    const deletePotrero = async (id: string) => {
        if (!isAdmin || !confirm('¿Eliminar potrero?')) return;
        try {
            await supabase.from('potreros').delete().eq('id', id);
            fetchData();
        } catch (err: any) { console.error(err); }
    };

    const deleteRotacion = async (id: string) => {
        if (!isAdmin || !confirm('¿Eliminar rotación? Los potreros quedarán sin rotación.')) return;
        try {
            await supabase.from('rotaciones').delete().eq('id', id);
            fetchData();
        } catch (err: any) { console.error(err); }
    };

    // Agrupar
    const groupedData = rotaciones.map(r => {
        const pots = potreros.filter(p => p.id_rotacion === r.id);
        const areaTotal = pots.reduce((sum, p) => sum + (p.area_hectareas || 0), 0);
        return { ...r, pots, areaTotal };
    });

    const sinRotacion = potreros.filter(p => !p.id_rotacion);
    const areaTotalSin = sinRotacion.reduce((sum, p) => sum + (p.area_hectareas || 0), 0);
    const areaFinca = potreros.reduce((sum, p) => sum + (p.area_hectareas || 0), 0);

    return (
        <div className="page-container" style={{ maxWidth: '1000px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
                        <MapPin size={32} /> Rotaciones y Potreros
                    </h1>
                    <div style={{ display: 'flex', gap: '20px', marginTop: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            <Layers size={16} /> <strong style={{ color: 'white' }}>{rotaciones.length}</strong> Rotaciones
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            <MapPin size={16} /> <strong style={{ color: 'white' }}>{potreros.length}</strong> Potreros
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            <strong style={{ color: 'var(--primary-light)' }}>{areaFinca.toFixed(2)}</strong> Ha Totales
                        </div>
                    </div>
                </div>
                {isAdmin && (
                    <button 
                        onClick={() => setShowNuevaRotacion(true)} 
                        style={{ 
                            width: 'auto', 
                            padding: '10px 24px', 
                            borderRadius: '100px', 
                            fontSize: '0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            boxShadow: '0 4px 15px rgba(46, 125, 50, 0.3)'
                        }}
                    >
                        <Plus size={20} /> Nueva Rotación
                    </button>
                )}
            </div>

            {msjError && <div style={{ backgroundColor: 'rgba(244, 67, 54, 0.15)', color: 'var(--error)', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>{msjError}</div>}

            {showNuevaRotacion && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                    <div className="card" style={{ maxWidth: '400px', width: '100%' }}>
                        <h2>Nueva Rotación</h2>
                        <form onSubmit={handleAddRotacion} style={{ marginTop: '20px' }}>
                            <label>Nombre de la Rotación</label>
                            <input autoFocus type="text" value={nuevaRotNombre} onChange={e => setNuevaRotNombre(e.target.value)} placeholder="Ej: Rotación Norte" required />
                            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                <button type="button" className="btn-secondary" onClick={() => setShowNuevaRotacion(false)}>Cancelar</button>
                                <button type="submit">Crear</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {groupedData.map(rot => (
                    <div key={rot.id} className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                        {/* Header de la Rotación */}
                        <div style={{ 
                            padding: '16px 24px', 
                            backgroundColor: 'rgba(255,255,255,0.02)', 
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                <Layers size={20} color="var(--primary-light)" />
                                {editingRot === rot.id ? (
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <input 
                                            autoFocus
                                            style={{ margin: 0, padding: '4px 8px', fontSize: '1rem' }} 
                                            value={editRotNombre} 
                                            onChange={e => setEditRotNombre(e.target.value)}
                                        />
                                        <button onClick={() => handleUpdateRotacion(rot.id)} style={{ width: 'auto', padding: '4px', background: 'none' }}><Check size={18} color="var(--success)" /></button>
                                        <button onClick={() => setEditingRot(null)} style={{ width: 'auto', padding: '4px', background: 'none' }}><X size={18} color="var(--text-muted)" /></button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <h3 style={{ margin: 0, color: 'white', fontWeight: 600 }}>{rot.nombre}</h3>
                                        {isAdmin && <Edit2 size={14} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => { setEditingRot(rot.id); setEditRotNombre(rot.nombre); }} />}
                                    </div>
                                )}
                                <span style={{ fontSize: '0.8rem', backgroundColor: 'rgba(255,255,255,0.05)', padding: '2px 10px', borderRadius: '100px', color: 'var(--text-muted)' }}>
                                    {rot.pots.length} potreros • {rot.areaTotal.toFixed(2)} Ha
                                </span>
                            </div>
                            {isAdmin && (
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button 
                                        onClick={() => setShowNuevoPotrero(rot.id)} 
                                        style={{ 
                                            width: 'auto', 
                                            padding: '6px 16px', 
                                            fontSize: '0.8rem', 
                                            borderRadius: '100px',
                                            backgroundColor: 'var(--primary)',
                                            color: 'white',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            textTransform: 'none',
                                            fontWeight: 600,
                                            border: 'none',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                                        }}
                                    >
                                        <Plus size={14} /> Potrero
                                    </button>
                                    <button onClick={() => deleteRotacion(rot.id)} style={{ width: 'auto', padding: '6px', background: 'none', color: 'rgba(244, 67, 54, 0.4)' }} title="Eliminar Rotación">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Tabla de Potreros dentro de la Rotación */}
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <th style={{ padding: '12px 24px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Potrero</th>
                                        <th style={{ padding: '12px 24px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', width: '120px' }}>Área (Ha)</th>
                                        {isAdmin && <th style={{ padding: '12px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', width: '100px' }}></th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rot.pots.length === 0 ? (
                                        <tr><td colSpan={isAdmin ? 3 : 2} style={{ padding: '20px 24px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay potreros asignados.</td></tr>
                                    ) : (
                                        rot.pots.map(p => (
                                            <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                                <td style={{ padding: '12px 24px' }}>
                                                    {editingPot === p.id ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            <input style={{ margin: 0, padding: '4px 8px' }} value={editPotForm.nombre} onChange={e => setEditPotForm({...editPotForm, nombre: e.target.value})} placeholder="Nombre" />
                                                            <select 
                                                                style={{ margin: 0, padding: '4px 8px', fontSize: '0.8rem' }}
                                                                value={editPotForm.id_rotacion}
                                                                onChange={e => setEditPotForm({...editPotForm, id_rotacion: e.target.value})}
                                                            >
                                                                <option value="">Sin Rotación</option>
                                                                {rotaciones.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                                                            </select>
                                                        </div>
                                                    ) : (
                                                        <span style={{ fontWeight: 500, color: 'white' }}>{p.nombre}</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px 24px', textAlign: 'right', width: '120px' }}>
                                                    {editingPot === p.id ? (
                                                        <input style={{ margin: 0, padding: '4px 8px', textAlign: 'right', width: '100%' }} type="number" step="0.01" value={editPotForm.area} onChange={e => setEditPotForm({...editPotForm, area: e.target.value})} />
                                                    ) : (
                                                        <span style={{ color: 'var(--primary-light)', fontFamily: 'monospace', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{p.area_hectareas?.toFixed(2)}</span>
                                                    )}
                                                </td>
                                                {isAdmin && (
                                                    <td style={{ padding: '12px 24px', textAlign: 'right' }}>
                                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                            {editingPot === p.id ? (
                                                                <>
                                                                    <button onClick={() => handleUpdatePotrero(p.id)} style={{ width: 'auto', padding: '4px', background: 'none' }}><Check size={18} color="var(--success)" /></button>
                                                                    <button onClick={() => setEditingPot(null)} style={{ width: 'auto', padding: '4px', background: 'none' }}><X size={18} color="var(--text-muted)" /></button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <button onClick={() => { setEditingPot(p.id); setEditPotForm({ nombre: p.nombre, area: p.area_hectareas.toString(), id_rotacion: p.id_rotacion || '' }); }} style={{ width: 'auto', padding: '4px', background: 'none', color: 'rgba(255,255,255,0.2)' }}><Edit2 size={16} /></button>
                                                                    <button onClick={() => deletePotrero(p.id)} style={{ width: 'auto', padding: '4px', background: 'none', color: 'rgba(255,255,255,0.1)' }}><Trash2 size={16} /></button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}

                {/* Potreros Sin Rotación */}
                {sinRotacion.length > 0 && (
                    <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px dashed rgba(255,255,255,0.1)' }}>
                        <div style={{ padding: '16px 24px', backgroundColor: 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <Info size={20} color="var(--text-muted)" />
                                <h3 style={{ margin: 0, color: 'var(--text-muted)' }}>Sin Rotación Asignada</h3>
                                <span style={{ fontSize: '0.8rem', backgroundColor: 'rgba(255,255,255,0.05)', padding: '2px 10px', borderRadius: '100px', color: 'var(--text-muted)' }}>
                                    {sinRotacion.length} potreros • {areaTotalSin.toFixed(2)} Ha
                                </span>
                            </div>
                            {isAdmin && (
                                <button 
                                    onClick={() => setShowNuevoPotrero('none')} 
                                    style={{ 
                                        width: 'auto', 
                                        padding: '6px 16px', 
                                        fontSize: '0.8rem', 
                                        borderRadius: '100px',
                                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        color: 'white',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        textTransform: 'none',
                                        fontWeight: 600
                                    }}
                                >
                                    <Plus size={14} /> Potrero
                                </button>
                            )}
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <tbody>
                                    {sinRotacion.map(p => (
                                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                            <td style={{ padding: '12px 24px' }}>
                                                {editingPot === p.id ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <input style={{ margin: 0, padding: '4px 8px' }} value={editPotForm.nombre} onChange={e => setEditPotForm({...editPotForm, nombre: e.target.value})} placeholder="Nombre" />
                                                        <select 
                                                            style={{ margin: 0, padding: '4px 8px', fontSize: '0.8rem' }}
                                                            value={editPotForm.id_rotacion}
                                                            onChange={e => setEditPotForm({...editPotForm, id_rotacion: e.target.value})}
                                                        >
                                                            <option value="">Sin Rotación</option>
                                                            {rotaciones.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                                                        </select>
                                                    </div>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)' }}>{p.nombre}</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 24px', textAlign: 'right', width: '120px' }}>
                                                {editingPot === p.id ? (
                                                    <input style={{ margin: 0, padding: '4px 8px', textAlign: 'right', width: '100%' }} type="number" step="0.01" value={editPotForm.area} onChange={e => setEditPotForm({...editPotForm, area: e.target.value})} />
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{p.area_hectareas?.toFixed(2)}</span>
                                                )}
                                            </td>
                                            {isAdmin && (
                                                <td style={{ padding: '12px 24px', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                        {editingPot === p.id ? (
                                                            <>
                                                                <button onClick={() => handleUpdatePotrero(p.id)} style={{ width: 'auto', padding: '4px', background: 'none' }}><Check size={18} color="var(--success)" /></button>
                                                                <button onClick={() => setEditingPot(null)} style={{ width: 'auto', padding: '4px', background: 'none' }}><X size={18} color="var(--text-muted)" /></button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button onClick={() => { setEditingPot(p.id); setEditPotForm({ nombre: p.nombre, area: p.area_hectareas.toString(), id_rotacion: '' }); }} style={{ width: 'auto', padding: '4px', background: 'none', color: 'rgba(255,255,255,0.2)' }}><Edit2 size={16} /></button>
                                                                <button onClick={() => deletePotrero(p.id)} style={{ width: 'auto', padding: '4px', background: 'none', color: 'rgba(255,255,255,0.1)' }}><Trash2 size={16} /></button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal Nuevo Potrero */}
            {showNuevoPotrero && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                    <div className="card" style={{ maxWidth: '400px', width: '100%' }}>
                        <h2>Añadir Potrero</h2>
                        <form onSubmit={(e) => handleAddPotrero(e, showNuevoPotrero === 'none' ? null : showNuevoPotrero)} style={{ marginTop: '20px' }}>
                            <label>Nombre del Potrero</label>
                            <input autoFocus type="text" value={nuevoPotForm.nombre} onChange={e => setNuevoPotForm({...nuevoPotForm, nombre: e.target.value})} placeholder="Ej: Lote 1" required />
                            <label>Área (Hectáreas)</label>
                            <input type="number" step="0.01" value={nuevoPotForm.area} onChange={e => setNuevoPotForm({...nuevoPotForm, area: e.target.value})} placeholder="0.00" required />
                            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                <button type="button" className="btn-secondary" onClick={() => setShowNuevoPotrero(null)}>Cancelar</button>
                                <button type="submit">Añadir</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

