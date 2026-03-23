import React, { useState, useEffect } from 'react';
import { Plus, Search, X, BookOpen, Upload, Image as ImageIcon, Edit2, Trash2 } from 'lucide-react';
import { collection, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import imageCompression from 'browser-image-compression';

export interface Book {
  id?: string;
  isbn: string;
  title: string;
  author: string;
  branch: string;
  editorial: string;
  volume: string;
  ubicacionFisica: string;
  price: number;
  stock: number;
  editionDate: string;
  imageUrl?: string;
  createdAt?: any;
}

const initialFormStatus = {
  isbn: '', title: '', author: '', branch: '', editorial: '', volume: '', ubicacionFisica: '', price: 0, stock: 0, editionDate: '', imageUrl: ''
};

export const Inventory: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState<Omit<Book, 'id' | 'createdAt'>>(initialFormStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

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
    setForm((prev) => ({
      ...prev,
      [name]: name === 'price' || name === 'stock' ? Number(value) : value,
    }));
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const options = { maxSizeMB: 0.5, maxWidthOrHeight: 800, useWebWorker: true };
      try {
        const compressedFile = await imageCompression(file, options);
        setImageFile(compressedFile);
        setImagePreviewUrl(URL.createObjectURL(compressedFile));
      } catch (error) {
        console.error("Error comprimiendo imagen", error);
      }
    }
  };

  const openFormForAdd = () => {
    setForm(initialFormStatus);
    setEditingBookId(null);
    setImageFile(null);
    setImagePreviewUrl(null);
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
      ubicacionFisica: book.ubicacionFisica || '',
      price: book.price,
      stock: book.stock,
      editionDate: book.editionDate,
      imageUrl: book.imageUrl || ''
    });
    setEditingBookId(book.id!);
    setImagePreviewUrl(book.imageUrl || null);
    setImageFile(null);
    setIsModalOpen(true);
  };

  const handleDeleteBook = async (book: Book) => {
    const isConfirmed = window.confirm(`¿Estás seguro de eliminar la obra "${book.title}"?\nEsta acción es irreversible.`);
    if (isConfirmed) {
      try {
        if (book.imageUrl) {
          try {
            const imgRef = ref(storage, book.imageUrl);
            await deleteObject(imgRef);
          } catch(e) { console.error("No se pudo borrar portada en Storage", e); }
        }
        await deleteDoc(doc(db, 'books', book.id!));
      } catch (error) {
        console.error("Error al eliminar obra", error);
        alert("Ocurrió un error al eliminar.");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setUploadProgress(0);
    try {
      let finalImageUrl = form.imageUrl || '';

      if (imageFile) {
        // Optimización: Eliminar imagen anterior del Storage si se sube una nueva
        if (editingBookId && form.imageUrl) {
           try {
             const oldImgRef = ref(storage, form.imageUrl);
             await deleteObject(oldImgRef);
           } catch (e) { console.log('Precaución: No se pudo borrar la imagen anterior.'); }
        }

        const storageRef = ref(storage, `books/${Date.now()}_${imageFile.name}`);
        const uploadTask = uploadBytesResumable(storageRef, imageFile);
        
        await new Promise<void>((resolve, reject) => {
          uploadTask.on('state_changed', 
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress);
            }, 
            (error) => reject(error), 
            async () => {
              finalImageUrl = await getDownloadURL(uploadTask.snapshot.ref);
              resolve();
            }
          );
        });
      }

      const submissionData = { ...form, imageUrl: finalImageUrl };

      if (editingBookId) {
         await updateDoc(doc(db, 'books', editingBookId), submissionData);
      } else {
         await addDoc(collection(db, 'books'), {
           ...submissionData,
           createdAt: serverTimestamp(),
         });
      }
      
      setForm(initialFormStatus);
      setImageFile(null);
      setImagePreviewUrl(null);
      setEditingBookId(null);
      setUploadProgress(0);
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error al guardar obra: ", error);
      alert("Error al guardar los datos.");
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
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-gray-50 text-navy-800 text-xs border-b border-gray-200 uppercase tracking-wider">
              <tr>
                <th className="py-4 px-6 font-semibold w-16 text-center">Portada</th>
                <th className="py-4 px-6 font-semibold min-w-[280px]">Obra, Autor y Edit.</th>
                <th className="py-4 px-6 font-semibold">Rama</th>
                <th className="py-4 px-6 font-semibold text-center">Tomo/Ed.</th>
                <th className="py-4 px-6 font-semibold text-center">Ubicación F.</th>
                <th className="py-4 px-6 font-semibold text-right">Precio</th>
                <th className="py-4 px-6 font-semibold text-center">Stock</th>
                <th className="py-4 px-6 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {books.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                      <BookOpen className="w-12 h-12 text-gray-300 mb-3" />
                      <p className="text-lg font-medium text-gray-600">El catálogo está vacío.</p>
                      <p className="text-sm">Agrega el primer libro usando el botón 'Nueva Obra'.</p>
                    </div>
                  </td>
                </tr>
              ) : filteredBooks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500">
                    No se encontraron coincidencias.
                  </td>
                </tr>
              ) : (
                filteredBooks.map((book) => (
                  <tr key={book.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="py-4 px-6 text-center">
                      {book.imageUrl ? (
                        <img src={book.imageUrl} alt={book.title} className="w-10 h-14 object-cover rounded shadow-sm border border-gray-200 mx-auto" />
                      ) : (
                        <div className="w-10 h-14 mx-auto bg-gray-100 rounded border border-gray-200 flex items-center justify-center text-gray-400 shadow-sm">
                           <ImageIcon size={16} />
                        </div>
                      )}
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
                      <p className="text-xs text-gray-500">{book.editionDate}</p>
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
              
              <div className="flex-1 overflow-y-auto px-6 py-6">
                <form id="book-form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="flex flex-col items-center justify-center w-full mb-4">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors relative overflow-hidden group">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        {imagePreviewUrl ? (
                          <>
                            <img src={imagePreviewUrl} alt="Preview" className="absolute inset-0 w-full h-full object-contain p-2 blur-[2px] opacity-40 group-hover:opacity-20 transition-opacity" />
                            <img src={imagePreviewUrl} alt="Preview" className="h-28 object-contain relative z-10 shadow-sm" />
                          </>
                        ) : (
                          <>
                            <Upload className="w-8 h-8 mb-2 text-gray-400 group-hover:text-navy-500 transition-colors" />
                            <p className="text-sm text-gray-500 font-semibold">Click para subir Portada</p>
                            <p className="text-xs text-gray-400 mt-1">PNG, JPG (Máx ~500kb)</p>
                          </>
                        )}
                      </div>
                      <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                    </label>
                    {uploadProgress > 0 && uploadProgress < 100 && (
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-3 overflow-hidden">
                        <div className="bg-navy-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ISBN</label>
                    <input required type="text" name="isbn" value={form.isbn} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm" />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Título de la Obra</label>
                    <input required type="text" name="title" value={form.title} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm" />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Autor / Coautores</label>
                    <input required type="text" name="author" value={form.author} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Editorial</label>
                      <input required type="text" name="editorial" placeholder="Ej: Astrea, La Ley" value={form.editorial} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Rama del Derecho</label>
                      <select required name="branch" value={form.branch} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm bg-white">
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Edición</label>
                      <input required type="text" name="editionDate" placeholder="Ej: 2024" value={form.editionDate} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm" />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-100">
                    <label className="block text-sm font-medium text-navy-800 mb-1 flex items-center gap-2">
                       Ubicación Física Logística
                    </label>
                    <input required type="text" name="ubicacionFisica" placeholder="Ej: Estante A, Fila 1" value={form.ubicacionFisica} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm bg-gray-50" />
                  </div>

                  <div className="grid grid-cols-2 gap-4 pb-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Precio Unitario ($)</label>
                      <input required type="number" min="0" step="0.01" name="price" value={form.price} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm font-bold text-navy-900" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Stock Inicial</label>
                      <input required type="number" min="0" name="stock" value={form.stock} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm font-bold text-navy-900" />
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
    </div>
  );
};
