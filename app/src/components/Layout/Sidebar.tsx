import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Library, 
  ShoppingCart, 
  Users,
  LogOut,
  Wallet,
  Truck
} from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { auth } from '../../lib/firebase';
import { signOut } from 'firebase/auth';

export const cn = (...inputs: (string | undefined | null | false)[]) => {
  return twMerge(clsx(inputs));
};

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Inventario', path: '/inventory', icon: Library },
  { name: 'Ventas', path: '/sales', icon: ShoppingCart },
  { name: 'Clientes', path: '/customers', icon: Users },
  { name: 'Cuentas Corrientes', path: '/cuentas', icon: Wallet },
  { name: 'Envíos', path: '/envios', icon: Truck },
];

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // Al cerrar sesión, onAuthStateChanged en MainLayout limpiará el usuario.
      navigate('/login', { replace: true });
    } catch (error) {
      console.error("Error crítico al intentar cerrar sesión en Firebase:", error);
    }
  };

  return (
    <aside className="w-64 bg-navy-900 text-white flex flex-col h-screen fixed">
      <div className="p-6">
        <h1 className="text-xl font-bold uppercase tracking-wider">
          Toledo Libros<br/>
          <span className="text-navy-300 text-sm font-normal">Jurídicos</span>
        </h1>
      </div>
      
      <nav className="flex-1 mt-6 px-4 space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-4 py-3 rounded-md transition-colors",
              isActive 
                ? "bg-navy-800 text-white font-medium" 
                : "text-navy-200 hover:bg-navy-800/50 hover:text-white"
            )}
          >
            <item.icon className="w-5 h-5" />
            {item.name}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-navy-800">
        <button 
          onClick={handleLogout}
          className="flex w-full items-center gap-3 px-4 py-3 text-navy-200 hover:bg-navy-800/50 hover:text-white rounded-md transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  );
};
