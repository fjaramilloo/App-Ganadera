import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { CloudRain, Plus, Trash2, Calendar, Droplets } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface RegistroLluvia {
    id: string;
    fecha: string;
    milimetros: number;
    notas: string;
    creado_en: string;
}

export default function Rainfall() {
    const { fincaId } = useAuth();
    const [registros, setRegistros] = useState<RegistroLluvia[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);

    // Formulario
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
    const [milimetros, setMilimetros] = useState('');
    const [notas, setNotas] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchRegistros();
    }, [fincaId]);

    const fetchRegistros = async () => {
        if (!fincaId) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('registros_lluvia')
                .select('*')
                .eq('id_finca', fincaId)
                .order('fecha', { ascending: false });

            if (error) throw error;
            setRegistros(data || []);
        } catch (err: any) {
            console.error('Error fetching rainfall:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleGuardar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId || !milimetros) return;

        setSaving(true);
        setError('');
        try {
            const { error: insertErr } = await supabase
                .from('registros_lluvia')
                .insert({
                    id_finca: fincaId,
                    fecha,
                    milimetros: parseFloat(milimetros),
                    notas: notas.trim() || null
                });

            if (insertErr) throw insertErr;

            setShowModal(false);
            setMilimetros('');
            setNotas('');
            fetchRegistros();
        } catch (err: any) {
            setError(err.message || 'Error al guardar el registro');
        } finally {
            setSaving(false);
        }
    };

    const handleEliminar = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar este registro?')) return;

        try {
            const { error } = await supabase
                .from('registros_lluvia')
                .delete()
                .eq('id', id);

            if (error) throw error;
            fetchRegistros();
        } catch (err: any) {
            alert('Error al eliminar: ' + err.message);
        }
    };

    return (
        <div className="page-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h1 className="title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <CloudRain size={32} color="var(--primary-light)" />
                        Registro de Lluvias
                    </h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Control de pluviosidad diaria por finca (mm)</p>
                </div>
                <button
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px' }}
                    onClick={() => setShowModal(true)}
                >
                    <Plus size={20} />
                    Nuevo Registro
                </button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Cargando registros...</div>
            ) : registros.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                    <Droplets size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
                    <p>No hay registros de lluvia para esta finca.</p>
                    <button className="btn btn-primary" style={{ marginTop: '20px' }} onClick={() => setShowModal(true)}>Registrar Primera Lluvia</button>
                </div>
            ) : (
                <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Fecha</th>
                                    <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Hora de Ingreso</th>
                                    <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Precipitación</th>
                                    <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Notas</th>
                                    <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'right' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {registros.map((r) => (
                                    <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.2s ease' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.01)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Calendar size={16} color="var(--primary-light)" />
                                                <span style={{ fontWeight: '500' }}>
                                                    {format(new Date(r.fecha + 'T12:00:00'), 'dd MMM yyyy', { locale: es })}
                                                </span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 24px', color: 'var(--text-muted)' }}>
                                            {format(new Date(r.creado_en), 'HH:mm', { locale: es })}
                                        </td>
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary-light)' }}>{r.milimetros}</span>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>mm</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 24px', color: 'var(--text-muted)', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {r.notas ? `"${r.notas}"` : '-'}
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                            <button
                                                onClick={() => handleEliminar(r.id)}
                                                style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', opacity: 0.6, padding: '4px' }}
                                                title="Eliminar registro"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {showModal && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '450px', padding: '32px' }}>
                        <h2 style={{ marginBottom: '24px', fontSize: '1.5rem' }}>Registrar Lluvia Diaria</h2>
                        <form onSubmit={handleGuardar}>
                            <div className="form-group" style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Fecha</label>
                                <input
                                    type="date"
                                    className="input-field"
                                    value={fecha}
                                    onChange={(e) => setFecha(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Precipitación (mm)</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="input-field"
                                        placeholder="Ej: 150.5"
                                        value={milimetros}
                                        onChange={(e) => setMilimetros(e.target.value)}
                                        required
                                        style={{ paddingRight: '45px' }}
                                    />
                                    <span style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>mm</span>
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: '24px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Notas (Opcional)</label>
                                <textarea
                                    className="input-field"
                                    placeholder="Ej: Llovió toda la tarde"
                                    value={notas}
                                    onChange={(e) => setNotas(e.target.value)}
                                    rows={3}
                                    style={{ resize: 'none' }}
                                />
                            </div>

                            {error && <p style={{ color: 'var(--error)', marginBottom: '16px', fontSize: '0.9rem' }}>{error}</p>}

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button type="button" className="btn" style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)' }} onClick={() => setShowModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={saving}>
                                    {saving ? 'Guardando...' : 'Guardar Registro'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
