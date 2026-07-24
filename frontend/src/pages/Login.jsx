import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/api';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorData, setErrorData] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Estado para la animación del personaje
  const [focusState, setFocusState] = useState('idle'); // 'idle', 'username', 'password'
  
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorData(null);
    setLoading(true);

    try {
      const data = await authService.login(username, password);
      if (data.is_admin) {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setErrorData(err.message);
    } finally {
      setLoading(false);
      setFocusState('idle');
    }
  };

  // Determinar la postura del personaje según el foco
  const getMascotState = () => {
    if (focusState === 'password') {
      return showPassword ? 'peek' : 'blind';
    }
    if (focusState === 'username') return 'typing';
    return 'idle';
  };

  const mascotState = getMascotState();

  // Estilos dinámicos calculados (Animaciones con efecto rebote)
  const leftPawStyle = {
    transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
    transformOrigin: '25px 105px',
    transform: mascotState === 'blind' ? 'translate(20px, -55px) rotate(15deg)' :
               mascotState === 'peek' ? 'translate(5px, -35px) rotate(-10deg)' :
               mascotState === 'typing' ? 'translate(10px, -15px) rotate(5deg)' :
               'translate(0px, 0px) rotate(0deg)'
  };

  const rightPawStyle = {
    transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
    transformOrigin: '95px 105px',
    transform: (mascotState === 'blind' || mascotState === 'peek') ? 'translate(-20px, -55px) rotate(-15deg)' :
               mascotState === 'typing' ? 'translate(-10px, -15px) rotate(-5deg)' :
               'translate(0px, 0px) rotate(0deg)'
  };

  const pupilStyle = {
    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    transform: mascotState === 'typing' ? 'translate(0px, 4px)' : // Mira hacia abajo (teclado)
               mascotState === 'peek' ? 'translate(-4px, 2px)' :  // Mira de reojo al botón
               'translate(0px, 0px)'
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-900 flex items-center justify-center p-4 relative overflow-hidden">
      
      {/* Elementos decorativos de fondo */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-md w-full bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-white/20 relative z-10">
        
        {/* Personaje Interactivo SVG */}
        <div className="w-full flex justify-center mb-2 pointer-events-none">
          <svg viewBox="0 0 120 120" className="w-32 h-32 overflow-visible z-20 drop-shadow-md">
            {/* Orejas */}
            <circle cx="30" cy="25" r="14" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
            <circle cx="30" cy="25" r="6" fill="#f1f5f9" />
            <circle cx="90" cy="25" r="14" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
            <circle cx="90" cy="25" r="6" fill="#f1f5f9" />

            {/* Cabeza */}
            <circle cx="60" cy="55" r="40" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />

            {/* Sonrojo */}
            <ellipse cx="35" cy="60" rx="5" ry="3" fill="#fecdd3" opacity="0.7" />
            <ellipse cx="85" cy="60" rx="5" ry="3" fill="#fecdd3" opacity="0.7" />

            {/* Hocico / Nariz */}
            <ellipse cx="60" cy="70" rx="14" ry="10" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" />
            <circle cx="60" cy="66" r="3.5" fill="#334155" />
            <path d="M 56.5 72 Q 60 76 63.5 72" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round" />

            {/* Ojos y Pupilas animadas */}
            <g style={pupilStyle}>
              <circle cx="45" cy="50" r="4.5" fill="#334155" />
              <circle cx="75" cy="50" r="4.5" fill="#334155" />
            </g>

            {/* Manos / Patas animadas */}
            <ellipse cx="25" cy="105" rx="14" ry="20" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" style={leftPawStyle} />
            <ellipse cx="95" cy="105" rx="14" ry="20" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" style={rightPawStyle} />
          </svg>
        </div>

        <div className="text-center mb-6">
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Bienvenido</h2>
          <p className="text-sm text-slate-500 mt-1">Ingresa a tu cuenta para continuar</p>
        </div>

        {/* Mensaje de Error */}
        {errorData && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl text-center shadow-sm animate-fade-in">
            <p className="font-semibold mb-1">
              {typeof errorData === 'object' ? errorData.message : errorData}
            </p>
            {typeof errorData === 'object' && errorData.telegram_url && (
              <a
                href={errorData.telegram_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 mt-3 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-md shadow-blue-500/20"
              >
                <span>📱</span> Contactar al Vendedor en Telegram
              </a>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Campo Usuario */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              Usuario
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none text-sm">👤</span>
              <input
                type="text"
                required
                value={username}
                onFocus={() => setFocusState('username')}
                onBlur={() => setFocusState('idle')}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none transition-all"
                placeholder="Tu nombre de usuario"
              />
            </div>
          </div>

          {/* Campo Contraseña */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              Contraseña
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none text-sm">🔒</span>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onFocus={() => setFocusState('password')}
                onBlur={() => setFocusState('idle')}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-12 py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none transition-all"
                placeholder="••••••••"
              />
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // Evita que el input pierda el focus al hacer clic en el botón
                  setShowPassword(!showPassword);
                }}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-xs font-semibold text-slate-400 hover:text-blue-600 transition-colors"
                title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? '👁️' : '🙈'}
              </button>
            </div>
          </div>

          {/* Botón de Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-500/25 transition-all transform active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Validando...</span>
              </>
            ) : (
              <span>Ingresar a la Plataforma</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}