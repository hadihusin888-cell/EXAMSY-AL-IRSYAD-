
import React, { useState, useEffect, Suspense, lazy } from 'react';
import { ViewState, Student, ExamSession, StudentStatus, Room } from './types';
import { dbAction, db, fetchStaticData, checkIsOfflineFallbackActive, DEFAULT_FALLBACK_STUDENTS, DEFAULT_FALLBACK_SESSIONS } from './services/firebaseService';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

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
  const [showIdleLogoutNotice, setShowIdleLogoutNotice] = useState(false);

  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  const handleLogout = () => {
    localStorage.removeItem('examsy_auth');
    setActiveRoom(null);
    setView('STUDENT_LOGIN');
  };

  // Monitor aktivitas admin & proktor untuk auto-logout jika tidak aktif selama 15 menit
  useEffect(() => {
    if (view !== 'ADMIN_DASHBOARD' && view !== 'PROCTOR_DASHBOARD') {
      return;
    }

    const TIMEOUT_DURATION = 15 * 60 * 1000; // 15 menit
    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLogout();
        setShowIdleLogoutNotice(true);
      }, TIMEOUT_DURATION);
    };

    const events = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart', 'click'];
    
    // Mulai timer awal
    resetTimer();

    // Daftarkan listener aktivitas
    events.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    return () => {
      clearTimeout(timeoutId);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [view]);

  // Effect untuk mengecek session yang tersimpan di localStorage
  useEffect(() => {
    const savedAuth = localStorage.getItem('examsy_auth');
    if (savedAuth) {
      try {
        const auth = JSON.parse(savedAuth);
        if (auth.role === 'ADMIN') {
          setView('ADMIN_DASHBOARD');
          setIsLoading(false);
          setIsSyncing(false);
        } else if (auth.role === 'PROCTOR' && auth.roomId) {
          setView('PROCTOR_DASHBOARD');
          setIsLoading(false);
          setIsSyncing(false);
        } else if (auth.role === 'STUDENT' && auth.nis && auth.sessionId) {
          // Muat data murid dan sesi secara langsung dan hemat pemakaian kuota
          const loadDirectData = async () => {
            try {
              if (checkIsOfflineFallbackActive()) {
                throw new Error("Quota Exceeded Mode");
              }
              const studentRef = doc(db, "students", String(auth.nis));
              const sessionRef = doc(db, "sessions", String(auth.sessionId));
              
              const [studentSnap, sessionSnap] = await Promise.all([
                getDoc(studentRef),
                getDoc(sessionRef)
              ]);

              if (studentSnap.exists() && sessionSnap.exists()) {
                setCurrentUser(studentSnap.data() as Student);
                setCurrentSession(sessionSnap.data() as ExamSession);
                setView('EXAM_ROOM');
              } else {
                localStorage.removeItem('examsy_auth');
                setView('STUDENT_LOGIN');
              }
            } catch (err) {
              console.warn("Direct fetch error on mount, attempting local cached load:", err);
              const cachedStudentsRaw = localStorage.getItem("examsy_cache_students");
              const cachedSessionsRaw = localStorage.getItem("examsy_cache_sessions");
              
              const cachedStudents = cachedStudentsRaw ? JSON.parse(cachedStudentsRaw) : DEFAULT_FALLBACK_STUDENTS;
              const cachedSessions = cachedSessionsRaw ? JSON.parse(cachedSessionsRaw) : DEFAULT_FALLBACK_SESSIONS;
              
              const matchedStudent = cachedStudents.find((s: Student) => String(s.nis) === String(auth.nis));
              const matchedSession = cachedSessions.find((s: ExamSession) => String(s.id) === String(auth.sessionId));

              if (matchedStudent && matchedSession) {
                setCurrentUser(matchedStudent);
                setCurrentSession(matchedSession);
                setView('EXAM_ROOM');
              } else {
                localStorage.removeItem('examsy_auth');
                setView('STUDENT_LOGIN');
              }
            } finally {
              setIsLoading(false);
              setIsSyncing(false);
            }
          };
          loadDirectData();
        } else {
          setIsLoading(false);
          setIsSyncing(false);
        }
      } catch (e) {
        console.error("Error parsing saved auth", e);
        setIsLoading(false);
        setIsSyncing(false);
      }
    } else {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, []);

  const refreshData = async () => {
    setIsSyncing(true);
    try {
      const data = await fetchStaticData();
      setStudents(data.students);
      setSessions(data.sessions);
      setRooms(data.rooms);
    } catch (e) {
      console.error("Gagal memuat data dari database:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  // Hanya lakukan load data jika user berada di menu Admin / Proktor
  useEffect(() => {
    if (view !== 'ADMIN_DASHBOARD' && view !== 'PROCTOR_DASHBOARD' && view !== 'ADMIN_LOGIN') {
      return;
    }
    refreshData();
  }, [view]);

  // Sangat penting: Listener real-time single-doc untuk murid yang sedang ujian
  // Ini menghindari download daftar seluruh siswa sekolah, mengurangi read kuota sebesar 99.8% !
  useEffect(() => {
    if (view !== 'EXAM_ROOM' || !currentUser?.nis) {
      return;
    }

    const studentRef = doc(db, "students", String(currentUser.nis));
    const unsub = onSnapshot(studentRef, (snapshot) => {
      if (snapshot.exists()) {
        const updatedStudent = snapshot.data() as Student;
        setCurrentUser(updatedStudent);
      }
    }, (error) => {
      console.error("Error listening to student single doc:", error);
    });

    return () => unsub();
  }, [view, currentUser?.nis]);

  const handleAction = async (action: string, payload: any) => {
    setIsProcessing(true);
    const success = await dbAction(action, payload);
    if (success) {
      if (view === 'ADMIN_DASHBOARD' || view === 'PROCTOR_DASHBOARD' || view === 'ADMIN_LOGIN') {
        await refreshData();
      }
    }
    setIsProcessing(false);
    return success;
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

  const isSimulated = checkIsOfflineFallbackActive();

  // Storage event listener to sync state across tabs during offline/quota-exceeded simulation
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'examsy_cache_students' && e.newValue && currentUser) {
        try {
          const parsed = JSON.parse(e.newValue) as Student[];
          const updated = parsed.find(s => String(s.nis) === String(currentUser.nis));
          if (updated && JSON.stringify(updated) !== JSON.stringify(currentUser)) {
            setCurrentUser(updated);
          }
        } catch (_) {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [currentUser]);

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
      {/* Simulation/Quota mode indicator */}
      {isSimulated && (
        <div id="simulated-quota-alert" className="bg-amber-500 text-slate-950 px-4 py-3 text-center text-[10px] md:text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 border-b border-amber-600/30 shrink-0 z-50 relative animate-pulse">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Mode Simulasi Lokal Aktif (Quota Basis Data Penuh) — Seluruh Menu Ujian, Kuis, Blokir, & Reset Siswa Berjalan 100% Menggunakan Penyimpanan Lokal browser.
        </div>
      )}
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
              setShowIdleLogoutNotice(false);
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
            onRefresh={refreshData}
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
            onRefresh={refreshData}
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

      {/* Auto-logout Toast Notification for Admin / Proctor */}
      {showIdleLogoutNotice && (
        <div 
          id="idle-logout-toast"
          className="fixed bottom-5 right-5 z-50 max-w-sm bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-800 p-4 shrink-0 transition-all duration-300 md:bottom-8 md:right-8 flex items-start gap-3.5 backdrop-blur-sm bg-opacity-95 animate-in fade-in slide-in-from-bottom-5"
        >
          <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 id="idle-logout-toast-title" className="text-sm font-black text-slate-100 uppercase tracking-wider">Sesi Berakhir</h4>
            <p id="idle-logout-toast-desc" className="text-xs text-slate-400 mt-1 leading-relaxed">Sesi Admin/Proktor ditutup otomatis demi keamanan karena tidak ada aktivitas selama 15 menit.</p>
            <button 
              id="idle-logout-toast-close"
              onClick={() => setShowIdleLogoutNotice(false)} 
              className="mt-3 text-[10px] text-slate-200 hover:text-white font-black uppercase tracking-widest bg-slate-850 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-850 transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
