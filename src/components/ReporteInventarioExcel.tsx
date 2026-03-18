import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Download, Loader2, FileSpreadsheet } from 'lucide-react';
import { differenceInDays, format } from 'date-fns';
import * as XLSX from 'xlsx';

interface Props {
  onClose: () => void;
}

export default function ReporteInventarioExcel({ onClose }: Props) {
  const { fincaId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<any[]>([]);
  const [marcas, setMarcas] = useState<string[]>([]);

  useEffect(() => {
    async function fetchData() {
      if (!fincaId) return;
      try {
        setLoading(true);
        // 1. Obtener animales activos
        const { data: animalesData, error: anErr } = await supabase
          .from('animales')
          .select(`
            id, numero_chapeta, nombre_propietario, peso_ingreso, fecha_ingreso, etapa, id_potrero_actual,
            potreros ( nombre, id_rotacion ),
            registros_pesaje ( peso, fecha, gdp_calculada )
          `)
          .eq('estado', 'activo')
          .eq('id_finca', fincaId);

        if (anErr) throw anErr;

        // 2. Obtener rotaciones
        const { data: rotacionesData, error: rotErr } = await supabase
          .from('rotaciones_potreros')
          .select('id, nombre')
          .eq('id_finca', fincaId);

        if (rotErr) throw rotErr;

        // 3. Obtener potreros (por si hay potreros sin animales en este momento pero se quieren mapear, aunque los animales traen su potrero)
        const rotacionesMap = new Map((rotacionesData || []).map(r => [r.id, r.nombre]));

        const hoy = new Date();
        hoy.setHours(0,0,0,0);

        // Lógica de agrupamiento estructurada: Rotación -> Potrero -> Animal(es)
        const group: Record<string, Record<string, any>> = {};
        const marcasSet = new Set<string>();

        let gdpsTotales: number[] = [];

        animalesData?.forEach((a: any) => {
          let registros = (a.registros_pesaje || []).sort((x: any, y: any) =>
              new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
          );
          
          const unique = new Set();
          registros = registros.filter((p: any) => {
              const dateOnly = p.fecha.split('T')[0];
              if (unique.has(dateOnly)) return false;
              unique.add(dateOnly);
              return true;
          });

          const ultimoP = registros[0];
          const potreroObj = a.potreros;
          const potreroName = potreroObj?.nombre || 'Sin Asignar';
          const rotacionId = potreroObj?.id_rotacion;
          const rotacionName = rotacionId ? (rotacionesMap.get(rotacionId) || 'Otra/Sin Rotación') : 'Otra/Sin Rotación';

          const marca = a.nombre_propietario ? a.nombre_propietario.trim() : 'ND';
          marcasSet.add(marca);

          // Referencia de GMP global por si no tiene registros suficientes
          if (registros.length > 1) {
              const ant = registros[1];
              const d = differenceInDays(new Date(ultimoP.fecha), new Date(ant.fecha)) || 1;
              const gan = ultimoP.peso - ant.peso;
              let gdpDb = (ultimoP.gdp_calculada !== null && ultimoP.gdp_calculada !== undefined) ? Number(ultimoP.gdp_calculada) : (gan/d);
              if (gdpDb === 0 && gan !== 0) gdpDb = gan/d;
              gdpsTotales.push(gdpDb);
          } else if (registros.length === 1) {
              const d = differenceInDays(new Date(ultimoP.fecha), new Date(a.fecha_ingreso)) || 1;
              const gan = ultimoP.peso - a.peso_ingreso;
              gdpsTotales.push(gan/d);
          }

          if (!group[rotacionName]) group[rotacionName] = {};
          if (!group[rotacionName][potreroName]) {
              group[rotacionName][potreroName] = { 
                  rotacion: rotacionName, 
                  potrero: potreroName, 
                  animales: [],
                  marcasCounts: {} 
              };
          }

          if (!group[rotacionName][potreroName].marcasCounts[marca]) {
              group[rotacionName][potreroName].marcasCounts[marca] = 0;
          }
          group[rotacionName][potreroName].marcasCounts[marca] += 1;

          group[rotacionName][potreroName].animales.push({
              ...a,
              ultimo_peso: ultimoP ? ultimoP.peso : a.peso_ingreso,
              fecha_ultimo_pesaje: ultimoP ? ultimoP.fecha : a.fecha_ingreso,
              registros_length: registros.length
          });
        });

        const gdpPromedioFinca = gdpsTotales.length > 0 ? (gdpsTotales.reduce((acc, curr) => acc + curr, 0) / gdpsTotales.length) : 0.45;

        // Transformar en filas de reporte
        const rowsOutput: any[] = [];

        Object.keys(group).sort().forEach(rotName => {
            Object.keys(group[rotName]).sort().forEach(potName => {
                const pData = group[rotName][potName];
                let sumPesoE = 0;
                let sumPesoReal = 0;
                let dates: Date[] = [];

                pData.animales.forEach((anim: any) => {
                    sumPesoReal += anim.ultimo_peso;
                    const refDate = new Date(anim.fecha_ultimo_pesaje);
                    refDate.setHours(0,0,0,0);
                    const diff = differenceInDays(hoy, refDate) || 0;
                    sumPesoE += anim.ultimo_peso + (diff * gdpPromedioFinca);
                    dates.push(refDate);
                });

                const maxDate = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;

                const rowBlock = {
                    Rotación: rotName,
                    Potrero: pData.potrero,
                    ...pData.marcasCounts,
                    'Total Ganado': pData.animales.length,
                    'Último Pesaje': maxDate ? format(maxDate, 'dd/MM/yyyy') : 'N/A',
                    'Peso Promedio': pData.animales.length > 0 ? (sumPesoReal / pData.animales.length).toFixed(1) : 0,
                    'Peso Promedio Estimado Hoy': pData.animales.length > 0 ? (sumPesoE / pData.animales.length).toFixed(1) : 0
                };
                rowsOutput.push(rowBlock);
            });
        });

        setMarcas(Array.from(marcasSet).sort());
        setReportData(rowsOutput);
      } catch (err) {
        console.error("Error al generar reporte", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [fincaId]);

  const descargarExcel = () => {
    if (!reportData || reportData.length === 0) return;

    // Crear hoja
    const ws = XLSX.utils.json_to_sheet(reportData);
    
    // Configurar columnas auto-width
    const cols = Object.keys(reportData[0]).map(() => ({ wch: 15 }));
    ws['!cols'] = cols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario de Rotaciones");

    const stamp = format(new Date(), "yyyy-MM-dd");
    XLSX.writeFile(wb, `Inventario_Rotaciones_${stamp}.xlsx`);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '1000px', width: '95%' }}>
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet className="text-secondary" />
            <h2 style={{ margin: 0 }}>Reporte de Inventario (Planilla)</h2>
          </div>
          <button onClick={onClose} className="btn-close" style={{ background: 'transparent', border: 'none', color: 'var(--text-color)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
                <Loader2 className="animate-spin text-primary" size={32} />
                <span style={{ marginLeft: '12px' }}>Analizando y construyendo reporte...</span>
            </div>
        ) : (
            <>
                <div style={{ overflowX: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '12px' }}>
                    <table style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <th style={{ textAlign: 'left', padding: '8px', color: 'var(--primary-light)' }}>Rotación</th>
                            <th style={{ textAlign: 'left', padding: '8px' }}>Potrero</th>
                            {marcas.map(m => (
                                <th key={m} style={{ textAlign: 'center', padding: '8px', color: 'var(--text-muted)' }}>{m}</th>
                            ))}
                            <th style={{ textAlign: 'center', padding: '8px', color: 'var(--secondary)' }}>Total Ganado</th>
                            <th style={{ textAlign: 'center', padding: '8px' }}>Último Pesaje</th>
                            <th style={{ textAlign: 'right', padding: '8px' }}>Peso Prom.</th>
                            <th style={{ textAlign: 'right', padding: '8px', color: 'var(--warning)' }}>Estimado Hoy</th>
                        </tr>
                    </thead>
                    <tbody>
                        {reportData.map((row, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '8px' }}>{row.Rotación}</td>
                                <td style={{ padding: '8px' }}>{row.Potrero}</td>
                                {marcas.map(m => (
                                    <td key={m} style={{ textAlign: 'center', padding: '8px', color: 'var(--text-muted)' }}>
                                        {row[m] || '-'}
                                    </td>
                                ))}
                                <td style={{ textAlign: 'center', padding: '8px', fontWeight: 'bold' }}>{row['Total Ganado']}</td>
                                <td style={{ textAlign: 'center', padding: '8px' }}>{row['Último Pesaje']}</td>
                                <td style={{ textAlign: 'right', padding: '8px' }}>{row['Peso Promedio']} kg</td>
                                <td style={{ textAlign: 'right', padding: '8px', fontWeight: 'bold' }}>{row['Peso Promedio Estimado Hoy']} kg</td>
                            </tr>
                        ))}
                    </tbody>
                    </table>
                </div>

                <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button className="btn-secondary" onClick={onClose}>Cerrar</button>
                    <button className="btn-primary" onClick={descargarExcel} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Download size={18} /> Descargar en Excel
                    </button>
                </div>
            </>
        )}
      </div>
    </div>
  );
}
