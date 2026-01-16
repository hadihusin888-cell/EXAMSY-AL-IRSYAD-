import React, { useState } from 'react';
import { ExamSession, Student, StudentStatus } from '../types';

interface StudentLoginProps {
  sessions: ExamSession[];
  students: Student[];
  onLogin: (student: Student, session: ExamSession) => void;
  onAdminClick: () => void;
  isProcessing?: boolean;
}

const StudentLogin: React.FC<StudentLoginProps> = ({ sessions, students, onLogin, onAdminClick, isProcessing = false }) => {
  const LOGO_URL = "https://www.alirsyad.or.id/wp-content/uploads/download/alirsyad-alislamiyyah-bw.png"; 
  
  const [formData, setFormData] = useState({
    nis: '',
    password: '',
    studentClass: '',
    pin: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing) return;
    setError('');

    const inputNis = String(formData.nis).trim();
    const inputPass = String(formData.password).trim();
    const inputClass = String(formData.studentClass).trim();
    const inputPin = String(formData.pin).trim().toUpperCase();

    // 1. Cari Siswa berdasarkan NIS & Password
    const student = students.find(s => 
      String(s.nis).trim() === inputNis && 
      String(s.password || '').trim() === inputPass
    );
    
    if (!student) {
      setError('NIS atau Password Anda tidak terdaftar.');
      return;
    }

    // 2. Cek Status Akun
    if (student.status === StudentStatus.BLOKIR) {
      setError('Akses ditolak. Akun Anda dalam status BLOKIR.');
      return;
    }

    if (student.status === StudentStatus.SELESAI) {
      setError('Anda telah menyelesaikan sesi ujian ini.');
      return;
    }

    // 3. Sinkronisasi Data Kelas Siswa
    if (String(student.class).trim() !== inputClass) {
      setError(`Sinkronisasi Gagal: Anda terdaftar di Kelas ${student.class}, bukan Kelas ${inputClass}.`);
      return;
    }

    // 4. Cari Sesi Aktif berdasarkan PIN
    const session = sessions.find(s => 
      String(s.pin || '').trim().toUpperCase() === inputPin && 
      s.isActive
    );
    
    if (!session) {
      setError('PIN Sesi tidak aktif atau tidak ditemukan.');
      return;
    }

    // 5. Sinkronisasi Data Kelas Sesi
    if (String(session.class).trim() !== inputClass) {
      setError(`Sesi ${session.name} hanya untuk Kelas ${session.class}. Silakan pilih kelas yang sesuai.`);
      return;
    }

    // Jika semua valid, lanjut ke Ruang Ujian
    onLogin(student, session);
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen p-4 bg-slate-50">
      <button 
        onClick={onAdminClick}
        disabled={isProcessing}
        className="absolute top-4 right-4 p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-white hover:shadow-md rounded-full transition-all duration-300 group disabled:opacity-50"
        title="Portal Staff"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 group-hover:rotate-90 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      <div className="w-full max-w-[380px] bg-white p-7 md:p-10 rounded-[2rem] shadow-2xl shadow-slate-200/50 border border-slate-100">
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="mb-4 w-20 h-20 bg-white rounded-2xl flex items-center justify-center border border-slate-100 shadow-sm overflow-hidden p-2">
            <img 
              src={LOGO_URL} 
              alt="Logo" 
              className="w-full h-full object-contain"
              onError={(e) => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/150?text=AL-IRSYAD"; }}
            />
          </div>
          
          <h1 className="text-xl md:text-2xl font-black text-indigo-600 mb-0.5 tracking-tighter uppercase drop-shadow-sm">
            EXAM SEMI-ONLINE
          </h1>
          <p className="text-slate-400 text-[9px] font-black uppercase tracking-[0.2em]">SMP Al Irsyad Surakarta</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1">
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nomor Induk Siswa</label>
            <input
              type="text"
              required
              disabled={isProcessing}
              value={formData.nis}
              onChange={e => setFormData({...formData, nis: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-bold disabled:opacity-70 text-sm"
              placeholder="Contoh: 1234"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                disabled={isProcessing}
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-bold pr-12 disabled:opacity-70 text-sm"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268-2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Pilih Kelas</label>
              <select
                required
                disabled={isProcessing}
                value={formData.studentClass}
                onChange={e => setFormData({...formData, studentClass: e.target.value})}
                className="w-full px-3 py-3 rounded-xl border border-slate-100 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-bold appearance-none disabled:opacity-70 text-sm"
              >
                <option value="">Kelas</option>
                <option value="7">Kls 7</option>
                <option value="8">Kls 8</option>
                <option value="9">Kls 9</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">PIN Sesi</label>
              <input
                type="text"
                required
                disabled={isProcessing}
                value={formData.pin}
                onChange={e => setFormData({...formData, pin: e.target.value})}
                className="w-full px-3 py-3 rounded-xl border border-slate-100 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-center tracking-widest font-mono font-black uppercase disabled:opacity-70 text-sm"
                placeholder="PIN"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-[10px] font-bold bg-red-50 p-3 rounded-xl border border-red-100 animate-in slide-in-from-top-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isProcessing}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-black py-4 rounded-xl shadow-lg shadow-indigo-100 transition-all active:scale-[0.98] mt-2 uppercase text-[11px] tracking-widest flex items-center justify-center gap-2"
          >
            {isProcessing && (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            )}
            {isProcessing ? 'Memproses...' : 'Mulai Ujian'}
          </button>
        </form>
      </div>

      <footer className="mt-8 text-slate-400 text-[9px] font-black uppercase tracking-widest text-center">
        &copy; 2026 HUMAS SMP AL IRSYAD SURAKARTA
      </footer>
    </div>
  );
};

export default StudentLogin;