import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Weighing from './pages/Weighing';
import Settings from './pages/Settings';
import SuperAdmin from './pages/SuperAdmin';
import Topbar from './components/Topbar';
import Sidebar from './components/Sidebar';
import Purchase from './pages/Purchase';
import Sales from './pages/Sales';

const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) => {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--primary-light)' }}>
        Cargando...
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Topbar />
      <div style={{ display: 'flex', flex: 1, paddingTop: '64px' }}>
        <Sidebar />
        <main style={{ flex: 1, marginLeft: '220px', padding: '32px 28px', overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  );
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route
        path="/inventario"
        element={
          <ProtectedRoute allowedRoles={['administrador', 'vaquero', 'observador']}>
            <Inventory />
          </ProtectedRoute>
        }
      />
      <Route
        path="/compra"
        element={
          <ProtectedRoute allowedRoles={['administrador', 'vaquero']}>
            <Purchase />
          </ProtectedRoute>
        }
      />
      <Route
        path="/venta"
        element={
          <ProtectedRoute allowedRoles={['administrador', 'vaquero']}>
            <Sales />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pesaje"
        element={
          <ProtectedRoute allowedRoles={['administrador', 'vaquero']}>
            <Weighing />
          </ProtectedRoute>
        }
      />
      <Route
        path="/configuracion"
        element={
          <ProtectedRoute allowedRoles={['administrador']}>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/superadmin"
        element={
          <ProtectedRoute>
            <SuperAdmin />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
