import React, { useEffect, useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { auth } from '../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';

export const MainLayout: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Escuchamos el estado de autenticación (Firebase Auth)
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-50">
        <p className="text-navy-800 font-medium">Conectando con Firebase...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <div className="flex-1 ml-64 overflow-y-auto w-full">
        <header className="h-16 bg-white border-b flex items-center px-8 shadow-sm">
          <div className="flex-1">
            {/* Indicador de estado de base de datos */}
            <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full font-medium">
              Firestore Conectado
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm font-medium text-gray-700">
              {user ? user.email : 'Usuario Local (Pruebas)'}
            </div>
            <div className="w-8 h-8 rounded-full bg-navy-800 text-white flex items-center justify-center font-bold">
              {user?.email ? user.email.charAt(0).toUpperCase() : 'U'}
            </div>
          </div>
        </header>
        <main className="p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
