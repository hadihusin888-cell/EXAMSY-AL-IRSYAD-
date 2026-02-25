import React, { useMemo, useState } from 'react';
import { Student, StudentStatus, Room } from '../types';

interface ProctorDashboardProps {
  gasUrl: string;
  room: Room;
  students: Student[];
  isSyncing: boolean;
  isProcessing?: boolean;
  onLogout: () => void;
  onAction: (action: string, payload: any) => Promise<boolean>;
}

const ProctorDashboard: React.FC<ProctorDashboardProps> = ({ 
  room, students, isSyncing: globalSyncing, isProcessing = false, onLogout, onAction 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [pendingStatus, setPendingStatus] = useState<StudentStatus | null>(null);

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const isInRoom = String(s.roomId || '').trim() === String(room.id).trim();
      if (!isInRoom) return false;
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const nameMatch = (s.name || '').toLowerCase().includes(term);
      const nisMatch = String(s.nis || '').toLowerCase().includes(term);
      const classMatch = String(s.class || '').toLowerCase().includes(term);
      return nameMatch || nisMatch || classMatch;
    });
  }, [students, room.id, searchTerm]);

  const handleSaveStatus = async () => {
    if (selectedStudent && pendingStatus) {
      const updatedStudent = { ...selectedStudent, status: pendingStatus };
      
      // Reset pelanggaran jika status diubah menjadi BELUM_MASUK
      if (pendingStatus === StudentStatus.BELUM_MASUK) {
        updatedStudent.violations = 0;
      }

      const ok = await onAction('UPDATE_STUDENT', updatedStudent);
      if (ok) {
        setSelectedStudent(null);
        setPendingStatus(null);
      }
    }
  };

  const getStatusBadge = (status: StudentStatus) => {
    const base = "font-black uppercase tracking-wider rounded-full text-[9px] md:text-[10px] px-2.5 md:px-3 py-1 md:py-1.5 inline-flex items-center justify-center";
    switch (status) {
      case StudentStatus.BELUM_MASUK: return <span className={`${base} bg-slate-100 text-slate-500`}>Offline</span>;
      case StudentStatus.SEDANG_UJIAN: return <span className={`${base} bg-amber-100 text-amber-600 border border-amber-200 animate-pulse`}>Ujian</span>;
      case StudentStatus.SELESAI: return <span className={`${base} bg-emerald-100 text-emerald-600`}>Selesai</span>;
      case StudentStatus.BLOKIR: return <span className={`${base} bg-red-100 text-red-600`}>Blokir</span>;
      default: return null;
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50 font-sans">
      {/* HEADER - RESPONSIVE */}
      <header className="bg-indigo-950 px-4 md:px-8 py-4 flex items-center justify-between shadow-xl z-50 shrink-0">
        <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
           <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-500 rounded-xl md:rounded-2xl flex items-center justify-center text-white font-black shrink-0 text-sm md:text-base">P</div>
           <div className="overflow-hidden">
              <h1 className="text-white font-black uppercase tracking-tight text-sm md:text-lg truncate">{(room && room.name) || 'RUANG'}</h1>
              <p className="text-indigo-300 text-[8px] md:text-[10px] font-bold uppercase tracking-widest opacity-70">Proktor Ruang</p>
           </div>
        </div>
        <div className="flex items-center gap-3 md:gap-6 shrink-0">
          {(globalSyncing || isProcessing) && <div className="w-3.5 h-3.5 md:w-4 md:h-4 border-2 border-indigo-400/30 border-t-white rounded-full animate-spin"></div>}
          <button onClick={onLogout} className="text-indigo-200 hover:text-white font-black text-[10px] md:text-sm uppercase tracking-widest transition-colors">Keluar</button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 md:p-10 bg-[#f8fafc]">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6 md:mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-5">
            <div>
              <h2 className="text-xl md:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">Status Peserta</h2>
              <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1.5 md:mt-2">Monitoring {filteredStudents.length} Siswa Aktif</p>
            </div>
            <div className="w-full md:w-80 relative group">
              <input 
                type="text" 
                placeholder="Cari Nama / NIS..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-6 py-3 md:py-3.5 bg-white border border-slate-200 rounded-2xl shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all font-medium text-sm"
              />
              <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300 group-focus-within:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* CARD LIST (MOBILE ONLY) */}
          <div className="md:hidden space-y-3 pb-10">
            {filteredStudents.length === 0 ? (
              <div className="bg-white p-10 rounded-3xl border border-dashed border-slate-200 text-center">
                <p className="text-slate-300 font-black uppercase tracking-widest text-[10px]">Data Tidak Ditemukan</p>
              </div>
            ) : (
              filteredStudents.map(student => (
                <div key={String(student.nis)} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm active:scale-[0.98] transition-all flex flex-col gap-4">
                  <div className="flex justify-between items-start">
                    <div className="overflow-hidden flex-1 pr-2">
                       <div className="flex items-center gap-2 mb-0.5">
                         <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">NIS: {student.nis}</p>
                         <span className={`${student.violations && student.violations > 0 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'} text-[8px] font-black px-1.5 py-0.5 rounded border uppercase`}>
                           {student.violations || 0} Pelanggaran
                         </span>
                       </div>
                       <h3 className="text-sm font-black text-slate-800 uppercase truncate leading-tight">{student.name}</h3>
                       <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Kelas {student.class}</p>
                    </div>
                    <div className="shrink-0">{getStatusBadge(student.status)}</div>
                  </div>
                  <button 
                    onClick={() => { setSelectedStudent(student); setPendingStatus(student.status); }}
                    className="w-full bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-600 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all"
                  >
                    Ubah Status
                  </button>
                </div>
              ))
            )}
          </div>

          {/* TABLE VIEW (DESKTOP ONLY) */}
          <div className="hidden md:block bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden mb-10">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-black tracking-widest border-b">
                  <tr>
                    <th className="px-10 py-6">Identitas</th>
                    <th className="px-10 py-6">Kelas</th>
                    <th className="px-10 py-6 text-center">Status Ujian</th>
                    <th className="px-10 py-6 text-right">Navigasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-10 py-24 text-center text-slate-300 font-black uppercase tracking-widest text-xs">Kosong dalam jangkauan filter</td>
                    </tr>
                  ) : (
                    filteredStudents.map(student => (
                      <tr key={String(student.nis)} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-10 py-6">
                           <div className="flex items-center gap-2 mb-0.5">
                             <p className="text-[10px] font-black text-indigo-600">{student.nis}</p>
                             <span className={`${student.violations && student.violations > 0 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'} text-[8px] font-black px-2 py-0.5 rounded-lg border uppercase tracking-tighter`}>
                               {student.violations || 0} Pelanggaran
                             </span>
                           </div>
                           <p className="font-black text-slate-800 uppercase text-sm tracking-tight">{student.name}</p>
                        </td>
                        <td className="px-10 py-6">
                           <span className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest">Kls {student.class}</span>
                        </td>
                        <td className="px-10 py-6 text-center">{getStatusBadge(student.status)}</td>
                        <td className="px-10 py-6 text-right">
                           <button 
                             onClick={() => { setSelectedStudent(student); setPendingStatus(student.status); }}
                             className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest px-8 py-3 rounded-2xl hover:bg-indigo-600 hover:shadow-lg hover:shadow-indigo-100 transition-all"
                           >
                             Atur
                           </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* MODAL RESPONSIVE */}
      {selectedStudent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-sm p-8 md:p-10 rounded-[2.5rem] md:rounded-[3rem] shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="text-center mb-8">
              <span className="text-[9px] md:text-[10px] font-black text-emerald-600 uppercase tracking-widest block mb-2">Manajemen Status Siswa</span>
              <h3 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tighter leading-tight">{selectedStudent.name}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-1">Kelas {selectedStudent.class} • {selectedStudent.nis}</p>
            </div>
            
            <div className="grid grid-cols-1 gap-3 mb-8">
              {[StudentStatus.BELUM_MASUK, StudentStatus.SEDANG_UJIAN, StudentStatus.SELESAI, StudentStatus.BLOKIR].map(status => (
                <button
                  key={status}
                  disabled={isProcessing}
                  onClick={() => setPendingStatus(status)}
                  className={`w-full py-4 rounded-2xl border-2 font-black text-[10px] md:text-[11px] uppercase tracking-widest transition-all duration-300 ${
                    pendingStatus === status 
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-xl shadow-emerald-100' 
                    : 'bg-slate-50 border-slate-50 text-slate-400 hover:border-slate-200 disabled:opacity-50'
                  }`}
                >
                  {status.replace('_', ' ')}
                </button>
              ))}
            </div>
            
            <div className="flex flex-col gap-2">
              <button 
                onClick={handleSaveStatus} 
                disabled={isProcessing}
                className="group w-full bg-gradient-to-r from-indigo-600 to-indigo-700 disabled:from-slate-400 disabled:to-slate-500 text-white py-4 md:py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-indigo-500/25 flex items-center justify-center gap-3 active:scale-95 transition-all duration-300"
              >
                {isProcessing ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
                {isProcessing ? 'MEMPROSES...' : 'SIMPAN PERUBAHAN'}
              </button>
              <button 
                onClick={() => setSelectedStudent(null)} 
                disabled={isProcessing}
                className="w-full py-3 text-slate-400 font-bold text-[10px] uppercase tracking-widest hover:text-red-500 transition-colors disabled:opacity-50"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        ::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
        @media (max-width: 768px) {
          .py-4\.5 {
            padding-top: 1.125rem;
            padding-bottom: 1.125rem;
          }
        }
      `}</style>
    </div>
  );
};

export default ProctorDashboard;