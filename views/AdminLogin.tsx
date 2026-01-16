
import React, { useState } from 'react';
import { Room } from '../types';

interface AdminLoginProps {
  rooms: Room[];
  onLogin: (role: 'ADMIN' | 'PROCTOR', targetRoom?: Room) => void;
  onBack: () => void;
}

const AdminLogin: React.FC<AdminLoginProps> = ({ rooms, onLogin, onBack }) => {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const inputUser = formData.username.trim();
    const inputPass = formData.password.trim();

    // 1. Cek Admin Master (Default) - Password diubah menjadi 'alirsyadsolo'
    if (inputUser === 'admin' && inputPass === 'alirsyadsolo') {
      onLogin('ADMIN');
      return;
    }

    // 2. Cek Akun Proktor dari Database ROOMS
    const roomMatch = rooms.find(r => 
      String(r.username || '').trim() === inputUser && 
      String(r.password || '').trim() === inputPass
    );

    if (roomMatch) {
      onLogin('PROCTOR', roomMatch);
      return;
    }

    setError('Username atau Password Staff salah.');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-950">
      <div className="w-full max-w-[380px] bg-white p-8 md:p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
        {/* Decorative element */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-bl-full opacity-50 -mr-6 -mt-6"></div>
        
        <button onClick={onBack} className="relative z-10 text-slate-400 hover:text-indigo-600 mb-6 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Kembali
        </button>

        <div className="relative z-10">
          <h2 className="text-2xl font-black text-slate-900 mb-0.5 tracking-tighter uppercase leading-none">Portal Staff</h2>
          <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest mb-8">Admin & Proktor Ruang</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
          <div className="space-y-1">
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Username Staff</label>
            <input
              type="text"
              required
              value={formData.username}
              onChange={e => setFormData({...formData, username: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-bold text-sm"
              placeholder="Username"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-bold pr-12 text-sm"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268-2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                )}
              </button>
            </div>
          </div>

          {error && <p className="text-red-500 text-[10px] font-bold bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98] uppercase text-[11px] tracking-widest mt-2"
          >
            Masuk Portal Staff
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;
