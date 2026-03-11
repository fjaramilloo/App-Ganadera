import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { MapPin, Plus, Trash2 } from 'lucide-react';

export default function Rotations() {
    const { fincaId, role } = useAuth();
    const [loading, setLoading] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');

    const [rotaciones, setRotaciones] = useState<{ id: string, nombre: string, potreros: { id: string, nombre: string, area_hectareas: number }[] }[]>([]);
    const [nuevaRotacionNombre, setNuevaRotacionNombre] = useState('');
    const [nuevoPotreroRotacion, setNuevoPotreroRotacion] = useState<string | null>(null);
    const [nuevoPotreroNombre, setNuevoPotreroNombre] = useState('');
    const [nuevoPotreroArea, setNuevoPotreroArea] = useState('');

    const isAdmin = role === 'administrador';

    const fetchRotaciones = async () => {
        if (!fincaId) return;
        const { data, error } = await supabase
            .from('rotaciones')
            .select(`
                id, 
                nombre, 
                potreros (id, nombre, area_hectareas)
            `)
            .eq('id_finca', fincaId)
            .order('nombre');

        if (!error && data) setRotaciones(data as any);
    };

    useEffect(() => {
        fetchRotaciones();
    }, [fincaId]);

    const handleAddRotacion = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isAdmin || !fincaId || !nuevaRotacionNombre.trim()) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('rotaciones')
                .insert({ id_finca: fincaId, nombre: nuevaRotacionNombre.trim() });

            if (error) throw error;

            setNuevaRotacionNombre('');
            fetchRotaciones();
            setMsjExito('Rotación creada correctamente.');
        } catch (err: any) {
            setMsjError('Error creanda rotación: ' + (err.code === '23505' ? 'Ya existe una rotación con ese nombre.' : err.message));
        } finally {
            setLoading(false);
        }
    };

    const removeRotacion = async (id: string) => {
        if (!isAdmin || !confirm('¿Está seguro de eliminar esta rotación? Sus potreros quedarán sin rotación asignada.')) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('rotaciones').delete().eq('id', id);
            if (error) throw error;
            fetchRotaciones();
            setMsjExito('Rotación eliminada.');
        } catch (err: any) {
            setMsjError('Error al eliminar rotación: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddPotrero = async (e: React.FormEvent, id_rotacion: string) => {
        e.preventDefault();
        if (!isAdmin || !fincaId || !nuevoPotreroNombre.trim() || !nuevoPotreroArea) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('potreros')
                .insert({ 
                    id_finca: fincaId, 
                    id_rotacion, 
                    nombre: nuevoPotreroNombre.trim(), 
                    area_hectareas: parseFloat(nuevoPotreroArea)
                });

            if (error) throw error;

            setNuevoPotreroNombre('');
            setNuevoPotreroArea('');
            setNuevoPotreroRotacion(null);
            fetchRotaciones();
            setMsjExito('Potrero agregado a la rotación.');
        } catch (err: any) {
            setMsjError('Error al agregar el potrero: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const removePotrero = async (id: string) => {
        if (!isAdmin || !confirm('¿Está seguro de eliminar este potrero? Esta acción puede afectar pesajes vinculados a él.')) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('potreros').delete().eq('id', id);
            if (error) throw error;
            fetchRotaciones();
            setMsjExito('Potrero eliminado.');
        } catch (err: any) {
            setMsjError('Error al eliminar potrero: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container" style={{ maxWidth: '800px' }}>
            <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'left', marginBottom: '32px' }}>
                <MapPin size={32} /> Rotaciones y Potreros
            </h1>

            {msjExito && <div style={{ backgroundColor: 'rgba(76, 175, 80, 0.2)', color: 'var(--success)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold' }}>{msjExito}</div>}
            {msjError && <div style={{ backgroundColor: 'rgba(244, 67, 54, 0.15)', color: 'var(--error)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'pre-line' }}>{msjError}</div>}

            <div className="card">
                <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9em' }}>
                    Organice sus potreros en rotaciones específicas.
                </p>

                {isAdmin && (
                <form onSubmit={handleAddRotacion} style={{ display: 'flex', gap: '12px', marginBottom: '32px' }}>
                    <input
                        type="text"
                        placeholder="Nombre de la Nueva Rotación (ej. Rotación Norte)"
                        value={nuevaRotacionNombre}
                        onChange={e => setNuevaRotacionNombre(e.target.value)}
                        style={{ marginBottom: 0 }}
                        disabled={loading}
                    />
                    <button type="submit" style={{ width: 'auto' }} disabled={loading || !nuevaRotacionNombre.trim()}>
                        <Plus size={18} /> Crear Rotación
                    </button>
                </form>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {rotaciones.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '8px' }}>
                            No hay rotaciones definidas para esta finca.
                        </div>
                    ) : (
                        rotaciones.map(rot => (
                            <div key={rot.id} style={{
                                backgroundColor: 'rgba(255,255,255,0.02)',
                                borderRadius: '10px',
                                border: '1px solid rgba(255,255,255,0.05)',
                                padding: '20px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                                    <h4 style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                                        {rot.nombre}
                                        <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--primary)', color: 'white', padding: '2px 8px', borderRadius: '12px' }}>
                                            {rot.potreros?.length || 0} potreros
                                        </span>
                                    </h4>
                                    {isAdmin && (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={() => setNuevoPotreroRotacion(nuevoPotreroRotacion === rot.id ? null : rot.id)}
                                            style={{ backgroundColor: 'transparent', padding: '6px 12px', border: '1px solid var(--primary)', color: 'var(--primary)', width: 'auto', fontSize: '0.8rem' }}
                                        >
                                            {nuevoPotreroRotacion === rot.id ? 'Cancelar' : '+ Añadir Potrero'}
                                        </button>
                                        <button
                                            onClick={() => removeRotacion(rot.id)}
                                            style={{ backgroundColor: 'transparent', padding: '6px', color: 'var(--text-muted)', width: 'auto' }}
                                            onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
                                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                                            title="Eliminar Rotación"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                    )}
                                </div>

                                {isAdmin && nuevoPotreroRotacion === rot.id && (
                                    <form onSubmit={(e) => handleAddPotrero(e, rot.id)} style={{ display: 'flex', gap: '12px', marginBottom: '16px', padding: '16px', backgroundColor: 'var(--bg-card)', borderRadius: '8px' }}>
                                        <input
                                            type="text"
                                            placeholder="Nombre (ej. Potrero 1)"
                                            value={nuevoPotreroNombre}
                                            onChange={e => setNuevoPotreroNombre(e.target.value)}
                                            style={{ marginBottom: 0, flex: 2 }}
                                            required
                                        />
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0.01"
                                            placeholder="Área (Hectáreas)"
                                            value={nuevoPotreroArea}
                                            onChange={e => setNuevoPotreroArea(e.target.value)}
                                            style={{ marginBottom: 0, flex: 1 }}
                                            required
                                        />
                                        <button type="submit" style={{ width: 'auto', padding: '0 16px' }} disabled={loading}>
                                            Guardar
                                        </button>
                                    </form>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                                    {(!rot.potreros || rot.potreros.length === 0) ? (
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Aún no hay potreros en esta rotación.</span>
                                    ) : (
                                        rot.potreros.map(pot => (
                                            <div key={pot.id} style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px'
                                            }}>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontSize: '0.9rem', color: 'white' }}>{pot.nombre}</span>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{pot.area_hectareas} Ha</span>
                                                </div>
                                                {isAdmin && (
                                                <Trash2
                                                    size={14}
                                                    style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.3)' }}
                                                    onClick={() => removePotrero(pot.id)}
                                                    onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
                                                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
                                                />
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
