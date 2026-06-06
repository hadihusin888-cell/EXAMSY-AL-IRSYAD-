
import React, { useState, useEffect, Suspense, lazy } from 'react';
import { ViewState, Student, ExamSession, StudentStatus, Room } from './types';
import { syncData, dbAction } from './services/firebaseService';

const StudentLogin = lazy(() => import('./views/StudentLogin'));
const AdminLogin = lazy(() => import('./views/AdminLogin'));
const AdminDashboard = lazy(() => import('./views/AdminDashboard'));
const ProctorDashboard = lazy(() => import('./views/ProctorDashboard'));
const ExamRoom = lazy(() => import('./views/ExamRoom'));

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('STUDENT_LOGIN');
  const [currentUser, setCurrentUser] = useState<Student | null>(null);
  const [currentSession, setCurrentSession] = useState<ExamSession | null>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false); 
  const [isSyncing, setIsSyncing] = useState(true);
  const [syncError, setSyncError] = useState<any>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  // Effect untuk mengecek session yang tersimpan di localStorage
  useEffect(() => {
    const savedAuth = localStorage.getItem('examsy_auth');
    if (savedAuth) {
      try {
        const auth = JSON.parse(savedAuth);
        if (auth.role === 'ADMIN') {
          setView('ADMIN_DASHBOARD');
        } else if (auth.role === 'STUDENT' && auth.nis && auth.sessionId) {
          // Placeholder: Kita akan set view ke EXAM_ROOM setelah data terisi
        }
      } catch (e) {
        console.error("Error parsing saved auth", e);
      }
    }
  }, []);

  useEffect(() => {
    // Sinkronisasi data real-time dari Firestore
    const unsub = syncData(
      (studentData) => {
        setStudents(studentData);
        
        // Cek jika ada session siswa yang tersimpan
        const savedAuth = localStorage.getItem('examsy_auth');
        if (savedAuth) {
          try {
            const auth = JSON.parse(savedAuth);
            if (auth.role === 'STUDENT' && auth.nis && auth.sessionId) {
              const student = studentData.find(s => String(s.nis) === String(auth.nis));
              if (student && view === 'STUDENT_LOGIN') {
                setCurrentUser(student);
                // Sesi akan diset di effect sessions
              }
            }
          } catch (e) {}
        }

        setIsLoading(false);
        setIsSyncing(false);
        setSyncError(null);
      },
      (sessionData) => {
        setSessions(sessionData);

        // Cek jika ada session siswa yang tersimpan
        const savedAuth = localStorage.getItem('examsy_auth');
        if (savedAuth) {
          try {
            const auth = JSON.parse(savedAuth);
            if (auth.role === 'STUDENT' && auth.nis && auth.sessionId) {
              const session = sessionData.find(s => s.id === auth.sessionId);
              if (session && currentUser && view === 'STUDENT_LOGIN') {
                setCurrentSession(session);
                setView('EXAM_ROOM');
                // Re-sync status just in case
                handleAction('UPDATE_STUDENT', {
                  ...currentUser,
                  status: StudentStatus.SEDANG_UJIAN
                });
              }
            }
          } catch (e) {}
        }
      },
      (roomData) => {
        setRooms(roomData);
        
        // Cek jika ada session proktor yang tersimpan
        const savedAuth = localStorage.getItem('examsy_auth');
        if (savedAuth) {
          const auth = JSON.parse(savedAuth);
          if (auth.role === 'PROCTOR' && auth.roomId) {
            const room = roomData.find(r => r.id === auth.roomId);
            if (room) {
              setActiveRoom(room);
              setView('PROCTOR_DASHBOARD');
            }
          }
        }
      },
      (error) => {
        console.error("Critical Firebase Connection Error:", error);
        setSyncError(error);
        setIsLoading(false);
        setIsSyncing(false);
      }
    );

    return () => unsub();
  }, [currentUser, view]);

  const handleAction = async (action: string, payload: any) => {
    setIsProcessing(true);
    const success = await dbAction(action, payload);
    setIsProcessing(false);
    return success;
  };

  const handleLogout = () => {
    localStorage.removeItem('examsy_auth');
    setActiveRoom(null);
    setView('STUDENT_LOGIN');
  };

  const handleStudentLogin = async (student: Student, session: ExamSession) => {
    setIsProcessing(true);
    
    // Simpan auth ke localStorage agar tidak logout saat refresh
    localStorage.setItem('examsy_auth', JSON.stringify({ 
      role: 'STUDENT', 
      nis: student.nis, 
      sessionId: session.id 
    }));

    // Update status siswa menjadi sedang ujian di database
    // Gunakan latest data dari state jika mungkin
    const latestStudent = students.find(s => String(s.nis) === String(student.nis)) || student;

    const success = await handleAction('UPDATE_STUDENT', { 
      ...latestStudent, 
      status: StudentStatus.SEDANG_UJIAN 
    });
    
    if (success) {
      setCurrentUser(latestStudent);
      setCurrentSession(session);
      setView('EXAM_ROOM');
    } else {
      localStorage.removeItem('examsy_auth'); // Reset jika gagal
      alert("Gagal memproses login. Silakan cek koneksi Anda.");
    }
    setIsProcessing(false);
  };

  if (syncError) {
    const isPermissionError = (syncError.message || String(syncError)).toLowerCase().includes('permission') || (syncError.code && syncError.code.includes('permission'));
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-red-500/10 text-red-500 p-6 rounded-2xl border border-red-500/20 max-w-lg w-full mb-6 text-left">
          <div className="w-12 h-12 bg-red-500/25 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">⚠️</div>
          <h3 className="font-bold text-lg text-white mb-2 text-center">Gagal Menghubungkan ke Firebase</h3>
          <p className="text-slate-300 text-sm mb-4 leading-relaxed text-center">
            {syncError.message || String(syncError)}
          </p>
          <div className="text-left text-xs bg-slate-900/80 p-3 rounded-lg font-mono text-slate-400 overflow-auto max-h-32 mb-4 scrollbar-thin border border-slate-800">
            <strong>Error Code:</strong> {syncError.code || 'permission-denied'}<br />
            <strong>Project ID:</strong> examsy-new
          </div>

          {isPermissionError ? (
            <div className="text-xs text-slate-300 mt-2 border-t border-slate-800/80 pt-3 space-y-3">
              <p className="font-semibold text-amber-400">🔑 Solusi Masalah Perizinan (Permission Denied):</p>
              <p className="leading-relaxed">
                Database Firebase baru Anda (<code className="text-indigo-400 font-mono bg-indigo-950/45 px-1 py-0.5 rounded">examsy-new</code>) saat ini memblokir akses baca-tulis karena aturan keamanannya. Ikuti 3 langkah mudah ini untuk membukanya:
              </p>
              <ol className="list-decimal pl-4 space-y-2">
                <li>
                  Buka tab <strong>Rules</strong> pada Firestore Database di Konsol Firebase Anda:<br />
                  <a 
                    href="https://console.firebase.google.com/project/examsy-new/firestore/rules" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:underline font-semibold inline-block mt-1 font-mono break-all"
                  >
                    🔗 console.firebase.google.com/project/examsy-new/firestore/rules
                  </a>
                </li>
                <li>
                  Ganti aturan keamanan (Security Rules) yang ada dengan kode di bawah ini:
                  <pre className="mt-1.5 p-2.5 bg-slate-900 rounded font-mono text-[10px] text-emerald-400 overflow-x-auto border border-slate-800">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`}
                  </pre>
                </li>
                <li>
                  Klik tombol <strong>Publish</strong> di kanan atas halaman konsol tersebut, lalu klik tombol <strong>Muat Ulang</strong> di bawah ini.
                </li>
              </ol>
            </div>
          ) : (
            <div className="text-xs text-slate-400 mt-2 border-t border-slate-800 pt-3">
              <p className="font-semibold mb-1 text-slate-300">💡 Penyebab Umum & Solusi:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Firestore Database belum diaktifkan di Console Firebase proyek <code className="text-indigo-400">examsy-new</code>. Silakan buka tab <strong>Firestore Database</strong> dan klik <strong>Create Database</strong>.</li>
                <li>Akun Google/Firebase Anda belum dibuat database atau masih dalam proses pembuatan.</li>
                <li>Koneksi internet Anda sedang diblokir oleh VPN, firewall, atau browser ad-blocker.</li>
              </ul>
            </div>
          )}
        </div>
        <div className="flex gap-4">
          <button 
            type="button"
            onClick={() => {
              localStorage.clear();
              sessionStorage.clear();
              window.location.reload();
            }} 
            className="cursor-pointer bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 px-6 rounded-xl transition text-sm shadow-lg shadow-red-950/20"
          >
            Bersihkan Cache & Refresh
          </button>
          <button 
            type="button"
            onClick={() => window.location.reload()} 
            className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 px-6 rounded-xl transition text-sm border border-slate-700"
          >
            Muat Ulang
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-10 text-center">
        <div className="w-12 h-12 border-4 border-white/10 border-t-indigo-500 rounded-full animate-spin mb-6"></div>
        <h2 className="text-white font-black uppercase tracking-[0.2em] text-xs">Examsy Cloud Sync...</h2>
        <p className="text-slate-500 text-[10px] mt-2 uppercase font-bold">Mempersiapkan Database Real-time</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden relative">
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="w-8 h-8 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin"></div>
        </div>
      }>
        {view === 'STUDENT_LOGIN' && (
          <StudentLogin 
            sessions={sessions} 
            students={students} 
            onLogin={handleStudentLogin} 
            onAdminClick={() => setView('ADMIN_LOGIN')} 
            isProcessing={isProcessing} 
          />
        )}
        
        {view === 'ADMIN_LOGIN' && (
          <AdminLogin 
            rooms={rooms} 
            onLogin={(role, r) => { 
              if(role === 'ADMIN') {
                localStorage.setItem('examsy_auth', JSON.stringify({ role: 'ADMIN' }));
                setView('ADMIN_DASHBOARD'); 
              } else { 
                localStorage.setItem('examsy_auth', JSON.stringify({ role: 'PROCTOR', roomId: r!.id }));
                setActiveRoom(r!); 
                setView('PROCTOR_DASHBOARD'); 
              } 
            }} 
            onBack={() => setView('STUDENT_LOGIN')} 
          />
        )}
        
        {view === 'ADMIN_DASHBOARD' && (
          <AdminDashboard 
            sessions={sessions} 
            students={students} 
            rooms={rooms} 
            isSyncing={isSyncing} 
            isProcessing={isProcessing} 
            onLogout={handleLogout} 
            onAction={handleAction} 
          />
        )}
        
        {view === 'PROCTOR_DASHBOARD' && activeRoom && (
          <ProctorDashboard 
            room={activeRoom} 
            students={students} 
            isSyncing={isSyncing} 
            isProcessing={isProcessing} 
            onLogout={handleLogout} 
            onAction={handleAction} 
            gasUrl="" 
          />
        )}
        
        {view === 'EXAM_ROOM' && currentUser && currentSession && (
          <ExamRoom 
            student={currentUser} 
            students={students} 
            session={currentSession} 
            onAction={handleAction}
            onFinish={async () => { 
              // Perbaikan: Ubah status menjadi SELESAI di Firestore sebelum navigasi
              if (currentUser) {
                await handleAction('UPDATE_STUDENT', {
                  ...currentUser,
                  status: StudentStatus.SELESAI,
                  violations: 0
                });
              }
              setCurrentUser(null); 
              setCurrentSession(null); 
              setView('STUDENT_LOGIN'); 
            }} 
          />
        )}
      </Suspense>
    </div>
  );
};

export default App;
