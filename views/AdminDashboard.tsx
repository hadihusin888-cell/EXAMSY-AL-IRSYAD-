import React, { useState, useRef, useMemo } from 'react';
import { ExamSession, Student, StudentStatus, Room } from '../types';

interface AdminDashboardProps {
  sessions: ExamSession[];
  students: Student[];
  rooms: Room[];
  isSyncing: boolean;
  isProcessing?: boolean;
  onLogout: () => void;
  onAction: (action: string, payload: any) => Promise<boolean>;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  sessions, students, rooms, isSyncing, isProcessing = false, onLogout, onAction 
}) => {
  const [activeTab, setActiveTab] = useState<'SESSIONS' | 'STUDENTS' | 'ROOMS'>('SESSIONS');
  
  // Modal states
  const [showAddSession, setShowAddSession] = useState(false);
  const [sessionToEdit, setSessionToEdit] = useState<ExamSession | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [sessionToView, setSessionToView] = useState<ExamSession | null>(null);

  const [studentToEdit, setStudentToEdit] = useState<Student | null>(null);
  const [studentToAdd, setStudentToAdd] = useState(false);
  const [selectedNis, setSelectedNis] = useState<string[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [targetBulkRoomId, setTargetBulkRoomId] = useState('KEEP');
  const [targetBulkStatus, setTargetBulkStatus] = useState('KEEP');

  const [showAddRoom, setShowAddRoom] = useState(false);
  const [roomToEdit, setRoomToEdit] = useState<Room | null>(null);
  const [roomToDelete, setRoomToDelete] = useState<string | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roomFilter, setRoomFilter] = useState('ALL');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Memoized Data
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const searchStr = searchTerm.toLowerCase();
      const nameMatch = (s.name || '').toLowerCase().includes(searchStr);
      const nisMatch = String(s.nis || '').includes(searchStr);
      const matchesSearch = nameMatch || nisMatch;
      const matchesRoom = roomFilter === 'ALL' || String(s.roomId || '').trim() === String(roomFilter).trim();
      return matchesSearch && matchesRoom;
    });
  }, [students, searchTerm, roomFilter]);

  const toggleSelectAllVisible = () => {
    const allVisibleSelected = filteredStudents.length > 0 && filteredStudents.every(s => selectedNis.includes(String(s.nis)));
    if (allVisibleSelected) {
      const visibleNis = filteredStudents.map(s => String(s.nis));
      setSelectedNis(prev => prev.filter(n => !visibleNis.includes(n)));
    } else {
      const visibleNis = filteredStudents.map(s => String(s.nis));
      setSelectedNis(prev => Array.from(new Set([...prev, ...visibleNis])));
    }
  };

  const handleDownloadTemplate = () => {
    const headers = "NIS,NAMA_SISWA,KELAS_SISWA,RUANG_NAMA,PASSWORD,STATUS";
    const sampleRow = "\n1234,NAMA SISWA CONTOH,7,RUANG 01,password123,BELUM_MASUK";
    const blob = new Blob([headers + sampleRow], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_siswa_examsy.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      let count = 0;
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',');
        if (row.length < 2) continue;
        const [nis, name, cls, roomName, pass, stat] = row;
        if (nis && name) {
          const targetRoom = rooms.find(r => 
            (r.name || '').toUpperCase() === (roomName || '').trim().toUpperCase()
          );
          await onAction('ADD_STUDENT', {
            nis: String(nis).trim(),
            name: String(name).trim().toUpperCase(),
            class: String(cls || "").trim(),
            roomId: targetRoom ? targetRoom.id : "",
            password: (pass || "password123").trim(),
            status: (stat || StudentStatus.BELUM_MASUK).trim()
          });
          count++;
        }
      }
      alert(`Berhasil mengimpor ${count} data siswa.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleBulkUpdate = async () => {
    const updates: any = {};
    if (targetBulkRoomId !== 'KEEP') updates.roomId = targetBulkRoomId;
    if (targetBulkStatus !== 'KEEP') updates.status = targetBulkStatus;

    if (Object.keys(updates).length > 0) {
      const ok = await onAction('BULK_UPDATE_STUDENTS', { selectedNis, updates });
      if (ok) {
        setShowBulkModal(false);
        setSelectedNis([]);
        setTargetBulkRoomId('KEEP');
        setTargetBulkStatus('KEEP');
      }
    }
  };

  const getStatusBadge = (status: StudentStatus) => {
    switch (status) {
      case StudentStatus.BELUM_MASUK: return <span className="bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">Belum Masuk</span>;
      case StudentStatus.SEDANG_UJIAN: return <span className="bg-amber-100 text-amber-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider animate-pulse">Sedang Ujian</span>;
      case StudentStatus.SELESAI: return <span className="bg-emerald-100 text-emerald-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">Selesai</span>;
      case StudentStatus.BLOKIR: return <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">Blokir</span>;
      default: return null;
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50 font-sans">
      <header className="bg-white border-b border-slate-200 px-6 md:px-10 py-5 flex items-center justify-between shrink-0 z-50">
        <div className="flex items-center gap-4 md:gap-10">
          <div className="flex items-center gap-2">
             <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-600 rounded-lg md:rounded-xl flex items-center justify-center text-white font-black italic shadow-lg shadow-indigo-200">E</div>
             <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight hidden sm:block">Examsy Super Admin</h1>
          </div>
          <nav className="flex bg-slate-100 p-1 rounded-xl md:rounded-2xl">
            {(['SESSIONS', 'STUDENTS', 'ROOMS'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`px-3 md:px-6 py-1.5 md:py-2 rounded-lg md:rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                {tab === 'SESSIONS' ? 'Ujian' : tab === 'STUDENTS' ? 'Siswa' : 'Ruang'}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 md:gap-6">
          <div className="flex items-center gap-2 md:gap-3 bg-slate-50 px-3 md:px-4 py-2 rounded-xl md:rounded-2xl border border-slate-100">
             <div className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${isSyncing ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></div>
             <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">{isSyncing ? 'Sync...' : 'Online'}</span>
          </div>
          <button onClick={onLogout} className="text-slate-400 hover:text-red-600 font-bold text-xs md:text-sm">Logout</button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6 md:p-10 bg-[#f8fafc]">
        {/* SESI UJIAN */}
        {activeTab === 'SESSIONS' && (
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-4">
              <div>
                <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter uppercase leading-none">Sesi Ujian</h2>
                <p className="text-slate-400 font-medium text-xs md:text-sm mt-2 uppercase tracking-widest">Jadwal & Soal Sinkron</p>
              </div>
              <button onClick={() => setShowAddSession(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95"> + Sesi Baru </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
              {sessions.map(session => (
                <div key={session.id} className="bg-white p-5 md:p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg transition-all group">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg md:text-xl font-black text-slate-900 uppercase tracking-tight truncate pr-4">{session.name}</h3>
                    <button 
                      onClick={() => onAction('UPDATE_SESSION', { ...session, isActive: !session.isActive })} 
                      className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all border shrink-0 ${session.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}
                    >
                      {session.isActive ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  
                  <div className="flex flex-wrap gap-1.5 mb-6">
                     <span className="bg-indigo-50 text-indigo-600 text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider border border-indigo-100">KLS {session.class}</span>
                     <span className="bg-slate-50 text-slate-500 text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider border border-slate-100">PIN: {session.pin}</span>
                     <span className="bg-slate-900 text-white text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider shadow-sm">{session.durationMinutes} Menit</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button onClick={() => setSessionToView(session)} className="w-11 h-11 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all border border-indigo-100" title="Lihat Soal">
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268-2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                       </svg>
                    </button>
                    <button onClick={() => setSessionToEdit(session)} className="flex-1 bg-slate-50 hover:bg-indigo-600 hover:text-white text-indigo-600 h-11 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border border-slate-200">EDIT</button>
                    <button onClick={() => setSessionToDelete(session.id)} className="w-11 h-11 flex items-center justify-center bg-red-50 text-red-500 rounded-2xl hover:bg-red-600 hover:text-white transition-all border border-red-100">
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DATABASE SISWA */}
        {activeTab === 'STUDENTS' && (
          <div className="max-w-7xl mx-auto pb-32">
             <div className="flex flex-col lg:flex-row justify-between lg:items-end mb-10 gap-6">
                <div>
                  <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter uppercase leading-none">Database Siswa</h2>
                  <p className="text-slate-400 font-medium text-xs md:text-sm mt-2 uppercase tracking-widest">Database Terintegrasi ({students.length})</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <input type="text" placeholder="Cari Nama/NIS..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full lg:w-48 pl-6 pr-6 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:border-indigo-500 shadow-sm" />
                  <select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} className="px-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none shadow-sm">
                    <option value="ALL">Semua Ruang</option>
                    <option value="">Tanpa Ruang</option>
                    {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <button onClick={() => setStudentToAdd(true)} className="bg-indigo-600 text-white px-5 py-3.5 rounded-2xl font-black text-[10px] uppercase shadow-lg active:scale-95 transition-all"> + Siswa </button>
                  <button onClick={() => fileInputRef.current?.click()} className="bg-slate-900 text-white px-5 py-3.5 rounded-2xl font-black text-[10px] uppercase transition-all shadow-lg active:scale-95">Impor CSV</button>
                  <button onClick={handleDownloadTemplate} className="bg-white text-slate-600 border border-slate-200 px-5 py-3.5 rounded-2xl font-black text-[10px] uppercase transition-all shadow-sm active:scale-95">Template CSV</button>
                  <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleImportCSV} />
                </div>
             </div>

             {selectedNis.length > 0 && (
               <div className="mb-6 bg-indigo-600 text-white px-8 py-4 rounded-2xl flex items-center justify-between animate-in slide-in-from-top-4">
                  <span className="text-xs font-black uppercase tracking-widest">{selectedNis.length} Siswa Terpilih</span>
                  <div className="flex gap-4">
                     <button onClick={() => setShowBulkModal(true)} className="bg-white text-indigo-600 px-6 py-2 rounded-xl font-black text-[10px] uppercase">Aksi Massal</button>
                     <button onClick={() => setSelectedNis([])} className="text-white/70 font-black text-[10px] uppercase underline">Batal</button>
                  </div>
               </div>
             )}

             <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[1000px]">
                  <thead className="bg-slate-50 text-slate-400 uppercase text-[9px] font-black tracking-widest border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-6 text-center w-16">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600" onChange={toggleSelectAllVisible} checked={filteredStudents.length > 0 && filteredStudents.every(s => selectedNis.includes(String(s.nis)))} />
                      </th>
                      <th className="px-8 py-6">NIS</th>
                      <th className="px-8 py-6">Nama Siswa</th>
                      <th className="px-8 py-6">Kelas</th>
                      <th className="px-8 py-6">Ruang</th>
                      <th className="px-8 py-6">Password</th>
                      <th className="px-8 py-6 text-center">Status</th>
                      <th className="px-8 py-6 text-right pr-12">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.map(student => (
                      <tr key={String(student.nis)} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="px-6 py-5 text-center">
                          <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600" checked={selectedNis.includes(String(student.nis))} onChange={() => setSelectedNis(prev => prev.includes(String(student.nis)) ? prev.filter(n => n !== String(student.nis)) : [...prev, String(student.nis)])} />
                        </td>
                        <td className="px-8 py-5 font-mono text-indigo-600 text-[11px] font-black uppercase tracking-tight">{student.nis}</td>
                        <td className="px-8 py-5 font-black text-slate-800 tracking-tight uppercase text-xs">{student.name}</td>
                        <td className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase">Kls {student.class}</td>
                        <td className="px-8 py-5 text-[11px] font-black text-indigo-900 uppercase">{rooms.find(r => r.id === student.roomId)?.name || "-"}</td>
                        <td className="px-8 py-5 font-mono text-[11px] text-slate-500 group-hover:text-slate-800 transition-colors">{student.password}</td>
                        <td className="px-8 py-5 text-center">{getStatusBadge(student.status)}</td>
                        <td className="px-8 py-5 text-right pr-12">
                          <div className="flex justify-end gap-2">
                             <button onClick={() => setStudentToEdit(student)} title="Edit" className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                             </button>
                             <button onClick={async () => { if(confirm('Hapus siswa ini?')) await onAction('DELETE_STUDENT', { nis: student.nis }); }} title="Hapus" className="p-2 bg-red-50 text-red-400 rounded-lg hover:bg-red-600 hover:text-white transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                             </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
             </div>
          </div>
        )}

        {/* DATA RUANG */}
        {activeTab === 'ROOMS' && (
          <div className="max-w-7xl mx-auto">
             <div className="flex justify-between items-end mb-10">
                <div>
                  <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter uppercase leading-none">Manajemen Ruang</h2>
                  <p className="text-slate-400 font-medium text-xs md:text-sm mt-2 uppercase tracking-widest">Total {rooms.length} Ruang Proktor</p>
                </div>
                <button onClick={() => setShowAddRoom(true)} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase shadow-xl transition-all"> + Tambah Ruang </button>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {rooms.map(room => (
                  <div key={room.id} className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                    <h3 className="text-xl font-black text-slate-900 mb-4 uppercase tracking-tighter leading-none">{room.name}</h3>
                    <div className="space-y-2 mb-8">
                       <div className="flex justify-between items-center text-[10px] font-black uppercase">
                          <span className="text-slate-400">Login</span>
                          <span className="text-slate-700 font-mono">{room.username}</span>
                       </div>
                    </div>
                    <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                      <button onClick={() => setRoomToEdit(room)} className="text-indigo-600 font-black text-[10px] uppercase tracking-widest hover:underline">Edit Detail</button>
                      <button onClick={() => setRoomToDelete(room.id)} className="text-red-400 hover:text-red-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        )}
      </main>

      {/* MODALS */}

      {/* MODAL KONFIRMASI HAPUS SESI */}
      {sessionToDelete && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm p-10 rounded-[3rem] shadow-2xl animate-in zoom-in-95 duration-200 text-center border-t-8 border-red-600">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
               </svg>
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Hapus Sesi?</h3>
            <p className="text-slate-500 text-[11px] font-bold uppercase mb-10 leading-relaxed px-4">Seluruh data konfigurasi sesi dan akses siswa terkait akan dihapus permanen.</p>
            <div className="flex flex-col gap-3">
              <button 
                disabled={isProcessing}
                onClick={async () => {
                  const ok = await onAction('DELETE_SESSION', { id: sessionToDelete });
                  if(ok) setSessionToDelete(null);
                }} 
                className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                {isProcessing && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                {isProcessing ? 'Menghapus...' : 'Ya, Hapus Sesi'}
              </button>
              <button onClick={() => setSessionToDelete(null)} disabled={isProcessing} className="w-full text-slate-400 font-bold py-2 text-[10px] uppercase hover:text-slate-600 transition-colors">Batal</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI HAPUS RUANG */}
      {roomToDelete && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm p-10 rounded-[3rem] shadow-2xl animate-in zoom-in-95 duration-200 text-center border-t-8 border-red-600">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
               </svg>
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Hapus Ruang?</h3>
            <p className="text-slate-500 text-[11px] font-bold uppercase mb-10 leading-relaxed px-4">Akses proktor untuk ruang ini akan dihapus. Siswa di ruang ini akan kehilangan pemetaan ruang.</p>
            <div className="flex flex-col gap-3">
              <button 
                disabled={isProcessing}
                onClick={async () => {
                  const ok = await onAction('DELETE_ROOM', { id: roomToDelete });
                  if(ok) setRoomToDelete(null);
                }} 
                className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                {isProcessing && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                {isProcessing ? 'Menghapus...' : 'Ya, Hapus Ruang'}
              </button>
              <button onClick={() => setRoomToDelete(null)} disabled={isProcessing} className="w-full text-slate-400 font-bold py-2 text-[10px] uppercase hover:text-slate-600 transition-colors">Batal</button>
            </div>
          </div>
        </div>
      )}

      {sessionToView && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-6xl h-[90vh] flex flex-col rounded-[2.5rem] shadow-2xl animate-in zoom-in-95 overflow-hidden">
            <div className="flex justify-between items-center px-10 py-6 border-b border-slate-100 shrink-0">
               <div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">{sessionToView.name}</h3>
                  <div className="flex gap-4 mt-2">
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Kls {sessionToView.class}</span>
                    <span className="text-indigo-600 text-[10px] font-black uppercase tracking-widest">PIN: {sessionToView.pin}</span>
                    <span className="text-slate-900 text-[10px] font-black uppercase tracking-widest">{sessionToView.durationMinutes} Menit</span>
                  </div>
               </div>
               <div className="flex items-center gap-4">
                  {sessionToView.pdfUrl && (
                    <a href={sessionToView.pdfUrl} target="_blank" rel="noopener noreferrer" className="bg-indigo-50 text-indigo-600 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase hover:bg-indigo-600 hover:text-white transition-all">Buka di Tab Baru</a>
                  )}
                  <button onClick={() => setSessionToView(null)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
               </div>
            </div>
            
            <div className="flex-1 bg-slate-100 relative">
               {sessionToView.pdfUrl ? (
                 <iframe 
                   src={`${sessionToView.pdfUrl}#toolbar=0&navpanes=0`} 
                   className="w-full h-full border-none"
                   title="PDF Preview"
                 />
               ) : (
                 <div className="absolute inset-0 flex items-center justify-center text-slate-400 font-black uppercase tracking-widest text-xs">
                   Tidak ada link PDF soal tersedia
                 </div>
               )}
            </div>
          </div>
        </div>
      )}

      {showBulkModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-sm p-10 rounded-[3rem] shadow-2xl animate-in zoom-in-95">
            <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter leading-none">Aksi Massal</h3>
            <p className="text-slate-400 text-[10px] font-black uppercase mb-8">{selectedNis.length} Siswa Terpilih</p>
            
            <div className="space-y-6">
               <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Pindahkan ke Ruang</label>
                  <select value={targetBulkRoomId} disabled={isProcessing} onChange={e => setTargetBulkRoomId(e.target.value)} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none">
                     <option value="KEEP">Jangan Ubah Ruang</option>
                     <option value="">Hapus dari Ruang</option>
                     {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
               </div>
               
               <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ubah Status Menjadi</label>
                  <select value={targetBulkStatus} disabled={isProcessing} onChange={e => setTargetBulkStatus(e.target.value)} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none">
                     <option value="KEEP">Jangan Ubah Status</option>
                     {Object.values(StudentStatus).map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
               </div>
               
               <div className="pt-6 flex flex-col gap-2">
                  <button onClick={handleBulkUpdate} disabled={isProcessing} className="w-full bg-indigo-600 disabled:bg-indigo-400 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg flex items-center justify-center gap-2">
                    {isProcessing && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                    {isProcessing ? 'Memproses...' : 'TERAPKAN PERUBAHAN'}
                  </button>
                  <button onClick={() => setShowBulkModal(false)} disabled={isProcessing} className="w-full text-slate-400 py-2 font-bold uppercase text-[10px]">Batal</button>
               </div>
            </div>
          </div>
        </div>
      )}

      {(studentToEdit || studentToAdd) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-xl p-10 rounded-[3rem] shadow-2xl animate-in zoom-in-95">
            <h3 className="text-2xl font-black text-slate-900 mb-8 uppercase tracking-tighter leading-none">{studentToEdit ? 'Ubah Siswa' : 'Tambah Siswa'}</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const data = {
                nis: (f.get('nis') as string).trim(),
                name: (f.get('name') as string).toUpperCase().trim(),
                class: f.get('class') as string,
                roomId: f.get('roomId') as string,
                password: ((f.get('password') as string) || "password123").trim(),
                status: f.get('status') as StudentStatus
              };
              const ok = await onAction(studentToEdit ? 'UPDATE_STUDENT' : 'ADD_STUDENT', data);
              if(ok) { setStudentToEdit(null); setStudentToAdd(false); }
            }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">NIS</label>
                  <input name="nis" disabled={isProcessing} defaultValue={studentToEdit?.nis} readOnly={!!studentToEdit} required placeholder="NIS" className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold uppercase outline-none focus:border-indigo-500 disabled:opacity-70" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
                  <input name="password" disabled={isProcessing} defaultValue={studentToEdit?.password || 'password123'} required placeholder="PASSWORD" className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 disabled:opacity-70" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nama Lengkap</label>
                <input name="name" disabled={isProcessing} defaultValue={studentToEdit?.name} required placeholder="NAMA LENGKAP SISWA" className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 uppercase disabled:opacity-70" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Kelas</label>
                  <select name="class" disabled={isProcessing} defaultValue={studentToEdit?.class || '7'} className="w-full px-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 disabled:opacity-70">
                      <option value="7">Kls 7</option>
                      <option value="8">Kls 8</option>
                      <option value="9">Kls 9</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ruang</label>
                  <select name="roomId" disabled={isProcessing} defaultValue={studentToEdit?.roomId || ''} className="w-full px-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 disabled:opacity-70">
                      <option value="">Kosong</option>
                      {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status</label>
                  <select name="status" disabled={isProcessing} defaultValue={studentToEdit?.status || StudentStatus.BELUM_MASUK} className="w-full px-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 disabled:opacity-70">
                      {Object.values(StudentStatus).map(s => (
                        <option key={s} value={s}>{s.replace('_', ' ')}</option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="pt-6 flex flex-col gap-2">
                 <button type="submit" disabled={isProcessing} className="w-full bg-indigo-600 disabled:bg-indigo-400 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg flex items-center justify-center gap-2">
                   {isProcessing && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                   {isProcessing ? 'Menyimpan...' : 'SIMPAN DATA'}
                 </button>
                 <button type="button" onClick={() => { setStudentToEdit(null); setStudentToAdd(false); }} disabled={isProcessing} className="w-full text-slate-400 py-2 font-bold uppercase text-[10px]">Batal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(showAddSession || sessionToEdit) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-lg p-10 rounded-[3rem] shadow-2xl animate-in zoom-in-95 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-bl-[4rem] -mr-10 -mt-10 opacity-50"></div>
            
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-8">
                 <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                 </div>
                 <div>
                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">{sessionToEdit ? 'Ubah Sesi' : 'Sesi Baru'}</h3>
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">Konfigurasi Parameter Ujian</p>
                 </div>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const ok = await onAction(sessionToEdit ? 'UPDATE_SESSION' : 'ADD_SESSION', {
                  id: sessionToEdit?.id || `s-${Date.now()}`,
                  name: (f.get('name') as string).toUpperCase().trim(),
                  class: f.get('class') as string,
                  pin: (f.get('pin') as string).trim(),
                  durationMinutes: Number(f.get('duration')),
                  isActive: sessionToEdit?.isActive || false,
                  pdfUrl: (f.get('pdfUrl') as string).trim(),
                  questions: []
                });
                if(ok) { setShowAddSession(false); setSessionToEdit(null); }
              }} className="space-y-6">
                
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Nama Mata Pelajaran / Ujian</label>
                  <input 
                    name="name" 
                    disabled={isProcessing}
                    defaultValue={sessionToEdit?.name} 
                    placeholder="CONTOH: MATEMATIKA - PAS GANJIL" 
                    required 
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 transition-all uppercase placeholder:text-slate-300 disabled:opacity-70" 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">PIN Sesi (Alfanumerik)</label>
                    <div className="relative">
                      <input 
                        name="pin" 
                        disabled={isProcessing}
                        defaultValue={sessionToEdit?.pin} 
                        placeholder="PIN123" 
                        required 
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-center font-mono font-black text-indigo-600 outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 transition-all uppercase placeholder:text-slate-300 disabled:opacity-70" 
                      />
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Target Kelas</label>
                    <select name="class" disabled={isProcessing} defaultValue={sessionToEdit?.class || "7"} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 outline-none transition-all appearance-none cursor-pointer disabled:opacity-70">
                        <option value="7">KELAS 7</option>
                        <option value="8">KELAS 8</option>
                        <option value="9">KELAS 9</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Durasi Pengerjaan</label>
                    <div className="relative">
                      <input 
                        name="duration" 
                        type="number" 
                        disabled={isProcessing}
                        defaultValue={sessionToEdit?.durationMinutes || 60} 
                        required 
                        placeholder="MENIT" 
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 transition-all placeholder:text-slate-300 pl-12 disabled:opacity-70" 
                      />
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300 uppercase">Menit</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Status Sesi</label>
                    <div className="flex items-center gap-2 h-full py-2">
                       <span className={`text-[10px] font-black uppercase px-4 py-2 rounded-xl border ${sessionToEdit?.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                          {sessionToEdit?.isActive ? 'Aktif' : 'Draft'}
                       </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">URL PDF Soal (Google Drive / Direct)</label>
                  <div className="relative">
                    <input 
                      name="pdfUrl" 
                      disabled={isProcessing}
                      defaultValue={sessionToEdit?.pdfUrl} 
                      placeholder="https://drive.google.com/..." 
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-medium outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 transition-all placeholder:text-slate-300 pl-12 disabled:opacity-70" 
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="pt-6 flex flex-col gap-3">
                  <button 
                    type="submit" 
                    disabled={isProcessing}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl shadow-indigo-100 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                  >
                    {isProcessing && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                    {isProcessing ? 'Menyimpan...' : (sessionToEdit ? 'PERBARUI SESI' : 'SIMPAN SESI BARU')}
                  </button>
                  <button 
                    type="button" 
                    disabled={isProcessing}
                    onClick={() => { setShowAddSession(false); setSessionToEdit(null); }} 
                    className="w-full text-slate-400 font-black uppercase text-[10px] tracking-widest py-3 hover:text-red-500 transition-colors"
                  >
                    Batalkan Perubahan
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {(showAddRoom || roomToEdit) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-lg p-10 rounded-[3rem] shadow-2xl animate-in zoom-in-95 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-[4rem] -mr-10 -mt-10 opacity-40"></div>
            
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-8">
                 <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-100">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                 </div>
                 <div>
                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">{roomToEdit ? 'Ubah Ruang' : 'Ruang Baru'}</h3>
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">Pengaturan Lokasi & Akses Proktor</p>
                 </div>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const ok = await onAction(roomToEdit ? 'UPDATE_ROOM' : 'ADD_ROOM', {
                  id: roomToEdit?.id || `r-${Date.now()}`,
                  name: (f.get('name') as string).toUpperCase().trim(),
                  capacity: Number(f.get('capacity')),
                  username: (f.get('username') as string).trim(),
                  password: (f.get('password') as string).trim()
                });
                if(ok) { setShowAddRoom(false); setRoomToEdit(null); }
              }} className="space-y-6">
                
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Nama Ruangan</label>
                  <div className="relative">
                    <input 
                      name="name" 
                      disabled={isProcessing}
                      defaultValue={roomToEdit?.name} 
                      placeholder="CONTOH: RUANG 01 / LAB KOMPUTER" 
                      required 
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black outline-none focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-600 transition-all uppercase placeholder:text-slate-300 pl-12 disabled:opacity-70" 
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Kapasitas Maksimal Siswa</label>
                  <div className="relative">
                    <input 
                      name="capacity" 
                      type="number" 
                      disabled={isProcessing}
                      defaultValue={roomToEdit?.capacity || 20} 
                      required 
                      placeholder="JUMLAH KURSI" 
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black outline-none focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-600 transition-all placeholder:text-slate-300 pl-12 disabled:opacity-70" 
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </div>
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300 uppercase">Siswa</span>
                  </div>
                </div>

                <div className="bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100 space-y-4">
                  <span className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">Kredensial Login Proktor</span>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-black text-slate-500 uppercase ml-1">Username</label>
                      <input 
                        name="username" 
                        disabled={isProcessing}
                        defaultValue={roomToEdit?.username} 
                        placeholder="proktor01" 
                        required 
                        className="w-full px-5 py-3.5 bg-white border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all disabled:opacity-70" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-black text-slate-500 uppercase ml-1">Password</label>
                      <input 
                        name="password" 
                        disabled={isProcessing}
                        defaultValue={roomToEdit?.password} 
                        placeholder="********" 
                        required 
                        className="w-full px-5 py-3.5 bg-white border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all disabled:opacity-70" 
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-6 flex flex-col gap-3">
                  <button 
                    type="submit" 
                    disabled={isProcessing}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl shadow-emerald-100 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                  >
                    {isProcessing && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                    {isProcessing ? 'Menyimpan...' : (roomToEdit ? 'PERBARUI RUANG' : 'SIMPAN RUANG BARU')}
                  </button>
                  <button 
                    type="button" 
                    disabled={isProcessing}
                    onClick={() => { setShowAddRoom(false); setRoomToEdit(null); }} 
                    className="w-full text-slate-400 font-black uppercase text-[10px] tracking-widest py-3 hover:text-red-500 transition-colors"
                  >
                    Batalkan
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;