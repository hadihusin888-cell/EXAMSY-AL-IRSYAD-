
import React, { useState, useRef, useMemo } from 'react';
import { ExamSession, Student, StudentStatus, Room, Question } from '../types';

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
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [studentToAdd, setStudentToAdd] = useState(false);
  const [selectedNis, setSelectedNis] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showBulkRoomModal, setShowBulkRoomModal] = useState(false);
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);

  const [showAddRoom, setShowAddRoom] = useState(false);
  const [roomToEdit, setRoomToEdit] = useState<Room | null>(null);
  const [roomToDelete, setRoomToDelete] = useState<Room | null>(null);
  const [roomToViewStudents, setRoomToViewStudents] = useState<Room | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roomFilter, setRoomFilter] = useState('ALL');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper for PDF Sanity
  const sanitizePdfUrl = (url: string) => {
    if (!url) return '';
    let sanitized = url;
    if (url.includes('drive.google.com')) {
      sanitized = url.replace(/\/view(\?.*)?$/, '/preview');
      if (!sanitized.includes('/preview')) {
        sanitized = sanitized.replace(/\/edit(\?.*)?$/, '/preview');
      }
      const separator = sanitized.includes('?') ? '&' : '?';
      sanitized = `${sanitized}${separator}rm=minimal`;
    }
    return sanitized;
  };

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

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions]);

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

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
      let successCount = 0;
      let errorCount = 0;
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',').map(item => item.trim());
        if (row.length < 2) continue;
        const [nis, name, cls, roomName, pass, stat] = row;
        if (nis && name) {
          const targetRoom = rooms.find(r => (r.name || '').trim().toUpperCase() === (roomName || '').toUpperCase());
          let finalStatus = StudentStatus.BELUM_MASUK;
          const inputStatus = (stat || "").toUpperCase();
          if (Object.values(StudentStatus).includes(inputStatus as StudentStatus)) {
            finalStatus = inputStatus as StudentStatus;
          }
          const payload = {
            nis: String(nis),
            name: String(name).toUpperCase(),
            class: String(cls || "7"),
            roomId: targetRoom ? targetRoom.id : "",
            password: (pass || "password123"),
            status: finalStatus
          };
          const success = await onAction('ADD_STUDENT', payload);
          if (success) successCount++;
          else errorCount++;
        }
      }
      alert(`Impor Selesai!\nBerhasil: ${successCount}\nGagal: ${errorCount}`);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const headers = "NIS,NAMA,KELAS,RUANG,PASSWORD,STATUS";
    const sampleData = "12345,AHMAD FULAN,7,RUANG 01,password123,BELUM_MASUK";
    const csvContent = `${headers}\n${sampleData}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "template_upload_siswa.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkDelete = async () => {
    let success = 0;
    for (const nis of selectedNis) {
      const ok = await onAction('DELETE_STUDENT', { nis });
      if (ok) success++;
    }
    setShowBulkDeleteConfirm(false);
    setSelectedNis([]);
    alert(`${success} Siswa berhasil dihapus.`);
  };

  const handleBulkUpdate = async (updates: Partial<Student>) => {
    const ok = await onAction('BULK_UPDATE_STUDENTS', { 
      selectedNis, 
      updates 
    });
    if (ok) {
      setSelectedNis([]);
      setShowBulkRoomModal(false);
      setShowBulkStatusModal(false);
      alert('Pembaruan massal berhasil disimpan ke Cloud.');
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
             <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">{isSyncing ? 'Sinkronisasi...' : 'Terhubung Cloud'}</span>
          </div>
          <button onClick={onLogout} className="text-slate-400 hover:text-red-600 font-bold text-xs md:text-sm">Logout</button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6 md:p-10 bg-[#f8fafc]">
        {activeTab === 'SESSIONS' && (
           <div className="max-w-7xl mx-auto">
             <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-4">
               <div>
                 <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter uppercase leading-none">Sesi Ujian</h2>
                 <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-2">Jadwal & Soal Terintegrasi Cloud</p>
               </div>
               <button onClick={() => setShowAddSession(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95"> + Sesi Baru </button>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {sortedSessions.length === 0 ? (
                 <div className="col-span-full py-20 bg-white rounded-[3rem] border border-dashed border-slate-200 text-center">
                    <p className="text-slate-300 font-black uppercase tracking-[0.2em] text-xs">Belum Ada Sesi Ujian</p>
                 </div>
               ) : (
                 sortedSessions.map(session => (
                   <div key={session.id} className="bg-white p-7 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                     <div className="flex justify-between items-start mb-4">
                       <div>
                         <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none mb-1">{session.name}</h3>
                       </div>
                       <button onClick={() => onAction('UPDATE_SESSION', { ...session, isActive: !session.isActive })} className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all border ${session.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                         {session.isActive ? 'Aktif' : 'Draft'}
                       </button>
                     </div>
                     <div className="flex gap-2 mb-8">
                        <span className="bg-slate-50 text-slate-500 text-[9px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wider border border-slate-100">Kls {session.class}</span>
                        <span className="bg-indigo-50 text-indigo-600 text-[9px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wider border border-indigo-100">PIN: {session.pin}</span>
                        <span className="bg-slate-50 text-slate-500 text-[9px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wider border border-slate-100">{session.durationMinutes} Menit</span>
                     </div>
                     <div className="flex gap-2">
                       <button onClick={() => setSessionToView(session)} className="flex-1 bg-slate-900 text-white h-12 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all">Lihat Soal</button>
                       <button onClick={() => setSessionToEdit(session)} className="w-12 h-12 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                       </button>
                       <button onClick={() => setSessionToDelete(session.id)} className="w-12 h-12 flex items-center justify-center bg-red-50 text-red-500 rounded-2xl border border-red-100 hover:bg-red-600 hover:text-white transition-all">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                       </button>
                     </div>
                   </div>
                 ))
               )}
             </div>
           </div>
        )}

        {activeTab === 'STUDENTS' && (
          <div className="max-w-7xl mx-auto pb-32">
             <div className="flex flex-col lg:flex-row justify-between lg:items-end mb-10 gap-6">
                <div>
                  <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter uppercase leading-none">Database Siswa</h2>
                  <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-2">Database Terintegrasi ({students.length})</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="flex gap-2">
                    <input type="text" placeholder="Cari Nama / NIS..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full lg:w-48 pl-6 pr-6 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:border-indigo-500 shadow-sm" />
                    <select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} className="bg-white border border-slate-200 rounded-2xl px-4 text-xs font-black uppercase text-slate-500 outline-none focus:border-indigo-500 shadow-sm">
                      <option value="ALL">Semua Ruang</option>
                      {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <button onClick={() => setStudentToAdd(true)} className="bg-indigo-600 text-white px-5 py-3.5 rounded-2xl font-black text-[10px] uppercase shadow-lg active:scale-95 transition-all"> + Siswa </button>
                  <button onClick={downloadTemplate} className="bg-emerald-600 text-white px-5 py-3.5 rounded-2xl font-black text-[10px] uppercase transition-all shadow-lg active:scale-95">Template</button>
                  <button onClick={() => fileInputRef.current?.click()} className="bg-slate-900 text-white px-5 py-3.5 rounded-2xl font-black text-[10px] uppercase transition-all shadow-lg active:scale-95">Impor CSV</button>
                  <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleImportCSV} />
                </div>
             </div>
             
             {selectedNis.length > 0 && (
               <div className="mb-6 bg-indigo-600 text-white px-8 py-4 rounded-3xl flex items-center justify-between animate-in slide-in-from-top-6 shadow-2xl z-[60] sticky top-6">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center font-black text-lg">{selectedNis.length}</div>
                    <span className="text-xs font-black uppercase tracking-widest hidden sm:block">Siswa Terpilih</span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                     <button onClick={() => setShowBulkRoomModal(true)} className="bg-white/10 hover:bg-white text-white hover:text-indigo-600 px-5 py-2.5 rounded-xl font-black text-[10px] uppercase border border-white/30 transition-all shadow-sm">Ubah Ruang</button>
                     <button onClick={() => setShowBulkStatusModal(true)} className="bg-white/10 hover:bg-white text-white hover:text-indigo-600 px-5 py-2.5 rounded-xl font-black text-[10px] uppercase border border-white/30 transition-all shadow-sm">Ubah Status</button>
                     <button onClick={() => setShowBulkDeleteConfirm(true)} className="bg-red-500 hover:bg-red-600 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase shadow-md transition-all">Hapus</button>
                     <button onClick={() => setSelectedNis([])} className="text-white/70 hover:text-white font-black text-[10px] uppercase underline ml-2 transition-all">Batal</button>
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
                      <th className="px-8 py-6 text-center">Status</th>
                      <th className="px-8 py-6 text-right pr-12">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-8 py-20 text-center text-slate-300 font-black uppercase tracking-widest text-xs">Data siswa tidak ditemukan</td>
                      </tr>
                    ) : (
                      filteredStudents.map(student => (
                        <tr key={String(student.nis)} className="hover:bg-slate-50/80 transition-colors group">
                          <td className="px-6 py-5 text-center">
                            <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600 cursor-pointer" checked={selectedNis.includes(String(student.nis))} onChange={() => setSelectedNis(prev => prev.includes(String(student.nis)) ? prev.filter(n => n !== String(student.nis)) : [...prev, String(student.nis)])} />
                          </td>
                          <td className="px-8 py-5 font-mono text-indigo-600 text-[11px] font-black uppercase tracking-tight">{student.nis}</td>
                          <td className="px-8 py-5 font-black text-slate-800 tracking-tight uppercase text-xs">{student.name}</td>
                          <td className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase">Kls {student.class}</td>
                          <td className="px-8 py-5 text-[11px] font-black text-indigo-900 uppercase">{rooms.find(r => r.id === student.roomId)?.name || "-"}</td>
                          <td className="px-8 py-5 text-center">{getStatusBadge(student.status)}</td>
                          <td className="px-8 py-5 text-right pr-12">
                            <div className="flex justify-end gap-2">
                               <button onClick={() => setStudentToEdit(student)} title="Edit" className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                               </button>
                               <button onClick={() => setStudentToDelete(student)} title="Hapus" className="p-2 bg-red-50 text-red-400 rounded-lg hover:bg-red-600 hover:text-white transition-all">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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
          </div>
        )}

        {activeTab === 'ROOMS' && (
           <div className="max-w-7xl mx-auto">
              <div className="flex justify-between items-end mb-10">
                <div>
                  <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter uppercase leading-none">Manajemen Ruang</h2>
                  <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-2">Total {rooms.length} Ruang Proktor Terdaftar</p>
                </div>
                <button onClick={() => setShowAddRoom(true)} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase shadow-xl transition-all active:scale-95"> + Tambah Ruang </button>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {rooms.map(room => {
                  const roomParticipants = students.filter(s => s.roomId === room.id);
                  return (
                    <div key={room.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all group flex flex-col h-full">
                      <div className="mb-4">
                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none">{room.name}</h3>
                        <p className="text-indigo-600 font-black text-[9px] uppercase tracking-widest mt-1.5">{roomParticipants.length} / {room.capacity} Siswa Terdaftar</p>
                      </div>
                      
                      <div className="space-y-2 mb-8 flex-1">
                         <div className="flex justify-between items-center text-[10px] font-black uppercase">
                            <span className="text-slate-400">Login</span>
                            <span className="text-slate-700 font-mono">{room.username}</span>
                         </div>
                         <div className="flex justify-between items-center text-[10px] font-black uppercase">
                            <span className="text-slate-400">Kapasitas</span>
                            <span className="text-slate-700">{room.capacity} Peserta</span>
                         </div>
                      </div>

                      <div className="space-y-2 mt-auto">
                        <button 
                          onClick={() => setRoomToViewStudents(room)}
                          className="w-full bg-slate-50 hover:bg-indigo-600 hover:text-white text-indigo-600 py-3 rounded-2xl font-black text-[10px] uppercase transition-all border border-indigo-50"
                        >
                          Daftar Peserta
                        </button>
                        <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                          <button onClick={() => setRoomToEdit(room)} className="text-indigo-600 font-black text-[10px] uppercase tracking-widest hover:underline">Edit Detail</button>
                          <button onClick={() => setRoomToDelete(room)} className="text-red-400 hover:text-red-600 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
             </div>
           </div>
        )}
      </main>

      {/* MODAL VIEW STUDENTS IN ROOM */}
      {roomToViewStudents && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl h-[80vh] flex flex-col rounded-[3.5rem] shadow-2xl relative animate-in zoom-in-95 overflow-hidden">
             <header className="p-8 border-b border-slate-100 flex items-center justify-between shrink-0">
               <div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">{roomToViewStudents.name}</h3>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-2">Daftar Peserta yang Ditempatkan</p>
               </div>
               <button onClick={() => setRoomToViewStudents(null)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
               </button>
             </header>
             <div className="flex-1 overflow-auto p-8 custom-scrollbar">
                {students.filter(s => s.roomId === roomToViewStudents.id).length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 text-slate-200">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                    </div>
                    <p className="text-slate-300 font-black uppercase text-[10px] tracking-widest">Belum ada siswa di ruang ini.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {students.filter(s => s.roomId === roomToViewStudents.id).sort((a,b) => a.name.localeCompare(b.name)).map(s => (
                      <div key={s.nis} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between group">
                        <div className="overflow-hidden">
                          <p className="text-[10px] font-black text-indigo-600 leading-none mb-1.5 uppercase tracking-tight">{s.nis}</p>
                          <h4 className="text-xs font-black text-slate-800 uppercase truncate">{s.name}</h4>
                        </div>
                        <div className="shrink-0 ml-3">
                           {getStatusBadge(s.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
             </div>
             <footer className="p-8 bg-slate-50 border-t border-slate-100 text-center shrink-0">
                <button onClick={() => setRoomToViewStudents(null)} className="px-10 py-4 bg-slate-900 hover:bg-black text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all">Tutup Daftar</button>
             </footer>
          </div>
        </div>
      )}

      {/* BULK UPDATE ROOM MODAL */}
      {showBulkRoomModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-md p-10 rounded-[3.5rem] shadow-2xl animate-in zoom-in-95">
              <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Pindahkan Ruang</h3>
              <p className="text-slate-500 text-[10px] font-bold uppercase mb-10 leading-relaxed">Anda akan memindahkan <span className="text-indigo-600 font-black">{selectedNis.length} siswa</span> sekaligus ke unit ruang:</p>
              <div className="grid grid-cols-1 gap-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                 <button onClick={() => handleBulkUpdate({ roomId: "" })} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-500 py-5 rounded-2xl font-black text-[11px] uppercase transition-all flex items-center justify-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    Hapus Penempatan Ruang
                 </button>
                 {rooms.map(r => (
                   <button key={r.id} onClick={() => handleBulkUpdate({ roomId: r.id })} className="w-full bg-indigo-50 hover:bg-indigo-600 group text-indigo-600 hover:text-white py-5 rounded-2xl font-black text-[11px] uppercase transition-all flex items-center justify-between px-6 border border-indigo-100">
                     <span>{r.name}</span>
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                   </button>
                 ))}
              </div>
              <button onClick={() => setShowBulkRoomModal(false)} className="w-full mt-8 text-slate-400 font-bold py-2 text-[10px] uppercase tracking-widest hover:text-slate-600 transition-colors">Batalkan Pemindahan</button>
           </div>
        </div>
      )}

      {/* BULK UPDATE STATUS MODAL */}
      {showBulkStatusModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-md p-10 rounded-[3.5rem] shadow-2xl animate-in zoom-in-95">
              <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Update Status Massal</h3>
              <p className="text-slate-500 text-[10px] font-bold uppercase mb-10 leading-relaxed">Ubah status pengerjaan <span className="text-indigo-600 font-black">{selectedNis.length} siswa</span> terpilih menjadi:</p>
              <div className="grid grid-cols-1 gap-3">
                 {Object.values(StudentStatus).map(s => (
                   <button 
                     key={s} 
                     onClick={() => handleBulkUpdate({ status: s })} 
                     className={`w-full py-5 rounded-2xl font-black text-[11px] uppercase transition-all flex items-center justify-between px-6 border shadow-sm ${
                        s === StudentStatus.BLOKIR ? 'bg-red-50 border-red-100 text-red-600 hover:bg-red-600 hover:text-white' :
                        s === StudentStatus.SELESAI ? 'bg-emerald-50 border-emerald-100 text-emerald-600 hover:bg-emerald-600 hover:text-white' :
                        s === StudentStatus.SEDANG_UJIAN ? 'bg-amber-50 border-amber-100 text-amber-600 hover:bg-amber-600 hover:text-white' :
                        'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-900 hover:text-white'
                     }`}
                    >
                     <span>{s.replace('_', ' ')}</span>
                     <div className={`w-2 h-2 rounded-full ${
                        s === StudentStatus.BLOKIR ? 'bg-red-500' :
                        s === StudentStatus.SELESAI ? 'bg-emerald-500' :
                        s === StudentStatus.SEDANG_UJIAN ? 'bg-amber-500' :
                        'bg-slate-300'
                     }`}></div>
                   </button>
                 ))}
              </div>
              <button onClick={() => setShowBulkStatusModal(false)} className="w-full mt-8 text-slate-400 font-bold py-2 text-[10px] uppercase tracking-widest hover:text-slate-600 transition-colors">Batalkan Update</button>
           </div>
        </div>
      )}

      {/* SESSION PREVIEW MODAL */}
      {sessionToView && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-5xl h-[90vh] flex flex-col rounded-[3.5rem] shadow-2xl relative animate-in zoom-in-95 overflow-hidden border border-white/20">
            <header className="p-8 md:p-10 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white z-20">
              <div className="flex-1">
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">{sessionToView.name}</h3>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-3">Pratinjau File PDF Soal</p>
              </div>
              <button onClick={() => setSessionToView(null)} className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all ml-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </header>
            
            <div className="flex-1 overflow-hidden bg-slate-950 relative">
              <div className="w-full h-full flex flex-col bg-slate-900">
                {sessionToView.pdfUrl ? (
                  <iframe 
                    src={sanitizePdfUrl(sessionToView.pdfUrl)} 
                    className="w-full h-full border-none bg-white" 
                    title="Pratinjau PDF"
                  />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
                     <div className="w-20 h-20 bg-white/5 rounded-[2rem] flex items-center justify-center mb-6 text-white/20">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.268 15c-.77 1.333.192 3 1.732 3z" /></svg>
                     </div>
                     <h4 className="text-white font-black uppercase tracking-[0.2em] text-sm">File PDF Belum Tersedia</h4>
                     <p className="text-white/40 text-xs mt-2 font-bold uppercase tracking-widest max-w-xs">Silakan lampirkan link Google Drive PDF di menu 'Edit Sesi' terlebih dahulu.</p>
                  </div>
                )}
              </div>
            </div>
            
            <footer className="p-8 bg-white border-t border-slate-100 flex justify-end shrink-0 z-20">
               <button onClick={() => setSessionToView(null)} className="px-12 py-5 bg-slate-900 hover:bg-black text-white rounded-3xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl active:scale-95">Tutup Jendela</button>
            </footer>
          </div>
        </div>
      )}

      {/* SESSION MODAL (ADD/EDIT) */}
      {(showAddSession || sessionToEdit) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-xl p-8 md:p-12 rounded-[3.5rem] shadow-2xl relative animate-in zoom-in-95">
            <button onClick={() => { setShowAddSession(false); setSessionToEdit(null); }} className="absolute top-8 right-8 text-slate-300 hover:text-red-500 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="mb-10">
              <h3 className="text-2xl md:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">
                {sessionToEdit ? 'Ubah Sesi Ujian' : 'Sesi Ujian Baru'}
              </h3>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-2">Identitas & Konfigurasi Sesi</p>
            </div>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (isProcessing) return;
              const f = new FormData(e.currentTarget);
              const data = {
                id: sessionToEdit ? sessionToEdit.id : Date.now().toString(),
                name: (f.get('name') as string).toUpperCase().trim(),
                class: f.get('class') as string,
                pin: (f.get('pin') as string).toUpperCase().trim(),
                durationMinutes: Number(f.get('duration')),
                pdfUrl: (f.get('pdfUrl') as string).trim(),
                isActive: !!f.get('isActive'),
                questions: sessionToEdit ? sessionToEdit.questions : []
              };
              const ok = await onAction(sessionToEdit ? 'UPDATE_SESSION' : 'ADD_SESSION', data);
              if(ok) { setShowAddSession(false); setSessionToEdit(null); }
            }} className="space-y-6">
              
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nama Mata Pelajaran</label>
                <input name="name" defaultValue={sessionToEdit?.name} required placeholder="Contoh: MATEMATIKA PAT" className="w-full px-6 py-4.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none uppercase focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all" />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Pilih Kelas</label>
                  <select name="class" defaultValue={sessionToEdit?.class || '7'} className="w-full px-5 py-4.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 transition-all appearance-none">
                    <option value="7">Kelas 7</option>
                    <option value="8">Kelas 8</option>
                    <option value="9">Kelas 9</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">PIN Sesi (4-6 Karakter)</label>
                  <input name="pin" defaultValue={sessionToEdit?.pin} required maxLength={6} placeholder="ABCD" className="w-full px-5 py-4.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-center uppercase tracking-widest outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Durasi (Menit)</label>
                <input name="duration" type="number" defaultValue={sessionToEdit?.durationMinutes || 90} required className="w-full px-5 py-4.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">PDF URL (Sematkan Google Drive)</label>
                <input name="pdfUrl" defaultValue={sessionToEdit?.pdfUrl} placeholder="https://drive.google.com/..." className="w-full px-6 py-4.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all" />
              </div>

              <div className="flex items-center justify-between p-5 bg-slate-50 border border-slate-200 rounded-3xl transition-colors">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Status Aktif</label>
                  <span className="text-xs font-bold text-slate-700 uppercase">Izinkan Siswa Login Sekarang?</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input name="isActive" type="checkbox" defaultChecked={sessionToEdit?.isActive} className="sr-only peer" />
                  <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-6 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              <div className="pt-8 flex flex-col gap-3">
                 <button type="submit" disabled={isProcessing} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white py-5 rounded-[2rem] font-black uppercase text-xs tracking-[0.2em] shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-3 active:scale-[0.98]">
                    {isProcessing && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                    {sessionToEdit ? 'SIMPAN PERUBAHAN SESI' : 'BUAT SESI UJIAN'}
                 </button>
                 <button type="button" onClick={() => { setShowAddSession(false); setSessionToEdit(null); }} className="w-full text-slate-400 py-2 font-bold uppercase text-[10px] tracking-widest hover:text-slate-600 transition-colors">Batal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATIONS AND OTHER MODALS... */}
      {sessionToDelete && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm p-10 rounded-[3rem] shadow-2xl animate-in zoom-in-95 duration-200 text-center border-t-8 border-red-600">
            <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Hapus Sesi?</h3>
            <p className="text-slate-500 text-[11px] font-bold uppercase mb-8 leading-relaxed px-4">Sesi ujian ini akan dihapus secara permanen dari database.</p>
            <div className="flex flex-col gap-3">
              <button 
                disabled={isProcessing} 
                onClick={async () => { 
                  const ok = await onAction('DELETE_SESSION', { id: sessionToDelete }); 
                  if(ok) setSessionToDelete(null); 
                }} 
                className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-2xl font-black text-xs uppercase shadow-xl transition-all"
              >
                {isProcessing ? 'Menghapus...' : 'Ya, Hapus Sesi'}
              </button>
              <button onClick={() => setSessionToDelete(null)} disabled={isProcessing} className="w-full text-slate-400 font-bold py-2 text-[10px] uppercase tracking-widest transition-colors">Batal</button>
            </div>
          </div>
        </div>
      )}

      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm p-10 rounded-[3rem] shadow-2xl animate-in zoom-in-95 duration-200 text-center border-t-8 border-red-600">
            <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Hapus Massal?</h3>
            <p className="text-slate-500 text-[11px] font-bold uppercase mb-8 leading-relaxed px-4">Anda akan menghapus <span className="text-red-600 font-black">{selectedNis.length} siswa</span> secara permanen dari database.</p>
            <div className="flex flex-col gap-3">
              <button disabled={isProcessing} onClick={handleBulkDelete} className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-2xl font-black text-xs uppercase shadow-xl transition-all">
                {isProcessing ? 'Menghapus...' : 'Ya, Hapus Semua'}
              </button>
              <button onClick={() => setShowBulkDeleteConfirm(false)} disabled={isProcessing} className="w-full text-slate-400 font-bold py-2 text-[10px] uppercase tracking-widest transition-colors">Batal</button>
            </div>
          </div>
        </div>
      )}

      {studentToDelete && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-sm p-10 rounded-[3rem] shadow-2xl animate-in zoom-in-95 duration-200 text-center border-t-8 border-red-600">
            <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Hapus Siswa?</h3>
            <p className="text-slate-500 text-[11px] font-bold uppercase mb-8 leading-relaxed px-4">Siswa <span className="text-red-600 font-black">{studentToDelete.name}</span> akan dihapus permanen dari sistem.</p>
            <div className="flex flex-col gap-3">
              <button disabled={isProcessing} onClick={async () => { const ok = await onAction('DELETE_STUDENT', { nis: studentToDelete.nis }); if(ok) setStudentToDelete(null); }} className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-2xl font-black text-xs uppercase shadow-xl transition-all">
                {isProcessing ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
              <button onClick={() => setStudentToDelete(null)} disabled={isProcessing} className="w-full text-slate-400 font-bold py-2 text-[10px] uppercase">Batal</button>
            </div>
          </div>
        </div>
      )}

      {(studentToEdit || studentToAdd) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-xl p-8 md:p-12 rounded-[3.5rem] shadow-2xl relative animate-in zoom-in-95">
            <button onClick={() => { setStudentToEdit(null); setStudentToAdd(false); }} className="absolute top-8 right-8 text-slate-400 hover:text-red-500 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            
            <div className="mb-10">
              <h3 className="text-2xl md:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">
                {studentToEdit ? 'Ubah Data Siswa' : 'Tambah Siswa Baru'}
              </h3>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-2">Informasi Akun & Sinkronisasi Ruang</p>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (isProcessing) return;
              const f = new FormData(e.currentTarget);
              const data = {
                nis: (f.get('nis') as string).trim(),
                name: (f.get('name') as string).toUpperCase().trim(),
                class: f.get('class') as string,
                roomId: f.get('roomId') as string,
                password: (f.get('password') as string) || "password123",
                status: f.get('status') as StudentStatus
              };
              const ok = await onAction(studentToEdit ? 'UPDATE_STUDENT' : 'ADD_STUDENT', data);
              if(ok) { setStudentToEdit(null); setStudentToAdd(false); }
            }} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nomor Induk Siswa (NIS)</label>
                  <input name="nis" defaultValue={studentToEdit?.nis} readOnly={!!studentToEdit} required placeholder="Contoh: 12345" className={`w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all ${studentToEdit ? 'opacity-60 cursor-not-allowed bg-slate-100' : ''}`} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Password Login</label>
                  <input name="password" defaultValue={studentToEdit?.password || 'password123'} required placeholder="Password" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nama Lengkap Siswa</label>
                <input name="name" defaultValue={studentToEdit?.name} required placeholder="NAMA SESUAI IJAZAH / DAPODIK" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none uppercase focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Pilih Kelas</label>
                  <select name="class" defaultValue={studentToEdit?.class || '7'} className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 appearance-none transition-all">
                    <option value="7">Kelas 7</option>
                    <option value="8">Kelas 8</option>
                    <option value="9">Kelas 9</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Penempatan Ruang</label>
                  <select name="roomId" defaultValue={studentToEdit?.roomId || ''} className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 appearance-none transition-all">
                    <option value="">Tanpa Ruang</option>
                    {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status Ujian</label>
                  <select name="status" defaultValue={studentToEdit?.status || StudentStatus.BELUM_MASUK} className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 appearance-none transition-all">
                    {Object.values(StudentStatus).map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div className="pt-8 flex flex-col gap-3">
                 <button type="submit" disabled={isProcessing} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-3 active:scale-[0.98]">
                    {isProcessing && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                    {studentToEdit ? 'SIMPAN PERUBAHAN DATA' : 'TAMBAHKAN KE DATABASE'}
                 </button>
                 <button type="button" onClick={() => { setStudentToEdit(null); setStudentToAdd(false); }} className="w-full text-slate-400 py-2 font-bold uppercase text-[10px] tracking-widest hover:text-slate-600 transition-colors">Batal & Tutup</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ROOM MODALS (ADD/EDIT/DELETE) */}
      {(showAddRoom || roomToEdit) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md p-8 md:p-10 rounded-[3rem] shadow-2xl relative animate-in zoom-in-95">
             <button onClick={() => { setShowAddRoom(false); setRoomToEdit(null); }} className="absolute top-6 right-6 text-slate-400 hover:text-red-500 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
             </button>
             <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-8">{roomToEdit ? 'Edit Ruang' : 'Ruang Baru'}</h3>
             <form onSubmit={async (e) => {
               e.preventDefault();
               const f = new FormData(e.currentTarget);
               const data = {
                 id: roomToEdit ? roomToEdit.id : Date.now().toString(),
                 name: (f.get('name') as string).toUpperCase(),
                 capacity: Number(f.get('capacity')),
                 username: (f.get('username') as string).toLowerCase().trim(),
                 password: (f.get('password') as string)
               };
               const ok = await onAction(roomToEdit ? 'UPDATE_ROOM' : 'ADD_ROOM', data);
               if(ok) { setShowAddRoom(false); setRoomToEdit(null); }
             }} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nama Ruang</label>
                  <input name="name" defaultValue={roomToEdit?.name} required className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none uppercase focus:border-indigo-500 transition-all" placeholder="RUANG 01" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Username Proktor</label>
                  <input name="username" defaultValue={roomToEdit?.username} required className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 transition-all" placeholder="proktor01" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
                    <input name="password" defaultValue={roomToEdit?.password} required className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 transition-all" placeholder="••••" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Kapasitas</label>
                    <input name="capacity" type="number" defaultValue={roomToEdit?.capacity || 40} required className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 transition-all" />
                  </div>
                </div>
                <button type="submit" disabled={isProcessing} className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl transition-all active:scale-95 mt-4">
                   {isProcessing ? 'Menyimpan...' : (roomToEdit ? 'Update Ruang' : 'Simpan Ruang')}
                </button>
             </form>
          </div>
        </div>
      )}

      {roomToDelete && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm p-10 rounded-[3rem] shadow-2xl animate-in zoom-in-95 duration-200 text-center border-t-8 border-red-600">
            <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Hapus Ruang?</h3>
            <p className="text-slate-500 text-[11px] font-bold uppercase mb-8 leading-relaxed px-4">Hapus ruang <span className="text-red-600">{roomToDelete.name}</span> secara permanen.</p>
            <div className="flex flex-col gap-3">
              <button disabled={isProcessing} onClick={async () => { const ok = await onAction('DELETE_ROOM', { id: roomToDelete.id }); if(ok) setRoomToDelete(null); }} className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-2xl font-black text-xs uppercase shadow-xl transition-all">Hapus</button>
              <button onClick={() => setRoomToDelete(null)} className="w-full text-slate-400 font-bold py-2 text-[10px] uppercase">Batal</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .py-4\\.5 {
          padding-top: 1.125rem;
          padding-bottom: 1.125rem;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
};

export default AdminDashboard;
