import React, { useState, useEffect } from 'react';
import { Plus, Search, X, BookOpen, Image as ImageIcon, Edit2, Trash2, CheckCircle, AlertCircle, HelpCircle, Eye } from 'lucide-react';
import { collection, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { db, auth } from '../lib/firebase';

export interface Book {
  id?: string;
  isbn: string;
  title: string;
  author: string;
  branch: string;
  editorial: string;
  volume: string;
  pages: number;
  ubicacionFisica: string;
  price: number;
  stock: number;
  editionDate: string;
  imageUrl?: string;
  createdAt?: any;
}

const initialFormStatus = {
  isbn: '', title: '', author: '', branch: '', editorial: '', volume: '', pages: 0, ubicacionFisica: '', price: 0, stock: 0, editionDate: '', imageUrl: ''
};

export const Inventory: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState<Omit<Book, 'id' | 'createdAt'>>(initialFormStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  
  // Estados para Feedback y Confirmación
  const [isSaveConfirmOpen, setIsSaveConfirmOpen] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState('');

  // Transformador de Links de Google Drive a links directos de imagen
  const transformDriveUrl = (url: string): string => {
    if (!url || !url.includes('drive.google.com')) return url;
    try {
      // Intenta extraer el ID del patrón /d/ID/... o id=ID
      const fileIdMatch = url.match(/\/d\/(.+?)\//) || url.match(/id=(.+?)(&|$)/);
      const fileId = fileIdMatch ? fileIdMatch[1] : null;
      if (fileId) {
        return `https://lh3.googleusercontent.com/u/0/d/${fileId}`;
      }
    } catch (e) {
      console.warn("Fallo al transformar link de Drive:", e);
    }
    return url;
  };

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  useEffect(() => {
    const booksRef = collection(db, 'books');
    const unsubscribe = onSnapshot(booksRef, (snapshot) => {
      const booksData: Book[] = [];
      snapshot.forEach((doc) => {
        booksData.push({ id: doc.id, ...doc.data() } as Book);
      });
      setBooks(booksData);
    });

    return () => unsubscribe();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let finalValue = value;

    // Si es el campo de imagen, aplicar transformación de Drive
    if (name === 'imageUrl') {
      finalValue = transformDriveUrl(value);
    }

    setForm((prev) => ({
      ...prev,
      [name]: name === 'price' || name === 'stock' || name === 'pages' ? Number(value) : finalValue,
    }));
  };

  const openFormForAdd = () => {
    setForm(initialFormStatus);
    setEditingBookId(null);
    setIsModalOpen(true);
  };

  const handleEditBook = (book: Book) => {
    setForm({
      isbn: book.isbn,
      title: book.title,
      author: book.author,
      branch: book.branch,
      editorial: book.editorial || '',
      volume: book.volume || '',
      pages: book.pages || 0,
      ubicacionFisica: book.ubicacionFisica || '',
      price: book.price,
      stock: book.stock,
      editionDate: book.editionDate,
      imageUrl: book.imageUrl || ''
    });
    setEditingBookId(book.id!);
    setIsModalOpen(true);
  };

  const handleDeleteBook = (book: Book) => {
    setBookToDelete(book);
    setDeletePassword(''); // Reset password input
  };

  const confirmDelete = async () => {
    if (!bookToDelete) return;
    
    // Medida de Seguridad: Re-autenticación
    const user = auth.currentUser;
    if (!user || !user.email) {
      setErrorMessage("Debe estar logueado para eliminar.");
      return;
    }

    if (!deletePassword) {
      setErrorMessage("Por favor, ingrese su contraseña de seguridad.");
      return;
    }

    setIsSubmitting(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, deletePassword);
      await reauthenticateWithCredential(user, credential);
      
      // Si llega aquí, la contraseña es correcta
      await deleteDoc(doc(db, 'books', bookToDelete.id!));
      setSuccessMessage('Obra eliminada permanentemente');
      setBookToDelete(null);
      setDeletePassword('');
    } catch (error: any) {
      console.error("Error en validación de seguridad", error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setErrorMessage("Contraseña Incorrecta. Acceso Denegado.");
      } else {
        setErrorMessage("Error de seguridad: " + error.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaveConfirmOpen(true);
  };

  const handleActualSubmit = async () => {
    if (isSubmitting) return;

    setIsSaveConfirmOpen(false);
    console.log('--- INICIO PROCESO GUARDADO (LINK EXTERNO) ---');
    setIsSubmitting(true);
    
    try {
      const sanitizedBook = {
        isbn: String(form.isbn || ''),
        title: String(form.title || ''),
        author: String(form.author || ''),
        branch: String(form.branch || ''),
        editorial: String(form.editorial || ''),
        volume: String(form.volume || ''),
        pages: Number(form.pages) || 0,
        ubicacionFisica: String(form.ubicacionFisica || ''),
        price: Number(form.price) || 0,
        stock: Number(form.stock) || 0,
        editionDate: String(form.editionDate || ''),
        imageUrl: form.imageUrl || "" 
      };

      if (editingBookId) {
         await updateDoc(doc(db, 'books', editingBookId), sanitizedBook);
      } else {
         await addDoc(collection(db, 'books'), {
           ...sanitizedBook,
           createdAt: serverTimestamp(),
         });
      }
      
      setSuccessMessage('Obra guardada correctamente');
      setForm(initialFormStatus);
      setEditingBookId(null);
      setIsModalOpen(false);

    } catch (error: any) {
      console.error('Error Crítico:', error);
      setErrorMessage('Error al guardar: ' + (error.message || 'Error desconocido'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredBooks = books.filter(book => 
    book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    book.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
    book.editorial?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    book.isbn.includes(searchTerm)
  );

  return (
    <div className="space-y-6 relative h-full flex flex-col">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800">Inventario Literario</h2>
          <p className="text-gray-500 text-sm mt-1">Gestión logística del catálogo de obras jurídicas</p>
        </div>
        <button 
          onClick={openFormForAdd}
          className="bg-navy-800 hover:bg-navy-700 text-white px-5 py-2.5 rounded-md flex items-center gap-2 transition-colors font-medium shadow-sm"
        >
          <Plus size={20} />
          <span>Nueva Obra</span>
        </button>
      </div>

      <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-0">
        <div className="p-5 border-b border-gray-100 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar por Título, Autor, Editorial o ISBN..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSearchTerm('');
              }}
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent text-sm"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-navy-600 transition-colors p-1"
                title="Limpiar búsqueda"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-gray-50 text-navy-800 text-xs border-b border-gray-200 uppercase tracking-wider">
              <tr>
                <th className="py-4 px-6 font-semibold w-16 text-center">Portada</th>
                <th className="py-4 px-6 font-semibold min-w-[280px]">Obra, Autor y Edit.</th>
                <th className="py-4 px-6 font-semibold">Rama</th>
                <th className="py-4 px-6 font-semibold text-center">Tomo - Articulos</th>
                <th className="py-4 px-6 font-semibold text-center uppercase tracking-tight">Año</th>
                <th className="py-4 px-6 font-semibold text-center uppercase tracking-tight">Páginas</th>
                <th className="py-4 px-6 font-semibold text-center">Ubicacion</th>
                <th className="py-4 px-6 font-semibold text-right">Precio</th>
                <th className="py-4 px-6 font-semibold text-center">Stock</th>
                <th className="py-4 px-6 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {books.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                      <BookOpen className="w-12 h-12 text-gray-300 mb-3" />
                      <p className="text-lg font-medium text-gray-600">El catálogo está vacío.</p>
                      <p className="text-sm">Agrega el primer libro usando el botón 'Nueva Obra'.</p>
                    </div>
                  </td>
                </tr>
              ) : filteredBooks.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-gray-500">
                    No se encontraron coincidencias.
                  </td>
                </tr>
              ) : (
                filteredBooks.map((book) => (
                  <tr key={book.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="py-4 px-6 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="mx-auto w-10 h-14 overflow-hidden rounded shadow-sm border border-gray-200 bg-white">
                          {book.imageUrl ? (
                            <img 
                              src={book.imageUrl} 
                              alt={book.title} 
                              className="w-full h-full object-cover" 
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=Error';
                              }}
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-50 flex items-center justify-center text-gray-300">
                               <ImageIcon size={16} />
                            </div>
                          )}
                        </div>
                        {book.imageUrl ? (
                          <a 
                            href={book.imageUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-500 hover:text-blue-700 transition-colors uppercase tracking-tight"
                            title="Ver imagen completa"
                          >
                            <Eye size={10} /> Ver
                          </a>
                        ) : (
                          <span className="text-[10px] font-bold text-gray-300 uppercase tracking-tight flex items-center gap-1 cursor-not-allowed">
                             S/F
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <p className="font-semibold text-gray-900 group-hover:text-navy-700 leading-snug">{book.title}</p>
                      <p className="text-sm text-gray-600 mt-1">{book.author} <span className="text-gray-300 mx-1">|</span> {book.editorial || 'S/E'}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">ISBN: {book.isbn}</p>
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                        {book.branch}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <p className="text-sm font-medium text-gray-800">{book.volume || '-'}</p>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <p className="text-sm text-gray-500 font-bold">{book.editionDate || 'S/D'}</p>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className="text-sm text-gray-600 font-mono italic">
                        {book.pages || '0'} pág.
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className="text-sm font-medium text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-100 whitespace-nowrap">
                        {book.ubicacionFisica || 'Sin asignar'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right font-medium text-gray-900">
                      ${book.price.toFixed(2)}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-semibold border ${
                        book.stock > 5 ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'
                      }`}>
                        {book.stock} un.
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleEditBook(book)} 
                          className="p-1.5 text-navy-600 hover:bg-navy-50 rounded transition-colors"
                          title="Editar Obra"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDeleteBook(book)} 
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Eliminar Obra"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Lateral (Slide-over) para Nueva / Editar Obra */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-gray-900 bg-opacity-30 transition-opacity" onClick={() => setIsModalOpen(false)}></div>
          <div className="fixed inset-y-0 right-0 max-w-md w-full flex">
            <div className="w-full h-full bg-white shadow-xl flex flex-col transform transition-transform">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-navy-900 text-white z-10">
                <h2 className="text-lg font-medium">{editingBookId ? 'Editar Obra' : 'Ingresar Nueva Obra'}</h2>
                <button onClick={() => { setIsModalOpen(false); setEditingBookId(null); }} className="text-navy-200 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto px-6 py-6 font-sans">
                {/* Visual Cover Preview Header */}
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-navy-50 text-navy-800 rounded-lg">
                      <ImageIcon size={20} />
                    </div>
                    <h3 className="font-bold text-navy-900">Vista Previa de Portada</h3>
                  </div>
                  
                  <div className="w-full aspect-[4/3] bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center overflow-hidden">
                    {form.imageUrl ? (
                      <img 
                        src={form.imageUrl} 
                        alt="Preview" 
                        className="w-full h-full object-contain p-2"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=Link+Inv%C3%A1lido';
                        }}
                      />
                    ) : (
                      <div className="text-center p-6 bg-white w-full h-full flex flex-col items-center justify-center">
                         <div className="w-16 h-16 bg-gray-50 rounded-full border border-gray-100 flex items-center justify-center mb-3">
                            <BookOpen className="text-gray-300" size={32} />
                         </div>
                         <p className="text-xs font-semibold text-gray-400">Pega un link de imagen abajo para previsualizar</p>
                      </div>
                    )}
                  </div>
                </div>

                <form id="book-form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="p-3 bg-navy-50/50 rounded-lg border border-navy-100">
                    <label className="block text-xs font-bold text-navy-800 mb-1 uppercase tracking-wider">Pegar Link de Portada</label>
                    <input 
                      type="url" 
                      name="imageUrl" 
                      placeholder="https://ejemplo.com/imagen.jpg o link de Google Drive" 
                      value={form.imageUrl} 
                      onChange={handleInputChange} 
                      className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-600 focus:border-navy-600 sm:text-sm bg-white" 
                    />
                    <p className="text-[10px] text-navy-600 mt-1.5 flex items-center gap-1">
                      <CheckCircle size={10} /> Soporta transformación automática de Google Drive
                    </p>
                  </div>

                  <div className="pt-2 border-t border-gray-100">
                    <label className="block text-sm font-medium text-gray-700 mb-1">ISBN</label>
                    <input type="text" name="isbn" value={form.isbn} onChange={handleInputChange} required className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm" />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Título de la Obra</label>
                    <input type="text" name="title" value={form.title} onChange={handleInputChange} required className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm" />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Autor / Coautores</label>
                    <input type="text" name="author" value={form.author} onChange={handleInputChange} required className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Editorial</label>
                      <input type="text" name="editorial" placeholder="Ej: Astrea, La Ley" value={form.editorial} onChange={handleInputChange} required className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Rama del Derecho</label>
                      <select name="branch" value={form.branch} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm bg-white">
                        <option value="">Seleccione...</option>
                        <option value="Derecho Penal">Derecho Penal</option>
                        <option value="Derecho Civil">Derecho Civil</option>
                        <option value="Derecho Comercial">Derecho Comercial</option>
                        <option value="Derecho Laboral">Derecho Laboral</option>
                        <option value="Derecho Público">Derecho Administrativo/Público</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tomo</label>
                      <input type="text" name="volume" placeholder="Ej: I, II, Único" value={form.volume} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad de Páginas</label>
                      <input type="number" min="0" name="pages" placeholder="0" value={form.pages} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm" />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Edición</label>
                    <input type="text" name="editionDate" placeholder="Ej: 2024" value={form.editionDate} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm" />
                  </div>

                  <div className="pt-2 border-t border-gray-100">
                    <label className="block text-sm font-medium text-navy-800 mb-1 flex items-center gap-2">
                       Ubicación Física Logística
                    </label>
                    <input type="text" name="ubicacionFisica" placeholder="Ej: Estante A, Fila 1" value={form.ubicacionFisica} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm bg-gray-50" />
                  </div>

                  <div className="grid grid-cols-2 gap-4 pb-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Precio Unitario ($)</label>
                      <input type="number" min="0" step="0.01" name="price" value={form.price} onChange={handleInputChange} required className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm font-bold text-navy-900" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Stock Inicial</label>
                      <input type="number" min="0" name="stock" value={form.stock} onChange={handleInputChange} required className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm font-bold text-navy-900" />
                    </div>
                  </div>
                </form>
              </div>

              <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex justify-end gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  form="book-form" 
                  disabled={isSubmitting}
                  className="px-6 py-2 text-sm font-medium text-white bg-navy-800 border border-transparent rounded-md hover:bg-navy-700 focus:ring-2 focus:ring-offset-2 focus:ring-navy-500 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Guardando...' : editingBookId ? 'Guardar Cambios' : 'Anexar a Catálogo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Guardado */}
      {isSaveConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-navy-50 text-navy-600 rounded-full flex items-center justify-center mb-4">
                <HelpCircle size={28} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">¿Desea guardar esta obra en el catálogo?</h3>
              <p className="text-sm text-gray-500 mb-6">Esta acción registrará la información de forma permanente.</p>
              <div className="flex gap-3 w-full">
                <button 
                  onClick={() => setIsSaveConfirmOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleActualSubmit}
                  className="flex-1 px-4 py-2 bg-navy-800 text-white rounded-md hover:bg-navy-700 transition-colors text-sm font-medium"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Eliminación */}
      {bookToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 px-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200 border border-gray-100">
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4 shadow-inner">
                <AlertCircle size={32} />
              </div>
              <h3 className="text-xl font-bold text-navy-950 mb-2">Seguridad de Eliminación</h3>
              <p className="text-sm text-gray-500 mb-6 text-center">
                ¿Está seguro de eliminar <span className="font-bold text-red-700 italic">"{bookToDelete.title}"</span>? Esta acción no se puede deshacer.
              </p>
              
              <div className="w-full space-y-4 mb-6">
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <label className="block text-[10px] font-bold text-navy-800 mb-1.5 uppercase tracking-widest">Contraseña de Usuario</label>
                    <input 
                      type="password" 
                      placeholder="Ingrese su clave para confirmar"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-red-500 focus:border-red-500 sm:text-sm bg-white shadow-sm"
                      autoFocus
                    />
                </div>
              </div>

              <div className="flex gap-3 w-full">
                <button 
                  onClick={() => { setBookToDelete(null); setDeletePassword(''); }}
                  className="flex-1 px-4 py-2 border border-blue-200 text-navy-600 rounded-md hover:bg-navy-50 transition-colors text-sm font-bold uppercase tracking-wider"
                  disabled={isSubmitting}
                >
                  Volver
                </button>
                <button 
                  onClick={confirmDelete}
                  disabled={isSubmitting || !deletePassword}
                  className="flex-1 px-4 py-2 bg-red-700 text-white rounded-md hover:bg-red-800 transition-colors text-sm font-bold uppercase tracking-wider shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? 'Validando...' : 'ELIMINAR'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast de Éxito */}
      {successMessage && (
        <div className="fixed bottom-6 right-6 z-[70] animate-in slide-in-from-right duration-300">
          <div className="bg-navy-900 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 border border-navy-700 border-l-4 border-l-emerald-500">
            <CheckCircle className="text-emerald-400" size={20} />
            <span className="font-medium">{successMessage}</span>
          </div>
        </div>
      )}

      {/* Toast de Error */}
      {errorMessage && (
        <div className="fixed bottom-6 right-6 z-[70] animate-in slide-in-from-right duration-300">
          <div className="bg-red-900 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 border border-red-700 border-l-4 border-l-red-300">
            <AlertCircle className="text-red-300" size={20} />
            <span className="font-medium text-sm">{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="ml-2 hover:text-white/80"><X size={14}/></button>
          </div>
        </div>
      )}
    </div>
  );
};
