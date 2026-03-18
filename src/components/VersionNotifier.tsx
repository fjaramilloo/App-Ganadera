import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

export default function VersionNotifier() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [initialSignature, setInitialSignature] = useState<string | null>(null);

  const getAssetsSignature = (html: string) => {
    // Buscamos patrones de archivos con hash que genera Vite: index-HASH.js, index-HASH.css
    // IMPORTANTE: Vite usa letras mayúsculas, minúsculas, números, y guiones `[a-zA-Z0-9_-]`
    const scriptMatches = html.match(/src="\/assets\/[a-zA-Z0-9_-]+\.js"/g) || [];
    const linkMatches = html.match(/href="\/assets\/[a-zA-Z0-9_-]+\.css"/g) || [];
    // También incluimos el título por si acaso
    const titleMatch = html.match(/<title>(.*?)<\/title>/) || [];
    
    return [...scriptMatches, ...linkMatches, ...titleMatch].join('|');
  };

  const checkForUpdates = async () => {
    try {
      const response = await fetch(`/?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      
      const html = await response.text();
      const serverSignature = getAssetsSignature(html);

      if (!serverSignature) return;

      if (initialSignature === null) {
        setInitialSignature(serverSignature);
      } else if (serverSignature !== initialSignature) {
        setUpdateAvailable(true);
      }
    } catch (e) {
      console.warn("Error al verificar actualizaciones:", e);
    }
  };

  useEffect(() => {
    // Primera verificación para capturar el estado inicial
    checkForUpdates();

    // Verificar cada 5 minutos
    const interval = setInterval(checkForUpdates, 1000 * 60 * 5);
    
    // Verificar cuando el usuario vuelve a la pestaña
    const handleFocus = () => checkForUpdates();
    window.addEventListener('focus', handleFocus);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [initialSignature]);

  if (!updateAvailable) return null;

  return (
    <div className="version-popup" style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 9999,
      maxWidth: '340px',
      backgroundColor: 'rgba(20, 20, 20, 0.85)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(76, 175, 80, 0.4)',
      borderRadius: '20px',
      padding: '20px',
      boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 30px rgba(76, 175, 80, 0.1)',
      animation: 'slideInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
      color: 'white'
    }}>
      <style>{`
        @keyframes slideInUp {
          from { transform: translateY(100px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-custom {
          animation: spin-slow 3s linear infinite;
        }
      `}</style>
      
      <div style={{ display: 'flex', gap: '16px' }}>
        <div style={{ 
          backgroundColor: 'rgba(76, 175, 80, 0.15)', 
          borderRadius: '14px', 
          width: '52px', 
          height: '52px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          flexShrink: 0,
          border: '1px solid rgba(76, 175, 80, 0.2)'
        }}>
          <RefreshCw className="animate-spin-custom" size={26} color="#4CAF50" />
        </div>
        
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: '700', letterSpacing: '-0.3px' }}>
            Actualización Lista
          </h4>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.65)', fontSize: '0.88rem', lineHeight: '1.45' }}>
            Hemos realizado mejoras en Agrogestión. Refresca ahora para activarlas.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
        <button 
          onClick={() => window.location.reload()}
          style={{ 
            flex: 2, 
            backgroundColor: '#4CAF50', 
            color: 'white', 
            border: 'none', 
            padding: '10px', 
            borderRadius: '10px', 
            fontWeight: '600',
            fontSize: '0.9rem',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(76, 175, 80, 0.3)',
            transition: 'transform 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          Refrescar Ahora
        </button>
        <button 
          onClick={() => setUpdateAvailable(false)}
          style={{ 
            flex: 1,
            backgroundColor: 'rgba(255,255,255,0.06)', 
            color: 'rgba(255,255,255,0.5)', 
            border: '1px solid rgba(255,255,255,0.08)', 
            padding: '10px', 
            borderRadius: '10px',
            fontSize: '0.85rem',
            cursor: 'pointer'
          }}
        >
          Después
        </button>
      </div>
    </div>
  );
}
