import React, { useState, useEffect } from 'react';
import { fetchWithAuth, authService } from '../services/api';

export default function UserDashboard() {
  const [user, setUser] = useState(null);
  const [myFolder, setMyFolder] = useState(null);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

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

  const handleConvert = async () => {
    if (!file) return;
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

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto flex justify-between items-center bg-white p-4 rounded-xl shadow mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Panel de Cliente</h1>
          <p className="text-xs text-gray-500">Bienvenido, {user?.username}</p>
        </div>
        <button
          onClick={authService.logout}
          className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 text-sm font-medium"
        >
          Cerrar Sesión
        </button>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Zona de Carga */}
        <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Convertir Nueva Imagen</h2>
          
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files[0])}
            className="block w-full text-sm text-gray-500 mb-4 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />

          {status && <div className="mb-4 p-3 bg-gray-50 text-xs rounded">{status}</div>}

          <button
            onClick={handleConvert}
            disabled={!file || loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300"
          >
            {loading ? 'Procesando...' : 'Convertir a PDF'}
          </button>
        </div>

        {/* Historial de PDFs */}
        <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Mis Documentos PDF</h2>
          <div className="space-y-2">
            {!myFolder || myFolder.files.length === 0 ? (
              <p className="text-sm text-gray-400">No tienes documentos procesados aún.</p>
            ) : (
              myFolder.files.map((file) => (
                <div key={file.id} className="p-3 border rounded-lg flex justify-between items-center bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{file.filename}</p>
                    <p className="text-xs text-gray-400">{file.uploaded_at}</p>
                  </div>
                  <button
                    onClick={() => handleDownload(file.id, file.filename)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-medium"
                  >
                    Descargar PDF
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}