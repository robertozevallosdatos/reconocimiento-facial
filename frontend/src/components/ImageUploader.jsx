import React, { useState } from 'react';

export default function ImageUploader() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFileSelect = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selected = e.dataTransfer.files[0];
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
    }
  };

  const handleSubmit = async () => {
    if (!file) return;

    setLoading(true);
    setStatus('Conectando y procesando...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      setStatus('Enviando imagen al servidor y procesando con Telegram...');
      const response = await fetch('http://localhost:8000/api/convert', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Error al procesar la imagen');
      }

      setStatus('Descargando PDF generado...');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resultado_${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatus('Proceso completado con éxito.');
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded-xl shadow-md border border-gray-100 mt-10">
      <h2 className="text-xl font-bold text-gray-800 mb-4 text-center">Convertidor vía Telegram Bot</h2>
      
      <div 
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors cursor-pointer"
      >
        <input 
          type="file" 
          accept="image/png, image/jpeg, image/jpg" 
          onChange={handleFileSelect} 
          className="hidden" 
          id="fileInput" 
        />
        <label htmlFor="fileInput" className="cursor-pointer">
          {preview ? (
            <img src={preview} alt="Vista previa" className="max-h-48 mx-auto rounded-md object-contain mb-2" />
          ) : (
            <p className="text-gray-500">Arrastra tu imagen aquí o haz clic para seleccionar</p>
          )}
        </label>
      </div>

      {status && (
        <div className="mt-4 p-3 bg-gray-50 text-sm text-gray-700 rounded-md text-center">
          {status}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!file || loading}
        className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg disabled:bg-gray-300 transition-colors"
      >
        {loading ? 'Procesando...' : 'Convertir a PDF'}
      </button>
    </div>
  );
}