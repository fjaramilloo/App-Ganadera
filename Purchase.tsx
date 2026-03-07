import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ShoppingCart, Plus, Trash2, CheckCircle2, Calendar } from 'lucide-react';

interface AnimalCompra {
    numero_chapeta: string;
    peso_ingreso: string;
    propietario: string;
}

export default function Purchase() {
    const { fincaId, role } = useAuth();
    const [cantidad, setCantidad] = useState('1');
    const [fechaIngreso, setFechaIngreso] = useState(new Date().toISOString().split('T')[0]);
    const [animales, setAnimales] = useState<AnimalCompra[]>([]);
    const [propietarios, setPropietarios] = useState<{ id: string, nombre: string }[]>([]);

    const [loading, setLoading] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');

    useEffect(() => {
        if (!fincaId) return;
        const fetchPropietarios = async () => {
            const { data } = await supabase
                .from('propietarios')
                .select('id, nombre')
                .eq('id_finca', fincaId)
                .order('nombre');
            if (data) setPropietarios(data);
        };
        fetchPropietarios();
    }, [fincaId]);

    const generarFilas = (e: React.FormEvent) => {
        e.preventDefault();
        const num = parseInt(cantidad);
        if (isNaN(num) || num <= 0) return;

        const nuevasFilas: AnimalCompra[] = Array.from({ length: num }, () => ({
            numero_chapeta: '',
            peso_ingreso: '',
            propietario: ''
        }));
        setAnimales(nuevasFilas);
        setMsjExito('');
        setMsjError('');
    };

    const updateAnimal = (index: number, field: keyof AnimalCompra, value: string) => {
        const newAnimales = [...animales];
        newAnimales[index] = { ...newAnimales[index], [field]: value };
        setAnimales(newAnimales);
    };

    const removeFila = (index: number) => {
        setAnimales(animales.filter((_, i) => i !== index));
    };

    const [showConfirm, setShowConfirm] = useState(false);

    const handleIngresarCompra = async () => {
        if (!fincaId || animales.length === 0) return;

        // Validaciones previas
        try {
            const chapetas = animales.map(a => a.numero_chapeta.trim());
            if (chapetas.some(c => !c)) throw new Error("Todas las chapetas son obligatorias.");
            if (new Set(chapetas).size !== chapetas.length) throw new Error("No puede haber chapetas duplicadas.");

            animales.forEach(a => {
                const peso = parseFloat(a.peso_ingreso);
                if (isNaN(peso) || peso <= 0) throw new Error(`Peso inválido para ${a.numero_chapeta}`);
                if (!a.propietario) throw new Error(`Falta propietario para ${a.numero_chapeta}`);
            });

            setShowConfirm(true);
            setMsjError('');
        } catch (err: any) {
            setMsjError(err.message);
        }
    };

    const confirmAndInsert = async () => {
        setLoading(true);
        setMsjError('');
        setShowConfirm(false);

        try {
            const records = animales.map(a => ({
                id_finca: fincaId,
                numero_chapeta: a.numero_chapeta.trim(),
                nombre_propietario: a.propietario,
                peso_ingreso: parseFloat(a.peso_ingreso),
                fecha_ingreso: fechaIngreso,
                etapa: 'levante',
                especie: 'bovino',
                sexo: 'M',
                estado: 'activo'
            }));

            const { data: nuevosAnimales, error } = await supabase.from('animales').insert(records).select();
            if (error) throw error;

            if (nuevosAnimales && nuevosAnimales.length > 0) {
                const pesajes = nuevosAnimales.map(animal => ({
                    id_animal: animal.id,
                    peso: animal.peso_ingreso,
                    fecha: animal.fecha_ingreso,
                    etapa: animal.etapa
                }));
                await supabase.from('registros_pesaje').insert(pesajes);
            }

            setMsjExito(`¡Éxito! Se crearon ${records.length} animales con su pesaje inicial.`);
            setAnimales([]);
            setCantidad('1');
        } catch (err: any) {
            setMsjError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setAnimales([]);
        setCantidad('1');
        setMsjError('');
        setMsjExito('');
    };

    if (role === 'observador') {
        return <div className="page-container text-center">Acceso denegado.</div>;
    }

    return (
        <div className="page-container">
            {/* Modal de Confirmación */}
            {showConfirm && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
                    <div className="card" style={{ maxWidth: '450px', width: '100%', textAlign: 'center', border: '1px solid var(--primary)' }}>
                        <ShoppingCart size={40} color="var(--primary)" style={{ marginBottom: '16px' }} />
                        <h2 style={{ marginBottom: '12px' }}>Validar Información</h2>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
                            ¿Estás seguro de ingresar estos <b>{animales.length} animales</b>? <br />
                            Fecha de entrada: <b>{fechaIngreso}</b>
                        </p>
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <button onClick={() => setShowConfirm(false)} style={{ backgroundColor: 'transparent', border: '1px solid var(--text-muted)' }}>
                                Cancelar
                            </button>
                            <button onClick={confirmAndInsert} style={{ backgroundColor: 'var(--primary)' }}>
                                Sí, ingresar ahora
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <ShoppingCart size={32} /> Ingreso de Compra
            </h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Módulo para el registro masivo de animales nuevos.</p>

            {msjExito && <div style={{ backgroundColor: 'rgba(76, 175, 80, 0.2)', color: 'var(--success)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold' }}>{msjExito}</div>}
            {msjError && <div style={{ backgroundColor: 'rgba(244, 67, 54, 0.15)', color: 'var(--error)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold' }}>{msjError}</div>}

            <div className="card" style={{ marginBottom: '32px' }}>
                <form onSubmit={generarFilas} style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 150px' }}>
                        <label>Cantidad de Animales</label>
                        <input
                            type="number"
                            min="1"
                            max="100"
                            value={cantidad}
                            onChange={e => setCantidad(e.target.value)}
                            disabled={loading || animales.length > 0}
                        />
                    </div>
                    <div style={{ flex: '1 1 200px' }}>
                        <label>Fecha de Entrada</label>
                        <div style={{ position: 'relative' }}>
                            <Calendar size={18} style={{ position: 'absolute', left: '12px', top: '16px', color: 'var(--text-muted)' }} />
                            <input
                                type="date"
                                value={fechaIngreso}
                                onChange={e => setFechaIngreso(e.target.value)}
                                style={{ paddingLeft: '40px' }}
                                disabled={loading || animales.length > 0}
                            />
                        </div>
                    </div>
                    {animales.length === 0 ? (
                        <button type="submit" style={{ width: 'auto', padding: '0 32px' }} disabled={loading}>
                            <Plus size={18} /> Preparar Lista
                        </button>
                    ) : (
                        <button type="button" onClick={handleReset} style={{ width: 'auto', backgroundColor: 'transparent', border: '1px solid var(--error)', color: 'var(--error)', padding: '0 32px' }}>
                            <Trash2 size={18} /> Cancelar / Reiniciar
                        </button>
                    )}
                </form>
            </div>

            {animales.length > 0 && (
                <div className="glass-panel" style={{ padding: 0, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <th style={{ padding: '16px', color: 'var(--text-muted)', width: '60px' }}>Item</th>
                                <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Nro. Chapeta</th>
                                <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Peso Entrada (kg)</th>
                                <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Propietario</th>
                                <th style={{ padding: '16px', width: '50px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {animales.map((a, index) => (
                                <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{index + 1}</td>
                                    <td style={{ padding: '8px 16px' }}>
                                        <input
                                            type="text"
                                            placeholder="Ej. 1024"
                                            value={a.numero_chapeta}
                                            onChange={e => updateAnimal(index, 'numero_chapeta', e.target.value)}
                                            style={{ marginBottom: 0, padding: '10px' }}
                                        />
                                    </td>
                                    <td style={{ padding: '8px 16px' }}>
                                        <input
                                            type="number"
                                            step="0.1"
                                            placeholder="Ej. 250"
                                            value={a.peso_ingreso}
                                            onChange={e => updateAnimal(index, 'peso_ingreso', e.target.value)}
                                            style={{ marginBottom: 0, padding: '10px' }}
                                        />
                                    </td>
                                    <td style={{ padding: '8px 16px' }}>
                                        <select
                                            value={a.propietario}
                                            onChange={e => updateAnimal(index, 'propietario', e.target.value)}
                                            style={{ marginBottom: 0, padding: '10px' }}
                                        >
                                            <option value="">Seleccionar...</option>
                                            {propietarios.map(p => (
                                                <option key={p.id} value={p.nombre}>{p.nombre}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <button
                                            onClick={() => removeFila(index)}
                                            style={{ backgroundColor: 'transparent', padding: '4px', color: 'rgba(255,255,255,0.2)', width: 'auto' }}
                                            onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
                                            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.2)'}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div style={{ padding: '32px', display: 'flex', justifyContent: 'center' }}>
                        <button
                            onClick={handleIngresarCompra}
                            disabled={loading}
                            style={{ maxWidth: '400px', fontSize: '1.2rem', padding: '16px 48px' }}
                        >
                            {loading ? 'Procesando Ingreso...' : (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <CheckCircle2 size={24} /> Confirmar Ingreso de {animales.length} Animales
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
