import React, { useState, useEffect } from 'react';
import { fetchWithAuth, authService } from '../services/api';

// Obtener la URL base del backend desde la variable de entorno o fallback a Render/Local
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://tu-backend.onrender.com';

export default function UserDashboard() {
  const [user, setUser] = useState(null);
  const [myFolder, setMyFolder] = useState(null);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  // USUARIO PERSONAL DE TELEGRAM
  const MY_TELEGRAM_USERNAME = "alsahhimkal"; 

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const resUser = await fetchWithAuth('/auth/me');
      if (resUser.ok) {
        const userData = await resUser.json();
        setUser(userData);
        if (userData.folder_id) {
          loadFolderFiles(userData.folder_id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadFolderFiles = async (folderId) => {
    const res = await fetchWithAuth(`/folders/${folderId}`);
    if (res.ok) {
      const folderData = await res.json();
      setMyFolder(folderData);
    }
  };

  // Cálculo de estado y días de la suscripción
  const getSubscriptionInfo = () => {
    if (!user?.subscription_expires_at) {
      return { isExpired: false, daysLeft: 999, label: 'Sin límite' };
    }

    const expiresDate = new Date(user.subscription_expires_at);
    const today = new Date();
    const diffTime = expiresDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
      isExpired: diffDays <= 0,
      daysLeft: diffDays,
      formattedDate: expiresDate.toLocaleDateString()
    };
  };

  const subInfo = getSubscriptionInfo();

  const handleConvert = async () => {
    if (!file || subInfo.isExpired) return;
    setLoading(true);
    setStatus('Enviando imagen y procesando con Telegram...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetchWithAuth('/convert', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail);
      }

      setStatus('¡Proceso completado! Archivo PDF guardado.');
      setFile(null);
      if (user?.folder_id) loadFolderFiles(user.folder_id);
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (pdfId, filename) => {
    const res = await fetchWithAuth(`/downloads/${pdfId}`);
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    }
  };

  // ✏️ FUNCIÓN PARA RENOMBRAR PDF
  const handleRename = async (pdfId, currentFilename) => {
    const newName = prompt("Ingresa el nuevo nombre para el archivo:", currentFilename);
    if (!newName || newName.trim() === '' || newName === currentFilename) return;

    try {
      const res = await fetchWithAuth(`/pdfs/${pdfId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_name: newName })
      });

      if (res.ok) {
        if (user?.folder_id) loadFolderFiles(user.folder_id);
      } else {
        const err = await res.json();
        alert(`Error al renombrar: ${err.detail || 'No se pudo actualizar'}`);
      }
    } catch (e) {
      alert(`Error de conexión: ${e.message}`);
    }
  };

  // 🗑️ FUNCIÓN PARA ELIMINAR PDF E IMAGEN
  const handleDelete = async (pdfId, filename) => {
    if (!confirm(`¿Estás seguro de eliminar el archivo "${filename}" y su imagen?`)) return;

    try {
      const res = await fetchWithAuth(`/pdfs/${pdfId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        if (user?.folder_id) loadFolderFiles(user.folder_id);
      } else {
        const err = await res.json();
        alert(`Error al eliminar: ${err.detail || 'No se pudo borrar'}`);
      }
    } catch (e) {
      alert(`Error de conexión: ${e.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      {/* Header Principal */}
      <div className="max-w-4xl mx-auto flex justify-between items-center bg-white p-4 rounded-xl shadow mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Panel de Cliente</h1>
          <p className="text-xs text-gray-500">Bienvenido, {user?.username}</p>
        </div>
        <button
          onClick={authService.logout}
          className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 text-sm font-medium transition-colors"
        >
          Cerrar Sesión
        </button>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Tarjeta con Estado de Suscripción */}
        <div className="bg-white p-5 rounded-xl shadow border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-1">Estado de tu Cuenta</h3>
            <p className="text-xs text-gray-500">
              {user?.subscription_expires_at
                ? `Vence el: ${subInfo.formattedDate}`
                : 'Acceso sin límite de tiempo'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {subInfo.isExpired ? (
              <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold border border-red-200">
                🚫 Suscripción Vencida
              </span>
            ) : subInfo.daysLeft <= 3 ? (
              <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-bold border border-amber-200">
                ⚠️ Vence en {subInfo.daysLeft} día(s)
              </span>
            ) : (
              <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200">
                ✅ Activo ({subInfo.daysLeft} días restantes)
              </span>
            )}
            
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium border ${
                user?.telegram_chat_id
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-gray-100 text-gray-500 border-gray-200'
              }`}
            >
              ✈️ {user?.telegram_chat_id ? 'Telegram Vinculado' : 'Sin Telegram'}
            </span>
          </div>
        </div>

        {/* Advertencia si vence pronto */}
        {(subInfo.isExpired || subInfo.daysLeft <= 3) && (
          <div className={`p-5 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm ${
            subInfo.isExpired ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{subInfo.isExpired ? '🚫' : '⚠️'}</span>
              <div>
                <h4 className="font-bold text-sm">
                  {subInfo.isExpired
                    ? 'Tu suscripción ha vencido y el servicio está bloqueado'
                    : `Tu suscripción vencerá pronto (${subInfo.daysLeft} días restantes)`}
                </h4>
                <p className="text-xs mt-0.5">
                  Contacta al administrador por Telegram para solicitar tu renovación.
                </p>
              </div>
            </div>

            <a
              href={`https://t.me/${MY_TELEGRAM_USERNAME}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow transition-colors whitespace-nowrap flex items-center gap-2"
            >
              ✈️ Contactar para Renovar
            </a>
          </div>
        )}

        {/* Zona de Carga de Archivos */}
        <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Convertir Nueva Imagen</h2>
          
          <input
            type="file"
            accept="image/*"
            disabled={subInfo.isExpired}
            onChange={(e) => setFile(e.target.files[0])}
            className="block w-full text-sm text-gray-500 mb-4 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
          />

          {status && <div className="mb-4 p-3 bg-gray-50 text-xs rounded border border-gray-200 text-gray-700">{status}</div>}

          <button
            onClick={handleConvert}
            disabled={!file || loading || subInfo.isExpired}
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {subInfo.isExpired ? '🚫 Renueva tu suscripción para convertir' : loading ? 'Procesando...' : 'Convertir a PDF'}
          </button>
        </div>

        {/* Historial de PDFs con Vista Previa, Renombrar y Eliminar */}
        <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Mis Documentos PDF</h2>
          <div className="space-y-3">
            {!myFolder || myFolder.files.length === 0 ? (
              <p className="text-sm text-gray-400">No tienes documentos procesados aún.</p>
            ) : (
              myFolder.files.map((pdf) => (
                <div key={pdf.id} className="p-3 border rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50 gap-3">
                  
                  {/* Vista Previa de la Imagen + Nombre de Archivo */}
                  <div className="flex items-center gap-3 overflow-hidden">
                    {pdf.image_path ? (
                      <img 
                        src={`${API_BASE_URL}/${pdf.image_path}`} 
                        alt="Previsualización" 
                        className="w-12 h-12 object-cover rounded-lg border border-gray-200 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center text-xs text-gray-400 flex-shrink-0">
                        📄
                      </div>
                    )}

                    <div className="truncate">
                      <p className="text-sm font-semibold text-gray-800 truncate" title={pdf.filename}>
                        {pdf.filename}
                      </p>
                      <p className="text-xs text-gray-400">
                        {pdf.uploaded_at ? new Date(pdf.uploaded_at).toLocaleString() : 'Reciente'}
                      </p>
                    </div>
                  </div>

                  {/* Acciones: Renombrar, Descargar y Eliminar */}
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      onClick={() => handleRename(pdf.id, pdf.filename)}
                      title="Renombrar archivo"
                      className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
                    >
                      ✏️ Renombrar
                    </button>

                    <button
                      onClick={() => handleDownload(pdf.id, pdf.filename)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors"
                    >
                      ⬇️ Descargar
                    </button>

                    <button
                      onClick={() => handleDelete(pdf.id, pdf.filename)}
                      title="Eliminar archivo"
                      className="bg-red-100 hover:bg-red-200 text-red-600 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
                    >
                      🗑️
                    </button>
                  </div>

                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}