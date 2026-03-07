import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Search, Skull, Calendar, AlertCircle } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';

interface Pesaje {
    peso: number;
    fecha: string;
    gdp_calculada: number;
}

interface Animal {
    id: string;
    numero_chapeta: string;
    nombre_propietario: string;
    especie: string;
    sexo: string;
    etapa: string;
    peso_ingreso: number;
    fecha_ingreso: string;
    estado: string;
    registros_pesaje: Pesaje[];
}

export default function Inventory() {
    const { fincaId, role } = useAuth();
    const [animales, setAnimales] = useState<Animal[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterEtapa, setFilterEtapa] = useState('');
    const [umbralGdp, setUmbralGdp] = useState(0.434);

    // Estados para Muerte
    const [showMuerteModal, setShowMuerteModal] = useState(false);
    const [chapetaMuerte, setChapetaMuerte] = useState('');
    const [fechaMuerte, setFechaMuerte] = useState(new Date().toISOString().split('T')[0]);
    const [msjErrorMuerte, setMsjErrorMuerte] = useState('');

    const fetchAnimales = async () => {
        if (!fincaId) return;
        setLoading(true);

        const { data: config } = await supabase
            .from('configuracion_kpi')
            .select('umbral_bajo_gdp')
            .eq('id_finca', fincaId)
            .single();
        if (config) setUmbralGdp(config.umbral_bajo_gdp);

        const { data, error } = await supabase
            .from('animales')
            .select(`
                *,
                registros_pesaje (
                    peso,
                    fecha,
                    gdp_calculada
                )
            `)
            .eq('id_finca', fincaId)
            .eq('estado', 'activo')
            .order('creado_en', { ascending: false });

        if (!error && data) {
            const dataProcesada = data.map((a: any) => ({
                ...a,
                registros_pesaje: (a.registros_pesaje || []).sort((x: any, y: any) =>
                    new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
                )
            }));
            setAnimales(dataProcesada);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchAnimales();
    }, [fincaId]);

    const handleReportarMuerte = async () => {
        if (!fincaId || !chapetaMuerte.trim()) return;
        setLoading(true);
        setMsjErrorMuerte('');

        try {
            // 1. Validar que el animal existe y está activo
            const { data: animal, error: searchError } = await supabase
                .from('animales')
                .select('id')
                .eq('id_finca', fincaId)
                .eq('numero_chapeta', chapetaMuerte.trim())
                .eq('estado', 'activo')
                .single();

            if (searchError || !animal) {
                throw new Error("Animal no encontrado o no está activo en esta finca.");
            }

            // 2. Marcar como muerto
            const { error: updateError } = await supabase
                .from('animales')
                .update({
                    estado: 'muerto',
                    fecha_muerte: fechaMuerte
                })
                .eq('id', animal.id);

            if (updateError) throw updateError;

            // 3. Opcional: Podríamos guardar la fecha de muerte en algún lado, 
            // pero el esquema actual solo tiene 'estado'. 
            // Por ahora solo inactivamos.

            setShowMuerteModal(false);
            setChapetaMuerte('');
            fetchAnimales();
            alert(`Se ha registrado el fallecimiento del animal #${chapetaMuerte}`);
        } catch (err: any) {
            setMsjErrorMuerte(err.message);
        } finally {
            setLoading(false);
        }
    };

    const filteredAnimals = animales.filter(a => {
        const matchesSearch = a.numero_chapeta.toLowerCase().includes(searchTerm.toLowerCase()) ||
            a.nombre_propietario.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesEtapa = filterEtapa ? a.etapa === filterEtapa : true;
        return matchesSearch && matchesEtapa;
    });

    return (
        <div className="page-container">
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '16px' }}>
                <h1 className="title" style={{ margin: 0 }}>Animales de la Finca</h1>

                {role !== 'observador' && (
                    <button
                        onClick={() => setShowMuerteModal(true)}
                        style={{ width: 'auto', backgroundColor: 'var(--error)', border: 'none' }}
                    >
                        <Skull size={18} /> Reportar muerte
                    </button>
                )}
            </div>

            <div className="glass-panel" style={{ marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
                <div style={{ flex: '1 1 300px', position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '16px', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="Buscar por chapeta o propietario..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ marginBottom: 0, paddingLeft: '40px' }}
                    />
                </div>
                <div style={{ flex: '1 1 200px', position: 'relative' }}>
                    <select
                        value={filterEtapa}
                        onChange={(e) => setFilterEtapa(e.target.value)}
                        style={{ marginBottom: 0 }}
                    >
                        <option value="">Todas las etapas</option>
                        <option value="cria">Cría</option>
                        <option value="levante">Levante</option>
                        <option value="ceba">Ceba</option>
                    </select>
                </div>
            </div>

            <div className="glass-panel" style={{ overflowX: 'auto', padding: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '900px' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Chapeta</th>
                            <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Propietario / Etapa</th>
                            <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Último Pesaje</th>
                            <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Último Peso</th>
                            <th style={{ padding: '16px', color: 'var(--text-muted)' }}>GMP Promedio</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} style={{ padding: '44px', textAlign: 'center', color: 'var(--primary)' }}>Cargando datos del hato...</td></tr>
                        ) : filteredAnimals.length === 0 ? (
                            <tr><td colSpan={5} style={{ padding: '44px', textAlign: 'center' }}>No hay animales registrados.</td></tr>
                        ) : (
                            filteredAnimals.map((animal) => {
                                const ultimoP = animal.registros_pesaje?.[0];
                                const fechaU = ultimoP ? format(new Date(ultimoP.fecha), 'dd/MM/yyyy', { locale: es }) : 'Sin pesajes';
                                const pesoU = ultimoP ? `${ultimoP.peso} kg` : `${animal.peso_ingreso} kg*`;

                                const fechaReferencia = ultimoP ? new Date(ultimoP.fecha) : new Date();
                                const pesoReferencia = ultimoP ? ultimoP.peso : animal.peso_ingreso;
                                const dias = differenceInDays(fechaReferencia, new Date(animal.fecha_ingreso)) || 1;
                                const gananciaTotal = pesoReferencia - animal.peso_ingreso;
                                const gmpPromedio = (gananciaTotal / dias) * 30;

                                const gdpActual = ultimoP?.gdp_calculada ?? (gananciaTotal / dias);
                                const isAlerta = gdpActual < umbralGdp;

                                return (
                                    <tr key={animal.id} style={{
                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                        backgroundColor: isAlerta ? 'rgba(244, 67, 54, 0.05)' : 'transparent',
                                        transition: 'background 0.2s'
                                    }}>
                                        <td style={{ padding: '16px', fontWeight: 'bold', fontSize: '1.1rem' }}>
                                            <span style={{ color: 'var(--primary-light)' }}>#</span>{animal.numero_chapeta}
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <div style={{ fontWeight: '500' }}>{animal.nombre_propietario}</div>
                                            <div style={{ fontSize: '0.8rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{animal.etapa}</div>
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <div style={{ color: 'white' }}>{fechaU}</div>
                                            {!ultimoP && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Fecha de ingreso</div>}
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <div style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>{pesoU}</div>
                                            {ultimoP && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>+{(ultimoP.peso - animal.peso_ingreso).toFixed(1)} kg ganados</div>}
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                color: isAlerta ? 'var(--error)' : 'var(--success)',
                                                fontWeight: 'bold'
                                            }}>
                                                {gmpPromedio.toFixed(1)} kg/mes
                                                {isAlerta && <span title="Bajo el umbral configurado">⚠️</span>}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>Promedio histórico</div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
            {/* Modal Reporte de Muerte */}
            {showMuerteModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
                    <div className="card" style={{ maxWidth: '450px', width: '100%', border: '1px solid var(--error)' }}>
                        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                            <Skull size={48} color="var(--error)" style={{ marginBottom: '16px' }} />
                            <h2 style={{ color: 'white' }}>Reportar Fallecimiento</h2>
                            <p style={{ color: 'var(--text-muted)' }}>Esta acción inactivará al animal permanentemente.</p>
                        </div>

                        {msjErrorMuerte && (
                            <div style={{ backgroundColor: 'rgba(244, 67, 54, 0.1)', color: 'var(--error)', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <AlertCircle size={16} /> {msjErrorMuerte}
                            </div>
                        )}

                        <div style={{ marginBottom: '20px' }}>
                            <label>Número de Chapeta</label>
                            <input
                                type="text"
                                placeholder="Ej: 1234"
                                value={chapetaMuerte}
                                onChange={e => setChapetaMuerte(e.target.value)}
                                style={{ fontSize: '1.2rem' }}
                            />
                        </div>

                        <div style={{ marginBottom: '32px' }}>
                            <label>Fecha de Fallecimiento</label>
                            <div style={{ position: 'relative' }}>
                                <Calendar size={18} style={{ position: 'absolute', left: '12px', top: '16px', color: 'var(--text-muted)' }} />
                                <input
                                    type="date"
                                    value={fechaMuerte}
                                    onChange={e => setFechaMuerte(e.target.value)}
                                    style={{ paddingLeft: '40px' }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '16px' }}>
                            <button
                                onClick={() => { setShowMuerteModal(false); setMsjErrorMuerte(''); }}
                                style={{ backgroundColor: 'transparent', border: '1px solid var(--text-muted)' }}
                                disabled={loading}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleReportarMuerte}
                                style={{ backgroundColor: 'var(--error)' }}
                                disabled={loading || !chapetaMuerte}
                            >
                                {loading ? 'Procesando...' : 'Confirmar Fallecimiento'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
