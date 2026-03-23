import React, { useState, useEffect } from 'react';
import { DollarSign, Library, ShoppingCart, TrendingUp, AlertTriangle, ArrowRight } from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays, startOfDay, isSameMonth, isToday } from 'date-fns';
import { es } from 'date-fns/locale';

interface Book {
  id: string;
  title: string;
  author: string;
  price: number;
  stock: number;
}

interface Sale {
  id: string;
  totalAmount: number;
  saleDate: any;
  items: any[];
  customerName: string;
}

export const Dashboard: React.FC = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Escuchar ventas
    const salesQuery = query(collection(db, 'sales'), orderBy('saleDate', 'desc'));
    const unsubSales = onSnapshot(salesQuery, (snapshot) => {
      const salesData: Sale[] = [];
      snapshot.forEach(doc => salesData.push({ id: doc.id, ...doc.data() } as Sale));
      setSales(salesData);
      setLoading(false);
    });
    
    // Escuchar inventario completo para conteos
    const unsubBooks = onSnapshot(collection(db, 'books'), (snapshot) => {
      const booksData: Book[] = [];
      snapshot.forEach(doc => booksData.push({ id: doc.id, ...doc.data() } as Book));
      setBooks(booksData);
    });

    return () => {
      unsubSales();
      unsubBooks();
    };
  }, []);

  // 1. Cálculos de Widgets
  const today = new Date();
  
  const todaySales = sales.filter(s => s.saleDate && isToday(s.saleDate.toDate()));
  const todayRevenue = todaySales.reduce((acc, s) => acc + s.totalAmount, 0);

  const totalBooksSold = sales.reduce((acc, s) => {
    return acc + (s.items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0);
  }, 0);

  const monthSales = sales.filter(s => s.saleDate && isSameMonth(s.saleDate.toDate(), today));
  const monthRevenue = monthSales.reduce((acc, s) => acc + s.totalAmount, 0);

  const lowStockBooks = books.filter(b => b.stock < 3);

  // 2. Gráfico de Tendencias (Últimos 7 días)
  const chartData = Array.from({ length: 7 }).map((_, i) => {
    const date = subDays(today, 6 - i);
    const dayStart = startOfDay(date);
    
    // Ventas de ese día específico
    const daySales = sales.filter(s => {
      if (!s.saleDate) return false;
      const saleD = s.saleDate.toDate();
      return saleD >= dayStart && saleD < new Date(dayStart.getTime() + 86400000); // menores al próximo día
    });

    return {
      name: format(date, 'EEE', { locale: es }).toUpperCase(), // Lun, Mar, etc.
      ventas: daySales.reduce((acc, s) => acc + s.totalAmount, 0)
    };
  });

  // 3. Últimas 5 transacciones (ya vienen ordenadas por desc desde Firestore si existe saleDate)
  const recentSales = sales.slice(0, 5);

  if (loading) {
    return <div className="h-full flex items-center justify-center text-gray-500">Cargando métricas de Firestore...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800">Panel de Control</h2>
          <p className="text-gray-500 text-sm mt-1">Resumen estadístico de Toledo Libros Jurídicos</p>
        </div>
        <div className="text-sm text-gray-400 font-medium">
          Actualizado: En tiempo real
        </div>
      </div>
      
      {/* 1. Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="bg-blue-50 p-4 rounded-full text-blue-600">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium whitespace-nowrap">Ventas de Hoy</p>
            <h3 className="text-2xl font-bold text-navy-900">${todayRevenue.toFixed(2)}</h3>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="bg-emerald-50 p-4 rounded-full text-emerald-600">
            <Library size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium whitespace-nowrap">Libros Vendidos</p>
            <h3 className="text-2xl font-bold text-navy-900">{totalBooksSold} <span className="text-sm text-gray-400 font-normal">unid.</span></h3>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="bg-amber-50 p-4 rounded-full text-amber-600">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium whitespace-nowrap">Ingresos Mes ({format(today, 'MMMM', {locale: es})})</p>
            <h3 className="text-2xl font-bold text-navy-900">${monthRevenue.toFixed(2)}</h3>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className={`p-4 rounded-full ${lowStockBooks.length > 0 ? 'bg-rose-50 text-rose-600' : 'bg-gray-50 text-gray-400'}`}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium whitespace-nowrap">Stock Crítico</p>
            <h3 className={`text-2xl font-bold ${lowStockBooks.length > 0 ? 'text-rose-600' : 'text-gray-800'}`}>
              {lowStockBooks.length} <span className="text-sm text-gray-400 font-normal">títulos</span>
            </h3>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        
        {/* 2. Gráfico de Tendencias */}
        <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex flex-col">
          <h3 className="text-lg font-semibold text-gray-800 mb-6">Evolución de Ingresos (Últimos 7 días)</h3>
          <div className="flex-1 min-h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1e3a8a" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#1e3a8a" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} tickFormatter={(value) => `$${value}`} />
                <Tooltip 
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Ingresos']}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                />
                <Area type="monotone" dataKey="ventas" stroke="#1e3a8a" strokeWidth={3} fillOpacity={1} fill="url(#colorVentas)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. Tablas Dinámicas (Últimas Ventas y Stock) */}
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-100 h-[280px] flex flex-col">
            <h3 className="text-base font-semibold text-gray-800 mb-4 flex items-center justify-between">
              Últimas 5 Ventas
              <button className="text-xs text-navy-600 font-medium hover:underline flex items-center">Ver todas <ArrowRight size={14} className="ml-1"/></button>
            </h3>
            <div className="flex-1 overflow-y-auto pr-2">
              {recentSales.length === 0 ? (
                <p className="text-gray-500 text-sm italic text-center mt-10">No hay ventas recientes.</p>
              ) : (
                <ul className="space-y-4">
                  {recentSales.map(sale => (
                    <li key={sale.id} className="flex justify-between items-center border-b border-gray-50 pb-3 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{sale.customerName}</p>
                        <p className="text-xs text-gray-500">
                          {sale.items.length} {sale.items.length === 1 ? 'libro' : 'libros'} • {sale.paymentMethod}
                        </p>
                      </div>
                      <span className="font-bold text-navy-800 text-sm">
                        ${sale.totalAmount.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="bg-white p-5 rounded-lg shadow-sm border border-rose-100 flex flex-col h-[280px]">
            <h3 className="text-base font-semibold text-rose-800 mb-4 flex items-center gap-2">
              <AlertTriangle size={18} />
              Reposición Urgente
            </h3>
            <div className="flex-1 overflow-y-auto pr-2">
              {lowStockBooks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-emerald-600">
                  <Library size={32} className="mb-2 opacity-50" />
                  <p className="text-sm font-medium">Todo el stock está óptimo.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {lowStockBooks.slice(0, 10).map(book => (
                    <li key={book.id} className="flex justify-between items-center bg-rose-50 px-3 py-2 rounded-md border border-rose-100">
                      <div className="truncate pr-4 flex-1">
                        <p className="text-xs font-semibold text-gray-900 truncate">{book.title}</p>
                        <p className="text-[10px] text-gray-500 truncate">{book.author}</p>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-rose-200 text-rose-900">
                        {book.stock} un.
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
