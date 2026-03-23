import React, { useState, useEffect, useRef } from 'react';
import { Search, ShoppingCart, Plus, Minus, Trash2, Banknote, CreditCard, Smartphone, CheckCircle, Receipt, History, Printer, X, BookOpen, Truck } from 'lucide-react';
import { collection, onSnapshot, doc, runTransaction, serverTimestamp, query, orderBy, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useReactToPrint } from 'react-to-print';
import type { Book } from './Inventory';
import type { Customer } from './Customers';

interface CartItem {
  book: Book;
  quantity: number;
}

export const Sales: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'pos' | 'history'>('pos');

  // --- ESTADO POS ---
  const [books, setBooks] = useState<Book[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string>('Efectivo');
  const [isProcessing, setIsProcessing] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  
  // Envíos
  const [requiresShipping, setRequiresShipping] = useState(false);
  const [shippingData, setShippingData] = useState({
    address: '', locality: '', province: '', cost: '0', method: 'Correo Argentino'
  });
  
  // Modal de Ticket
  const [completedSale, setCompletedSale] = useState<any>(null);
  const printContentRef = useRef<HTMLDivElement>(null);
  
  // Imprimir usando react-to-print
  const handlePrint = useReactToPrint({
    contentRef: printContentRef,
    documentTitle: 'Ticket_Toledo_Libros',
  });

  // --- ESTADO HISTORIAL ---
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [historyFilter, setHistoryFilter] = useState({ startDate: '', endDate: '', search: '' });

  const setPresetDate = (preset: 'hoy' | 'ayer' | 'mes') => {
    const today = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    
    if (preset === 'hoy') {
      const todayStr = toDateStr(today);
      setHistoryFilter(prev => ({ ...prev, startDate: todayStr, endDate: todayStr }));
    } else if (preset === 'ayer') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = toDateStr(yesterday);
      setHistoryFilter(prev => ({ ...prev, startDate: yStr, endDate: yStr }));
    } else if (preset === 'mes') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setHistoryFilter(prev => ({ ...prev, startDate: toDateStr(firstDay), endDate: toDateStr(lastDay) }));
    }
  };

  // Cargar Inventario
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'books'), (snapshot) => {
      const booksData: Book[] = [];
      snapshot.forEach((doc) => {
        booksData.push({ id: doc.id, ...doc.data() } as Book);
      });
      setBooks(booksData);
    });
    return () => unsubscribe();
  }, []);

  // Cargar Clientes
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'customers'), (snapshot) => {
      const customersData: Customer[] = [];
      snapshot.forEach((doc) => {
        customersData.push({ id: doc.id, ...doc.data() } as Customer);
      });
      setCustomers(customersData);
    });
    return () => unsubscribe();
  }, []);

  // Cargar Historial de Ventas
  useEffect(() => {
    const q = query(collection(db, 'sales'), orderBy('saleDate', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sales: any[] = [];
      snapshot.forEach(doc => sales.push({ id: doc.id, ...doc.data() }));
      setSalesHistory(sales);
    });
    return () => unsubscribe();
  }, []);

  // --- LÓGICAS DEL PUNTO DE VENTA ---
  const filteredBooks = books.filter(book => 
    (book.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
     book.isbn.includes(searchTerm) || 
     book.editorial?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     book.branch?.toLowerCase().includes(searchTerm.toLowerCase())) &&
    book.stock > 0
  );

  const selectedCustomerObj = customers.find(c => c.id === selectedCustomerId);

  const addToCart = (book: Book) => {
    setCart(prev => {
      const existing = prev.find(item => item.book.id === book.id);
      if (existing) {
        if (existing.quantity >= book.stock) return prev;
        return prev.map(item => item.book.id === book.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { book, quantity: 1 }];
    });
  };

  const updateQuantity = (bookId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.book.id === bookId) {
        const newQ = item.quantity + delta;
        if (newQ > 0 && newQ <= item.book.stock) return { ...item, quantity: newQ };
        return item;
      }
      return item;
    }));
  };

  const removeFromCart = (bookId: string) => {
    setCart(prev => prev.filter(item => item.book.id !== bookId));
  };

  const booksTotal = cart.reduce((acc, item) => acc + (item.book.price * item.quantity), 0);
  const shippingCost = requiresShipping ? Number(shippingData.cost) || 0 : 0;
  const totalAmount = booksTotal + shippingCost;

  // Limite de Crédito Check
  const currentCreditLimit = selectedCustomerObj?.limiteCredito || 0;
  const isCreditExceeded = selectedCustomerObj && paymentMethod === 'A Cuenta' && currentCreditLimit > 0 && ((selectedCustomerObj.balance || 0) + totalAmount) > currentCreditLimit;

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);

    try {
      await runTransaction(db, async (transaction) => {
        // --- 1. LECTURAS (READS) ---
        const bookSnaps = [];
        for (const item of cart) {
          const bookRef = doc(db, 'books', item.book.id!);
          const snap = await transaction.get(bookRef);
          if (!snap.exists()) {
            throw new Error(`El libro ${item.book.title} ya no existe en la BD.`);
          }
          bookSnaps.push({ ref: bookRef, snap, quantity: item.quantity });
        }

        let custRef = null;
        let custSnap = null;
        if (paymentMethod === 'A Cuenta' && selectedCustomerObj) {
          custRef = doc(db, 'customers', selectedCustomerObj.id!);
          custSnap = await transaction.get(custRef);
          if (!custSnap.exists()) {
            throw new Error("El cliente seleccionado ya no existe.");
          }
        }

        // --- 2. VALIDACIONES ---
        for (const bb of bookSnaps) {
          const currentStock = bb.snap.data().stock;
          if (currentStock < bb.quantity) {
            throw new Error(`Stock insuficiente para la obra. Disponible: ${currentStock}`);
          }
        }
        
        if (isCreditExceeded) {
          throw new Error(`Esta venta excede el límite de crédito del cliente ($${currentCreditLimit}).`);
        }

        // --- 3. ESCRITURAS (WRITES) ---
        // 3.1 Crear Venta
        const saleRef = doc(collection(db, 'sales'));
        const saleItems = cart.map(item => ({
          bookId: item.book.id,
          title: item.book.title,
          quantity: item.quantity,
          unitPrice: item.book.price,
          subtotal: item.book.price * item.quantity
        }));

        const saleData = {
          totalAmount,
          booksTotal,
          paymentMethod,
          status: paymentMethod === 'A Cuenta' ? 'pending_payment' : 'paid',
          items: saleItems,
          saleDate: serverTimestamp(),
          customerId: selectedCustomerObj ? selectedCustomerObj.id : null,
          customerName: selectedCustomerObj ? selectedCustomerObj.fullName : 'Consumidor Final',
          isShipping: requiresShipping
        };

        transaction.set(saleRef, saleData);

        // 3.2 Guardar el saleRef.id para crear 'shipment' luego de la transaccion
        if (requiresShipping) {
          Object.assign(saleRef, { _pendingShipSaleId: saleRef.id });
        }

        // 3.2 Actualizar Stock
        for (const bb of bookSnaps) {
          const newStock = bb.snap.data().stock - bb.quantity;
          transaction.update(bb.ref, { stock: newStock });
        }

        // 3.3 Actualizar Saldo de Cliente si es "A Cuenta"
        if (custRef && custSnap) {
          const custData = custSnap.data();
          const currentBalance = custData.balance || 0;
          const currentLimit = custData.limiteCredito || 0;
          
          if (currentLimit > 0 && (currentBalance + totalAmount) > currentLimit) {
            throw new Error(`Esta venta supera el límite de crédito del cliente ($${currentLimit}). Operación rechazada.`);
          }

          const updates: any = { 
            balance: currentBalance + totalAmount,
            lastMovementDate: serverTimestamp()
          };

          // Iniciar antigüedad de deuda si no la tenía
          if (currentBalance <= 0) {
            updates.oldestDebtDate = serverTimestamp();
          }

          transaction.update(custRef, updates);
        }
      });

      // POST-TRANSACTION: Si hay envío, crear documento separado en 'shipments'
      if (requiresShipping) {
        await addDoc(collection(db, 'shipments'), {
          customerName: selectedCustomerObj ? selectedCustomerObj.fullName : 'Consumidor Final',
          customerId: selectedCustomerObj ? selectedCustomerObj.id : null,
          items: cart.map(item => ({ title: item.book.title, quantity: item.quantity })),
          address: shippingData.address,
          locality: shippingData.locality,
          province: shippingData.province,
          method: shippingData.method,
          cost: shippingCost,
          status: 'Pendiente de Empaque',
          tracking: '',
          shippingDate: serverTimestamp(),
          totalOrderAmount: totalAmount,
        });
      }

      // Éxito: Guardar datos estáticos para el ticket impreso
      setCompletedSale({
        items: cart,
        total: totalAmount,
        booksTotal: booksTotal,
        shippingCost: shippingCost,
        method: paymentMethod,
        customer: selectedCustomerObj ? selectedCustomerObj.fullName : 'Consumidor Final',
        date: new Date().toLocaleString('es-AR'),
        isShipping: requiresShipping,
        shippingInfo: requiresShipping ? { ...shippingData, cost: shippingCost } : null
      });
      
      setCart([]);
      setSelectedCustomerId('');
      setPaymentMethod('Efectivo');
      setRequiresShipping(false);
      setShippingData({ address: '', locality: '', province: '', cost: '0', method: 'Correo Argentino' });
      
    } catch (error: any) {
      alert(`La transacción falló: ${error.message}`);
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };


  // --- LÓGICAS DE HISTORIAL ---
  const filteredHistory = salesHistory.filter(sale => {
    if (!sale.saleDate) return true; // Mantener recientes temporales

    // 1. Filtro por Búsqueda (Cliente, Libro o ISBN)
    if (historyFilter.search) {
      const q = historyFilter.search.toLowerCase();
      const matchCustomer = sale.customerName?.toLowerCase().includes(q);
      
      const matchBook = sale.items?.some((item: any) => {
        const titleMatch = item.title?.toLowerCase().includes(q);
        // Buscar ISBN en la colección local de 'books'
        const bookObj = books.find(b => b.id === item.bookId);
        const isbnMatch = bookObj?.isbn?.toLowerCase().includes(q);
        return titleMatch || isbnMatch;
      });

      if (!matchCustomer && !matchBook) return false;
    }

    // 2. Filtro por Fechas
    const saleD = sale.saleDate.toDate();
    
    if (historyFilter.startDate) {
      // Usar T00:00:00 para forzar inicio del día local
      const startD = new Date(historyFilter.startDate + 'T00:00:00');
      if (saleD < startD) return false;
    }
    
    if (historyFilter.endDate) {
      // Usar T23:59:59 para forzar final del día local
      const endD = new Date(historyFilter.endDate + 'T23:59:59');
      if (saleD > endD) return false;
    }

    return true;
  });

  return (
    <div className="h-full flex flex-col relative">
      
      {/* TABS HEADER */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        <button 
          onClick={() => setActiveTab('pos')}
          className={`flex items-center gap-2 px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'pos' ? 'border-navy-600 text-navy-800 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-t-lg'}`}
        >
          <ShoppingCart size={18} /> Punto de Venta
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'history' ? 'border-navy-600 text-navy-800 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-t-lg'}`}
        >
          <History size={18} /> Historial de Operaciones
        </button>
      </div>

      {activeTab === 'pos' && (
        <div className="flex gap-6 flex-1 min-h-0">
          {/* LADO IZQUIERDO: CATÁLOGO */}
          <div className="w-2/3 flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input 
                  type="text" 
                  placeholder="Buscar obra por Título, Editorial, Rama o ISBN..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent text-sm"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredBooks.map(book => (
                  <div key={book.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow flex flex-col justify-between group">
                    <div>
                      <div className="flex gap-4 mb-2">
                        {book.imageUrl ? (
                           <img src={book.imageUrl} alt={book.title} className="w-16 h-20 object-cover rounded shadow-sm border border-gray-200 flex-shrink-0" />
                        ) : (
                           <div className="w-16 h-20 bg-gray-100 rounded border border-gray-200 flex items-center justify-center text-gray-400 shadow-sm flex-shrink-0">
                              <BookOpen size={20} />
                           </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-1">
                            <h3 className="font-bold text-gray-900 group-hover:text-navy-700 line-clamp-2 leading-tight">{book.title}</h3>
                            <span className="font-bold text-navy-800 text-lg ml-2 whitespace-nowrap">${book.price.toFixed(2)}</span>
                          </div>
                          <p className="text-xs text-gray-500 mb-2 truncate">{book.author}</p>
                          
                          {/* Nuevos datos de Búsqueda Avanzada */}
                          <div className="flex flex-wrap gap-1.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100 max-w-full truncate">
                              {book.branch}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700 border border-gray-200 max-w-full truncate">
                              Ed. {book.editorial || 'S/E'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center mt-2 pt-3 border-t border-gray-100">
                      <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Stock Disp: {book.stock}</span>
                      <button 
                        onClick={() => addToCart(book)}
                        disabled={cart.find(i => i.book.id === book.id)?.quantity === book.stock}
                        className="bg-navy-800 hover:bg-navy-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded flex items-center gap-1 text-sm font-medium transition-colors"
                      >
                        <Plus size={16} /> Agregar
                      </button>
                    </div>
                  </div>
                ))}
                {filteredBooks.length === 0 && (
                  <div className="col-span-full py-12 text-center text-gray-500">
                    <p>No se encontraron libros con stock.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* LADO DERECHO: CARRITO Y CHECKOUT */}
          <div className="w-1/3 flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 bg-navy-900 text-white rounded-t-lg flex items-center gap-2">
              <ShoppingCart size={20} />
              <h2 className="font-semibold text-lg tracking-wide">Detalle de Venta</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <ShoppingCart size={48} className="mb-2 opacity-20" />
                  <p className="text-sm">El carrito está vacío</p>
                </div>
              ) : (
                cart.map(item => (
                  <div key={item.book.id} className="bg-white border border-gray-200 rounded-md p-3 shadow-sm flex gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm text-gray-800 truncate">{item.book.title}</h4>
                      <p className="text-xs text-gray-500 truncate mb-2">{item.book.author}</p>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center bg-gray-100 rounded border border-gray-200">
                          <button onClick={() => updateQuantity(item.book.id!, -1)} className="p-1 hover:bg-gray-200 rounded-l text-gray-600"><Minus size={14}/></button>
                          <span className="px-3 text-xs font-bold text-navy-900">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.book.id!, 1)} className="p-1 hover:bg-gray-200 rounded-r text-gray-600"><Plus size={14}/></button>
                        </div>
                        <span className="text-xs text-gray-400">Max: {item.book.stock}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end justify-between">
                      <span className="font-bold text-gray-900">${(item.book.price * item.quantity).toFixed(2)}</span>
                      <button onClick={() => removeFromCart(item.book.id!)} className="text-red-400 hover:text-red-600 p-1 bg-red-50 rounded transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-5 bg-white border-t border-gray-200 rounded-b-lg space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Cliente Asignado</label>
                  {selectedCustomerObj && selectedCustomerObj.balance > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 animate-pulse border border-red-200">
                      DEUDA ACTIVA: ${selectedCustomerObj.balance.toFixed(2)}
                    </span>
                  )}
                  {selectedCustomerObj && selectedCustomerObj.balance < 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                      CRÉDITO DISPONIBLE: ${Math.abs(selectedCustomerObj.balance).toFixed(2)}
                    </span>
                  )}
                </div>
                {isCreditExceeded && (
                  <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-red-600 text-xs font-bold animate-pulse">
                    ⚠️ Operación Bloqueada: La compra excede el Límite de Crédito (${currentCreditLimit?.toFixed(2)})
                  </div>
                )}
                <select 
                  value={selectedCustomerId} 
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className={`w-full border rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 text-sm bg-white text-gray-700 ${
                    selectedCustomerObj && selectedCustomerObj.balance > 0 ? 'border-red-300 ring-1 ring-red-100' : 'border-gray-300'
                  }`}
                >
                  <option value="">Consumidor Final</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.fullName} - {c.customerType}</option>
                  ))}
                </select>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-xs font-semibold text-gray-800 uppercase tracking-wider flex items-center gap-2">
                    <Truck size={14} /> ¿Requiere Envío?
                  </label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={requiresShipping} onChange={(e) => setRequiresShipping(e.target.checked)} />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-navy-600"></div>
                  </label>
                </div>

                {requiresShipping && (
                  <div className="p-3 bg-gray-100 rounded-lg space-y-3 mb-4 border border-gray-200 animate-in fade-in slide-in-from-top-2">
                    <div>
                      <label className="block text-[10px] text-gray-500 font-bold uppercase mb-1">Dirección Exacta</label>
                      <input type="text" value={shippingData.address} onChange={e => setShippingData({...shippingData, address: e.target.value})} className="w-full border-gray-300 rounded border px-2 py-1.5 text-sm" placeholder="Calle 123, Depto 4" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 font-bold uppercase mb-1">Localidad</label>
                        <input type="text" value={shippingData.locality} onChange={e => setShippingData({...shippingData, locality: e.target.value})} className="w-full border-gray-300 rounded border px-2 py-1.5 text-sm" placeholder="Córdoba Cap." />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 font-bold uppercase mb-1">Provincia</label>
                        <input type="text" value={shippingData.province} onChange={e => setShippingData({...shippingData, province: e.target.value})} className="w-full border-gray-300 rounded border px-2 py-1.5 text-sm" placeholder="Córdoba" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 font-bold uppercase mb-1">Transporte</label>
                        <select value={shippingData.method} onChange={e => setShippingData({...shippingData, method: e.target.value})} className="w-full border-gray-300 rounded border px-2 py-1.5 text-sm bg-white">
                          <option>Correo Argentino</option>
                          <option>Andreani</option>
                          <option>OCA</option>
                          <option>Comisionista</option>
                          <option>Moto Mensajería</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-navy-600 font-black uppercase mb-1">Costo Envío ($)</label>
                        <input type="number" min="0" value={shippingData.cost} onChange={e => setShippingData({...shippingData, cost: e.target.value})} className="w-full border-navy-300 rounded border px-2 py-1.5 text-sm font-bold text-navy-800 focus:ring-navy-500 focus:border-navy-500" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-3">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Método de Pago</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'Efectivo', icon: Banknote },
                    { id: 'Transferencia', icon: Smartphone },
                    { id: 'Tarjeta', icon: CreditCard },
                    { id: 'Mercado Pago', icon: Smartphone },
                    { id: 'A Cuenta', icon: Receipt },
                  ].map(method => (
                    <button
                      key={method.id}
                      disabled={method.id === 'A Cuenta' && !selectedCustomerId}
                      onClick={() => setPaymentMethod(method.id)}
                      className={`flex flex-col items-center justify-center p-2 rounded border gap-1 transition-all ${
                        paymentMethod === method.id 
                          ? 'border-navy-600 bg-navy-50 text-navy-800 ring-1 ring-navy-600' 
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent'
                      }`}
                    >
                      <method.icon size={18} />
                      <span className="text-[10px] text-center font-semibold">{method.id === 'A Cuenta' ? 'A Cuenta / Crédito' : method.id}</span>
                    </button>
                  ))}
                </div>
                {paymentMethod === 'A Cuenta' && !selectedCustomerId && (
                  <p className="text-[10px] text-red-500 mt-1 italic">* Seleccione un cliente para vender A Cuenta o usar Crédito</p>
                )}
              </div>

              <div className="border-t border-gray-100 pt-3">
                <div className="flex flex-col gap-1 mb-4">
                  {requiresShipping && shippingCost > 0 && (
                     <div className="flex justify-between items-center text-sm text-gray-500">
                       <span>Subtotal Obras:</span>
                       <span>${booksTotal.toFixed(2)}</span>
                     </div>
                  )}
                  {requiresShipping && shippingCost > 0 && (
                     <div className="flex justify-between items-center text-sm text-gray-500">
                       <span>Costo de Envío:</span>
                       <span>${shippingCost.toFixed(2)}</span>
                     </div>
                  )}
                  <div className="flex justify-between items-end mt-1">
                    <span className="text-gray-600 font-medium">Total a cobrar:</span>
                    <span className="text-3xl font-black text-navy-900">${totalAmount.toFixed(2)}</span>
                  </div>
                </div>
                <button 
                  onClick={handleCheckout}
                  disabled={cart.length === 0 || isProcessing || (paymentMethod === 'A Cuenta' && (!selectedCustomerId || !!isCreditExceeded))}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg shadow-md transition-all disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                >
                  {isProcessing ? 'Procesando...' : `Confirmar Venta - ${paymentMethod}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TABS VIEW: HISTORIAL */}
      {activeTab === 'history' && (
        <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px] relative">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Buscar (Cliente, Libro o ISBN)</label>
              <Search className="absolute left-3 top-8 -translate-y-1 text-gray-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Introduzca término..." 
                value={historyFilter.search}
                onChange={(e) => setHistoryFilter({...historyFilter, search: e.target.value})}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:ring-navy-500 focus:border-navy-500 text-sm"
              />
            </div>
            
            <div className="flex gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Desde</label>
                <input 
                  type="date" 
                  value={historyFilter.startDate}
                  onChange={(e) => setHistoryFilter({...historyFilter, startDate: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-navy-500 focus:border-navy-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Hasta</label>
                <input 
                  type="date" 
                  value={historyFilter.endDate}
                  onChange={(e) => setHistoryFilter({...historyFilter, endDate: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-navy-500 focus:border-navy-500 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2 mb-0.5">
              <button onClick={() => setPresetDate('hoy')} className="px-3 py-1.5 text-xs font-medium text-navy-700 bg-navy-50 border border-navy-200 rounded-md hover:bg-navy-100 transition-colors">Hoy</button>
              <button onClick={() => setPresetDate('ayer')} className="px-3 py-1.5 text-xs font-medium text-navy-700 bg-navy-50 border border-navy-200 rounded-md hover:bg-navy-100 transition-colors">Ayer</button>
              <button onClick={() => setPresetDate('mes')} className="px-3 py-1.5 text-xs font-medium text-navy-700 bg-navy-50 border border-navy-200 rounded-md hover:bg-navy-100 transition-colors">Este Mes</button>
              
              <button 
                onClick={() => setHistoryFilter({ startDate: '', endDate: '', search: '' })}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-100 transition-colors ml-2"
              >
                Limpiar
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-white text-navy-800 text-xs uppercase border-b border-gray-200">
                <tr>
                  <th className="py-3 px-6 font-semibold">Fecha y Hora</th>
                  <th className="py-3 px-6 font-semibold">Cliente</th>
                  <th className="py-3 px-6 font-semibold">Resumen de Items</th>
                  <th className="py-3 px-6 font-semibold">Método Pago</th>
                  <th className="py-3 px-6 font-semibold text-right">Monto Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-500">
                      No hay registros de ventas que coincidan con los filtros.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map(sale => (
                    <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-6 text-sm text-gray-600 font-medium whitespace-nowrap">
                        {sale.saleDate ? new Date(sale.saleDate.toDate()).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : 'Reciente'}
                      </td>
                      <td className="py-3 px-6">
                        <span className="font-semibold text-gray-900">{sale.customerName}</span>
                        {sale.isShipping && (
                          <div className="flex gap-1 mt-1">
                            <Truck size={12} className="text-blue-500" />
                            <span className="text-[10px] uppercase text-blue-600 font-bold tracking-wider">Envío</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-6">
                        <div className="flex flex-col gap-0.5 max-w-xs">
                          {sale.items?.map((item: any, idx: number) => (
                            <span key={idx} className="text-xs text-gray-500 truncate" title={item.title}>
                              {item.quantity}x • {item.title}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-6">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                          sale.paymentMethod === 'A Cuenta' ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-blue-50 text-blue-700 border-blue-100'
                        }`}>
                          {sale.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-right font-bold text-navy-900">
                        ${sale.totalAmount?.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          <div className="bg-gray-50 border-t border-gray-200 p-4 flex justify-end">
            <div className="text-right">
              <span className="text-sm text-gray-500 uppercase font-semibold tracking-wider">Total Filtrado: </span>
              <span className="text-xl font-black text-navy-900 ml-2">
                ${filteredHistory.reduce((acc, sale) => acc + (sale.totalAmount || 0), 0).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}


      {/* MODAL TICKET DE VENTA (REACT-TO-PRINT) */}
      {completedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className="bg-emerald-600 p-4 flex justify-between items-center text-white">
              <div className="flex items-center gap-2">
                <CheckCircle size={20} />
                <span className="font-semibold">Venta Exitosa</span>
              </div>
              <button onClick={() => setCompletedSale(null)} className="text-emerald-100 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto w-full bg-gray-100 p-6 flex justify-center">
              {/* COMPONENTE A IMPRIMIR */}
              <div 
                ref={printContentRef} 
                className="bg-white shadow p-6 w-full text-black"
                style={{ fontFamily: 'monospace', fontSize: '12px' }}
              >
                <div className="text-center mb-6 border-b border-dashed border-gray-400 pb-4">
                  <h1 className="text-lg font-bold uppercase tracking-widest text-[#1e3a8a] flex items-center justify-center gap-2">
                    <BookOpen size={20} className="text-[#1e3a8a]"/> TOLEDO
                  </h1>
                  <p className="text-[10px] font-semibold tracking-widest mt-0.5">LIBROS JURÍDICOS</p>
                  <p className="mt-2 text-[10px] text-gray-500">TICKET DE COMPRA NO FISCAL</p>
                  <p className="text-[10px] text-gray-500">{completedSale.date}</p>
                </div>

                <div className="mb-4 text-[11px] leading-relaxed">
                  <p><span className="font-bold">CLIENTE:</span> {completedSale.customer}</p>
                  <p><span className="font-bold">MÉTODO PAGO:</span> {completedSale.method.toUpperCase()}</p>
                  {completedSale.isShipping && (
                    <div className="mt-2 p-2 border border-gray-400 bg-gray-50 uppercase text-[10px]">
                      <p className="font-bold mb-1">=== DESTINO Y LOGÍSTICA ===</p>
                      <p>DIR: {completedSale.shippingInfo.address}</p>
                      <p>LOC: {completedSale.shippingInfo.locality}, {completedSale.shippingInfo.province}</p>
                      <p>TIPO: {completedSale.shippingInfo.method}</p>
                    </div>
                  )}
                </div>

                <div className="border-t border-b border-gray-800 py-2 mb-4">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr>
                        <th className="pb-2 font-bold w-8">CANT</th>
                        <th className="pb-2 font-bold w-full">DESCRIPCIÓN</th>
                        <th className="pb-2 font-bold text-right">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedSale.items.map((item: any, idx: number) => (
                        <tr key={idx} className="border-t border-dashed border-gray-200">
                          <td className="py-2 text-center align-top">{item.quantity}</td>
                          <td className="py-2 pr-2 leading-tight uppercase leading-tight">{item.book.title}</td>
                          <td className="py-2 text-right align-top">${(item.quantity * item.book.price).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-end mt-4">
                  <span className="font-bold tracking-widest">TOTAL</span>
                  <span className="text-lg font-black">${completedSale.total.toFixed(2)}</span>
                </div>
                
                <div className="text-center mt-8 text-[9px] text-gray-400 italic">
                  Gracias por tu confianza en Toledo Libros Jurídicos.<br/>
                  La editorial jurídica por excelencia.
                </div>
              </div>
            </div>

            <div className="p-4 bg-white border-t border-gray-100 flex gap-3">
              <button 
                onClick={() => setCompletedSale(null)} 
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium text-sm transition-colors"
              >
                Cerrar
              </button>
              <button 
                onClick={handlePrint} 
                className="flex-1 px-4 py-2 bg-navy-800 hover:bg-navy-900 text-white rounded-md font-medium text-sm transition-colors flex justify-center items-center gap-2"
              >
                <Printer size={16} />
                Guardar / Imprimir
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
