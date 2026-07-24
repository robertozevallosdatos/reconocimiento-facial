import React, { useState, useEffect } from 'react';
import { fetchWithAuth, authService } from '../services/api';

export default function AdminDashboard() {
  const [folders, setFolders] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [folderDetails, setFolderDetails] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [activeTab, setActiveTab] = useState('folders'); // 'folders' o 'users'
  
  // Notificación tipo Toast
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Modal para Editar Carpeta
  const [editFolderModal, setEditFolderModal] = useState({ show: false, id: null, currentName: '' });
  const [folderNameInput, setFolderNameInput] = useState('');

  // Modal para Confirmación de Eliminación (Carpetas o Usuarios)
  const [confirmModal, setConfirmModal] = useState({
    show: false,
    title: '',
    message: '',
    type: 'folder', // 'folder' o 'user'
    targetId: null,
    targetName: ''
  });

  // Modal de Crear Usuario
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [selectedUserFolder, setSelectedUserFolder] = useState('');
  const [isAdminRole, setIsAdminRole] = useState(false);
  const [daysActive, setDaysActive] = useState(30);

  // Subida de imagen
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadFolders();
    loadUsers();
  }, []);

  const showNotification = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'success' });
    }, 3500);
  };

  const loadFolders = async () => {
    try {
      const res = await fetchWithAuth('/folders');
      if (res.ok) {
        const data = await res.json();
        setFolders(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await fetchWithAuth('/auth/users');
      if (res.ok) {
        const data = await res.json();
        setUsersList(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadFolderDetails = async (folderId) => {
    try {
      const res = await fetchWithAuth(`/folders/${folderId}`);
      if (res.ok) {
        const data = await res.json();
        setFolderDetails(data);
        setSelectedFolder(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    const res = await fetchWithAuth('/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName }),
    });

    if (res.ok) {
      setNewFolderName('');
      showNotification('📁 Carpeta creada con éxito.');
      loadFolders();
    } else {
      const err = await res.json();
      showNotification(err.detail || 'Error al crear carpeta.', 'error');
    }
  };

  // Abrir Modal de Renombrar
  const openEditModal = (folderId, currentName) => {
    setEditFolderModal({ show: true, id: folderId, currentName });
    setFolderNameInput(currentName);
  };

  // Guardar Renombrado
  const handleRenameFolderSubmit = async (e) => {
    e.preventDefault();
    const cleanName = folderNameInput.trim();
    if (!cleanName || cleanName === editFolderModal.currentName) {
      setEditFolderModal({ show: false, id: null, currentName: '' });
      return;
    }

    const res = await fetchWithAuth(`/folders/${editFolderModal.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cleanName }),
    });

    if (res.ok) {
      showNotification('✏️ Carpeta renombrada exitosamente.');
      setEditFolderModal({ show: false, id: null, currentName: '' });
      loadFolders();
      if (selectedFolder?.id === editFolderModal.id) loadFolderDetails(editFolderModal.id);
    } else {
      const err = await res.json();
      showNotification(err.detail || 'Error al renombrar.', 'error');
    }
  };

  // Abrir Modal de Confirmación para Eliminar Carpeta
  const promptDeleteFolder = (folderId, folderName) => {
    setConfirmModal({
      show: true,
      title: '¿Eliminar carpeta?',
      message: `Esta acción eliminará de forma permanente la carpeta "${folderName}" y todos los archivos PDF contenidos en ella.`,
      type: 'folder',
      targetId: folderId,
      targetName: folderName
    });
  };

  // Abrir Modal de Confirmación para Eliminar Usuario
  const promptDeleteUser = (userId, username) => {
    setConfirmModal({
      show: true,
      title: '¿Eliminar usuario?',
      message: `El usuario "${username}" perderá inmediatamente el acceso a la plataforma.`,
      type: 'user',
      targetId: userId,
      targetName: username
    });
  };

  // Ejecutar Eliminación según tipo
  const handleConfirmAction = async () => {
    const { type, targetId, targetName } = confirmModal;
    setConfirmModal({ ...confirmModal, show: false });

    if (type === 'folder') {
      const res = await fetchWithAuth(`/folders/${targetId}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification(`🗑️ Carpeta "${targetName}" eliminada.`, 'success');
        if (selectedFolder?.id === targetId) {
          setSelectedFolder(null);
          setFolderDetails(null);
        }
        loadFolders();
      } else {
        const err = await res.json();
        showNotification(err.detail || 'Error al eliminar la carpeta.', 'error');
      }
    } else if (type === 'user') {
      const res = await fetchWithAuth(`/auth/users/${targetId}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification(`❌ Usuario "${targetName}" eliminado.`);
        loadUsers();
      } else {
        const err = await res.json();
        showNotification(err.detail || 'Error al eliminar usuario.', 'error');
      }
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    const res = await fetchWithAuth('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: newUsername,
        password: newPassword,
        is_admin: isAdminRole,
        folder_name: isAdminRole ? null : selectedUserFolder,
        days_active: Number(daysActive)
      }),
    });

    if (res.ok) {
      showNotification('👤 Usuario registrado exitosamente.');
      setShowUserModal(false);
      setNewUsername('');
      setNewPassword('');
      setIsAdminRole(false);
      setSelectedUserFolder('');
      setDaysActive(30);
      loadUsers();
    } else {
      const err = await res.json();
      showNotification(err.detail || 'Error al registrar usuario.', 'error');
    }
  };

  const handleConvertImage = async () => {
    if (!file || !selectedFolder) return;
    setLoading(true);
    setStatus('Procesando imagen con Telegram...');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder_id', selectedFolder.id);

    try {
      const res = await fetchWithAuth('/convert', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail);
      }

      showNotification('✅ ¡PDF generado y guardado!');
      setStatus('Completado');
      setFile(null);
      loadFolderDetails(selectedFolder.id);
    } catch (e) {
      showNotification(e.message, 'error');
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async (pdfId, filename) => {
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
    <div className="min-h-screen bg-gray-100 p-6 relative">
      
      {/* Toast Notification */}
      {toast.show && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-xl text-white font-medium text-sm transition-all transform animate-bounce ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-600'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header Principal */}
      <div className="max-w-7xl mx-auto flex justify-between items-center bg-white p-4 rounded-xl shadow mb-6">
        <div className="flex gap-4 items-center">
          <h1 className="text-xl font-bold text-gray-800">Panel Administrador</h1>
          
          {/* Tabs */}
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('folders')}
              className={`px-3 py-1 rounded-md text-xs font-semibold ${activeTab === 'folders' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
            >
              📁 Carpetas
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`px-3 py-1 rounded-md text-xs font-semibold ${activeTab === 'users' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
            >
              👥 Usuarios
            </button>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => setShowUserModal(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-medium transition-colors"
          >
            + Crear Usuario
          </button>
          <button
            onClick={authService.logout}
            className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 text-sm font-medium transition-colors"
          >
            Cerrar Sesión
          </button>
        </div>
      </div>

      {/* Contenido según Tab Activo */}
      {activeTab === 'folders' ? (
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Columna 1: Carpetas */}
          <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Clientes / Carpetas</h2>
            
            <form onSubmit={handleCreateFolder} className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Nueva Carpeta..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="flex-1 border px-3 py-1.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">
                Crear
              </button>
            </form>

            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {folders.map((f) => (
                <div
                  key={f.id}
                  onClick={() => loadFolderDetails(f.id)}
                  className={`p-3 rounded-lg border cursor-pointer flex justify-between items-center transition-colors ${
                    selectedFolder?.id === f.id ? 'bg-blue-50 border-blue-500' : 'hover:bg-gray-50'
                  }`}
                >
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">📁 {f.name}</p>
                    <p className="text-xs text-gray-500">{f.files_count} PDFs</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditModal(f.id, f.name); }}
                      className="text-gray-400 hover:text-blue-600 text-xs p-1 rounded hover:bg-blue-50 transition-colors"
                      title="Editar nombre"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); promptDeleteFolder(f.id, f.name); }}
                      className="text-gray-400 hover:text-red-600 text-xs p-1 rounded hover:bg-red-50 transition-colors"
                      title="Eliminar carpeta"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Columna 2 y 3: Detalles y Subida */}
          <div className="md:col-span-2 space-y-6">
            {selectedFolder ? (
              <>
                <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
                  <h3 className="text-md font-bold text-gray-800 mb-2">
                    Subir Imagen para: <span className="text-blue-600">{selectedFolder.name}</span>
                  </h3>
                  
                  <div className="flex gap-4 items-center">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setFile(e.target.files[0])}
                      className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    <button
                      onClick={handleConvertImage}
                      disabled={!file || loading}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:bg-gray-300 hover:bg-blue-700"
                    >
                      {loading ? 'Procesando...' : 'Convertir y Asignar'}
                    </button>
                  </div>
                  {status && <p className="text-xs text-gray-600 mt-2">{status}</p>}
                </div>

                <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
                  <h3 className="text-md font-bold text-gray-800 mb-4">
                    PDFs en "{folderDetails?.name}"
                  </h3>
                  <div className="space-y-2">
                    {!folderDetails?.files || folderDetails.files.length === 0 ? (
                      <p className="text-sm text-gray-400">No hay archivos PDF en esta carpeta.</p>
                    ) : (
                      folderDetails.files.map((file) => (
                        <div key={file.id} className="p-3 border rounded-lg flex justify-between items-center bg-gray-50">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{file.filename}</p>
                            <p className="text-xs text-gray-400">{file.uploaded_at}</p>
                          </div>
                          <button
                            onClick={() => handleDownloadPDF(file.id, file.filename)}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded text-xs font-medium"
                          >
                            Descargar PDF
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white p-12 rounded-xl shadow text-center text-gray-400">
                Selecciona una carpeta para ver sus archivos o subir nuevas fotos.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Tab de Gestión de Usuarios */
        <div className="max-w-7xl mx-auto bg-white p-6 rounded-xl shadow border border-gray-100">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Lista de Usuarios Registrados</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-600">
                  <th className="p-3">Usuario</th>
                  <th className="p-3">Rol</th>
                  <th className="p-3">Carpeta Asignada</th>
                  <th className="p-3">Vencimiento</th>
                  <th className="p-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y text-sm">
                {usersList.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="p-3 font-medium text-gray-800">{u.username}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-md text-xs font-semibold ${u.is_admin ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {u.is_admin ? 'Administrador' : 'Cliente'}
                      </span>
                    </td>
                    <td className="p-3 text-gray-600">{u.folder_name}</td>
                    <td className="p-3 text-gray-500 text-xs">{u.subscription_expires_at}</td>
                    <td className="p-3 text-right">
                      {!u.is_admin && (
                        <button
                          onClick={() => promptDeleteUser(u.id, u.username)}
                          className="bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                        >
                          Eliminar Usuario
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Personalizado para Renombrar Carpeta */}
      {editFolderModal.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-xl max-w-sm w-full shadow-2xl animate-fade-in">
            <h3 className="text-md font-bold text-gray-800 mb-3">Renombrar Carpeta</h3>
            <form onSubmit={handleRenameFolderSubmit} className="space-y-4">
              <input
                type="text"
                required
                value={folderNameInput}
                onChange={(e) => setFolderNameInput(e.target.value)}
                className="w-full border px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nombre de la carpeta"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditFolderModal({ show: false, id: null, currentName: '' })}
                  className="px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 font-medium"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Personalizado de Confirmación de Eliminación */}
      {confirmModal.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-xl max-w-md w-full shadow-2xl text-center">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3 text-xl">
              ⚠️
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">{confirmModal.title}</h3>
            <p className="text-sm text-gray-600 mb-6">{confirmModal.message}</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setConfirmModal({ ...confirmModal, show: false })}
                className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmAction}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 font-medium shadow-sm transition-colors"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Crear Usuario */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-xl max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold mb-4 text-gray-800">Crear Nuevo Usuario</h3>
            <form onSubmit={handleCreateUser} className="space-y-4">
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol de Usuario</label>
                <select
                  value={isAdminRole ? "admin" : "client"}
                  onChange={(e) => setIsAdminRole(e.target.value === "admin")}
                  className="w-full border px-3 py-2 rounded-lg text-sm bg-gray-50 outline-none"
                >
                  <option value="client">Cliente (Con límite de tiempo)</option>
                  <option value="admin">Administrador (Acceso total)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de Usuario</label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full border px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full border px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {!isAdminRole && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Carpeta Asignada</label>
                    <select
                      required={!isAdminRole}
                      value={selectedUserFolder}
                      onChange={(e) => setSelectedUserFolder(e.target.value)}
                      className="w-full border px-3 py-2 rounded-lg text-sm bg-gray-50 outline-none"
                    >
                      <option value="">Selecciona una carpeta...</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.name}>{f.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Días de Acceso Activo</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={daysActive}
                      onChange={(e) => setDaysActive(e.target.value)}
                      className="w-full border px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-400">Ejemplo: 30 días para 1 mes.</span>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-medium"
                >
                  Guardar Usuario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}