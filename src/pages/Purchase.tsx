import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ShoppingCart, Plus, Trash2, CheckCircle2, Calendar } from 'lucide-react';
import PurchaseReport from '../components/PurchaseReport';

interface AnimalCompra {
    numero_chapeta: string;
    peso_ingreso: string;
    propietario: string;
}

export default function Purchase() {
    const { fincaId, role, userFincas } = useAuth();
    const [cantidad, setCantidad] = useState('1');
    const [fechaIngreso, setFechaIngreso] = useState(new Date().toISOString().split('T')[0]);
    const [animales, setAnimales] = useState<AnimalCompra[]>([]);
    const [propietarios, setPropietarios] = useState<{ id: string, nombre: string }[]>([]);
    const [proveedores, setProveedores] = useState<{ id: string, nombre: string }[]>([]);
    const [selectedProveedor, setSelectedProveedor] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [incluirPesoCompra, setIncluirPesoCompra] = useState(false);
    const [pesoCompraTotal, setPesoCompraTotal] = useState('');

    const [loading, setLoading] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');

    // Reporte
    const [showReport, setShowReport] = useState(false);
    const [reportData, setReportData] = useState<{ fecha: string, animales: AnimalCompra[] } | null>(null);

    useEffect(() => {
        if (!fincaId) return;
        const fetchPropietarios = async () => {
            const { data } = await supabase
                .from('propietarios')
                .select('id, nombre')
                .eq('id_finca', fincaId)
                .order('nombre');
            if (data) setPropietarios(data);

            const { data: provData } = await supabase
                .from('proveedores')
                .select('id, nombre')
                .eq('id_finca', fincaId)
                .order('nombre');
            if (provData) setProveedores(provData);
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

        setLoading(true);
        setMsjError('');

        try {
            if (!selectedProveedor) throw new Error("Debe seleccionar un Vendedor/Proveedor para la compra.");

            const chapetas = animales.map(a => a.numero_chapeta.trim());
            if (chapetas.some(c => !c)) throw new Error("Todas las chapetas son obligatorias.");
            if (new Set(chapetas).size !== chapetas.length) throw new Error("No puede haber chapetas duplicadas en la lista actual.");

            animales.forEach(a => {
                const peso = parseFloat(a.peso_ingreso);
                if (isNaN(peso) || peso <= 0) throw new Error(`Peso inválido para ${a.numero_chapeta}`);
                if (!a.propietario) throw new Error(`Falta propietario para ${a.numero_chapeta}`);
            });

            // Registro de chapetas existentes en la base de datos
            const { data: existentes, error: checkError } = await supabase
                .from('animales')
                .select('numero_chapeta')
                .eq('id_finca', fincaId)
                .in('numero_chapeta', chapetas);

            if (checkError) throw checkError;

            if (existentes && existentes.length > 0) {
                const caps = existentes.map(e => e.numero_chapeta).join(', ');
                throw new Error(`Las siguientes chapetas ya están registradas en esta finca: ${caps}`);
            }

            setShowConfirm(true);
        } catch (err: any) {
            setMsjError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const confirmAndInsert = async () => {
        setLoading(true);
        setMsjError('');
        setShowConfirm(false);

        try {
            const [, month, day] = fechaIngreso.split('-');
            const dateStr = `${day}/${month}`;
            
            const uniquePropietarios = Array.from(new Set(animales.map(a => a.propietario)));
            
            const potreradasPayload = uniquePropietarios.map(prop => ({
                id_finca: fincaId,
                nombre: `Compra ${dateStr} ${prop}`,
                etapa: 'levante'
            }));
            
            const { data: potreradasCreadas, error: potError } = await supabase
                .from('potreradas')
                .upsert(potreradasPayload, { onConflict: 'id_finca,nombre' })
                .select('id, nombre');
                
            if (potError) throw potError;
            
            const potreradaIdPorPropietario = new Map();
            if (potreradasCreadas) {
                potreradasCreadas.forEach((p: any) => {
                    const propMatch = uniquePropietarios.find(prop => p.nombre === `Compra ${dateStr} ${prop}`);
                    if (propMatch) {
                        potreradaIdPorPropietario.set(propMatch, p.id);
                    }
                });
            }

            const records = animales.map(a => ({
                id_finca: fincaId,
                numero_chapeta: a.numero_chapeta.trim(),
                nombre_propietario: a.propietario,
                id_potrerada: potreradaIdPorPropietario.get(a.propietario) || null,
                peso_ingreso: parseFloat(a.peso_ingreso),
                fecha_ingreso: fechaIngreso,
                proveedor_compra: selectedProveedor,
                observaciones_compra: observaciones,
                etapa: 'levante',
                especie: 'bovino',
                sexo: 'M',
                estado: 'activo'
            }));

            const { error } = await supabase.from('animales').insert(records);
            if (error) throw error;

            setMsjExito(`¡Éxito! Se crearon ${records.length} animales correctamente.`);

            // Guardar para el reporte antes de limpiar
            setReportData({
                fecha: fechaIngreso,
                animales: [...animales]
            });
            setShowReport(true);

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
        setSelectedProveedor('');
        setObservaciones('');
        setIncluirPesoCompra(false);
        setPesoCompraTotal('');
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
                <form onSubmit={generarFilas} style={{ display: 'flex', gap: '20px', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
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

                        <div style={{ flex: '1 1 250px' }}>
                            <label>Vendedor / Proveedor</label>
                            <select
                                value={selectedProveedor}
                                onChange={e => setSelectedProveedor(e.target.value)}
                                disabled={loading || animales.length > 0}
                                required
                            >
                                <option value="">Seleccione un Proveedor...</option>
                                {proveedores.map(p => (
                                    <option key={p.id} value={p.nombre}>{p.nombre}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 100%' }}>
                            <label>Observaciones de la Compra</label>
                            <input
                                type="text"
                                placeholder="Ej: Lote comprado en subasta, buena genética..."
                                value={observaciones}
                                onChange={e => setObservaciones(e.target.value)}
                                disabled={loading || animales.length > 0}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <input 
                                type="checkbox" 
                                id="checkPesoCompra"
                                checked={incluirPesoCompra}
                                onChange={e => setIncluirPesoCompra(e.target.checked)}
                                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                                disabled={loading || animales.length > 0}
                            />
                            <label htmlFor="checkPesoCompra" style={{ cursor: 'pointer', margin: 0 }}>¿Incluir Peso de Compra del lote?</label>
                        </div>

                        {incluirPesoCompra && (
                            <div style={{ maxWidth: '300px' }}>
                                <label>Peso Total de Compra (kg)</label>
                                <input 
                                    type="number" 
                                    step="0.1"
                                    placeholder="Peso total pagado..."
                                    value={pesoCompraTotal}
                                    onChange={e => setPesoCompraTotal(e.target.value)}
                                    disabled={loading || animales.length > 0}
                                />
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Este peso se dividirá automáticamente entre el número de animales.</p>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
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
                        
                        {animales.length === 0 ? (
                            <button type="submit" style={{ width: 'auto', padding: '0 32px' }} disabled={loading}>
                                <Plus size={18} /> Preparar Lista
                            </button>
                        ) : (
                            <button type="button" onClick={handleReset} style={{ width: 'auto', backgroundColor: 'transparent', border: '1px solid var(--error)', color: 'var(--error)', padding: '0 32px' }}>
                                <Trash2 size={18} /> Cancelar / Reiniciar
                            </button>
                        )}
                    </div>
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

            {showReport && reportData && (
                <PurchaseReport
                    fincaNombre={userFincas.find((f: any) => f.id_finca === fincaId)?.nombre_finca || 'Finca'}
                    fechaIngreso={reportData.fecha}
                    animales={reportData.animales}
                    onClose={() => setShowReport(false)}
                />
            )}
        </div>
    );
}
