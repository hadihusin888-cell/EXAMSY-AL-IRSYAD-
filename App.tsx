
import React, { useState, useEffect, Suspense, lazy } from 'react';
import { ViewState, Student, ExamSession, StudentStatus, Room } from './types';
import { 
  syncData, 
  dbAction, 
  getActiveFirebaseConfig, 
  ORIGINAL_CONFIG,
  getRoomsOnce,
  getSessionsOnce,
  getStudentOnce,
  syncSingleStudent,
  syncSingleSession,
  syncRoomStudents
} from './services/firebaseService';

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

  // State untuk diagnosa loading terlambat
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [seedStatus, setSeedStatus] = useState<'idle' | 'seeding' | 'success' | 'error'>('idle');

  const activeConfig = getActiveFirebaseConfig();

  // Trigger diagnosa jika sinkronisasi memakan waktu lebih dari 5.5 detik
  useEffect(() => {
    if (isLoading && !syncError) {
      const timer = setTimeout(() => {
        setShowDiagnostics(true);
      }, 5500);
      return () => clearTimeout(timer);
    } else {
      setShowDiagnostics(false);
    }
  }, [isLoading, syncError]);

  const handleForceDemoDatabase = () => {
    localStorage.setItem("examsy_firebase_config_override", JSON.stringify(ORIGINAL_CONFIG));
    localStorage.removeItem("examsy_auth");
    window.location.reload();
  };

  const handleRestoreDefaultConfig = () => {
    localStorage.removeItem("examsy_firebase_config_override");
    localStorage.removeItem("examsy_auth");
    window.location.reload();
  };

  const handleSeedSampleData = async () => {
    setSeedStatus('seeding');
    try {
      // Buat Ruang 01
      await dbAction('ADD_ROOM', {
        id: "R01",
        name: "Ruang 01 (Kelas Utama)",
        capacity: 40,
        username: "proktor1",
        password: "123"
      });

      // Buat Sesi Soal
      await dbAction('ADD_SESSION', {
        id: "S01",
        name: "Ujian Matematika Bersama",
        class: "X-A",
        pin: "2026",
        durationMinutes: 60,
        isActive: true,
        questions: [
          {
            id: "q1",
            text: "Berapakah hasil dari 15 x 6?",
            options: ["60", "80", "90", "120"],
            correctAnswer: 2
          },
          {
            id: "q2",
            text: "Unsur terkecil dari sebuah lingkaran disebut apa?",
            options: ["Diameter", "Jari-jari", "Titik pusat", "Tali busur"],
            correctAnswer: 2
          },
          {
            id: "q3",
            text: "Jika x + 5 = 12, berapakah nilai x?",
            options: ["5", "6", "7", "8"],
            correctAnswer: 2
          }
        ],
        date: new Date().toISOString().split('T')[0]
      });

      // Buat Siswa
      await dbAction('ADD_STUDENT', {
        nis: "1001",
        name: "Hadi Husin (Siswa)",
        class: "X-A",
        password: "123",
        status: StudentStatus.BELUM_MASUK,
        roomId: "R01",
        violations: 0
      });

      await dbAction('ADD_STUDENT', {
        nis: "1002",
        name: "Ahmad Rizky (Siswa)",
        class: "X-A",
        password: "123",
        status: StudentStatus.BELUM_MASUK,
        roomId: "R01",
        violations: 0
      });

      setSeedStatus('success');
      alert("Inisialisasi berhasil! Koleksi dan baris data contoh sudah dimasukkan. Halaman akan otomatis dimuat ulang.");
      window.location.reload();
    } catch (err) {
      console.error("Gagal inisialisasi database baru:", err);
      setSeedStatus('error');
      alert("Gagal menginisialisasi. Pastikan Anda telah mengaktifkan Firestore di Firebase Console dan atur security rules ke mode uji coba.");
    }
  };

  // 1. Initial fast load of non-real-time collections (rooms & sessions)
  useEffect(() => {
    const initFastLoad = async () => {
      try {
        const [loadedSessions, loadedRooms] = await Promise.all([
          getSessionsOnce(),
          getRoomsOnce()
        ]);
        setSessions(loadedSessions);
        setRooms(loadedRooms);
        setIsLoading(false);
        setIsSyncing(false);
        setSyncError(null);
      } catch (err) {
        console.error("Initial fast load failed:", err);
        // Fallback: don't loop forever
        setIsLoading(false);
      }
    };
    
    // Check if there is a saved admin user so we bypass login quickly
    const savedAuth = localStorage.getItem('examsy_auth');
    if (savedAuth) {
      try {
        const auth = JSON.parse(savedAuth);
        if (auth.role === 'ADMIN') {
          setView('ADMIN_DASHBOARD');
        }
      } catch (e) {}
    }
    
    initFastLoad();
  }, []);

  // 2. Main dynamic subscription coordinator (Role/View-based selective syncing)
  useEffect(() => {
    if (isLoading) return;

    let unsubAll: (() => void) | null = null;
    let unsubRoomStudents: (() => void) | null = null;
    let unsubSingleStudent: (() => void) | null = null;
    let unsubSingleSession: (() => void) | null = null;

    if (view === 'ADMIN_DASHBOARD') {
      console.log("[Firebase] Activating Global DB Watcher for Admin Dashboard");
      setIsSyncing(true);
      unsubAll = syncData(
        (allStudents) => {
          setStudents(allStudents);
          setIsSyncing(false);
          setSyncError(null);
        },
        (allSessions) => {
          setSessions(allSessions);
        },
        (allRooms) => {
          setRooms(allRooms);
        },
        (err) => {
          console.error("Admin real-time sync failed:", err);
          setSyncError(err);
          setIsSyncing(false);
        }
      );
    } 
    else if (view === 'PROCTOR_DASHBOARD' && activeRoom) {
      console.log(`[Firebase] Activating Scoped Student Watcher for Proctor Room: ${activeRoom.name}`);
      setIsSyncing(true);
      
      // Perform fast load of latest configurations once
      getRoomsOnce().then(setRooms);
      getSessionsOnce().then(setSessions);

      // Listen ONLY to students belonging to this active proctor's room (drastically cuts read quota)
      unsubRoomStudents = syncRoomStudents(
        activeRoom.id,
        (roomStudents) => {
          setStudents(roomStudents);
          setIsSyncing(false);
          setSyncError(null);
        },
        (err) => {
          console.error("Proctor students sync failed:", err);
          setSyncError(err);
          setIsSyncing(false);
        }
      );
    } 
    else if (view === 'EXAM_ROOM' && currentUser && currentSession) {
      console.log(`[Firebase] Activating targeted Student [${currentUser.nis}] & Session [${currentSession.id}] Watchers`);
      setIsSyncing(true);

      // Listen ONLY to this specific student's document 
      unsubSingleStudent = syncSingleStudent(
        currentUser.nis,
        (updatedStudent) => {
          if (updatedStudent) {
            setStudents(prev => {
              const cleaned = prev.filter(s => String(s.nis) !== String(updatedStudent.nis));
              return [...cleaned, updatedStudent];
            });
            setCurrentUser(updatedStudent);
          }
          setIsSyncing(false);
        },
        (err) => console.error("Single student sync failed:", err)
      );

      // Listen ONLY to this specific sessions's document
      unsubSingleSession = syncSingleSession(
        currentSession.id,
        (updatedSession) => {
          if (updatedSession) {
            setSessions(prev => {
              const cleaned = prev.filter(s => s.id !== updatedSession.id);
              return [...cleaned, updatedSession];
            });
            setCurrentSession(updatedSession);
          }
        },
        (err) => console.error("Single session sync failed:", err)
      );
    } 
    else {
      // For inactive/login dashboards, pull updates of active sessions every 30 seconds
      // to avoid keeps an open gRPC channel when devices are idle
      console.log("[Firebase] Entering passive sleep mode - zero active live streams");
      
      const passiveFetch = () => {
        getSessionsOnce().then(loaded => {
          if (loaded?.length) setSessions(loaded);
        });
        getRoomsOnce().then(loaded => {
          if (loaded?.length) setRooms(loaded);
        });
      };
      
      passiveFetch();
      const intervalId = setInterval(passiveFetch, 30000);

      return () => {
        clearInterval(intervalId);
      };
    }

    return () => {
      if (unsubAll) unsubAll();
      if (unsubRoomStudents) unsubRoomStudents();
      if (unsubSingleStudent) unsubSingleStudent();
      if (unsubSingleSession) unsubSingleSession();
    };
  }, [view, activeRoom?.id, currentUser?.nis, currentSession?.id, isLoading]);

  // 3. Centralized effect to manage and validate student sessions in real-time
  useEffect(() => {
    // Only proceed if loading has finished
    if (isLoading) return;

    const savedAuth = localStorage.getItem('examsy_auth');
    if (!savedAuth) {
      // If no stored student auth and we are currently in EXAM_ROOM, return to login immediately
      if (view === 'EXAM_ROOM') {
        setCurrentUser(null);
        setCurrentSession(null);
        setView('STUDENT_LOGIN');
      }
      return;
    }

    try {
      const auth = JSON.parse(savedAuth);
      if (auth.role !== 'STUDENT' || !auth.nis || !auth.sessionId) {
        return; // This effect only governs student roles
      }

      // Read student & session states from either active single listeners or states
      const student = currentUser && String(currentUser.nis) === String(auth.nis) 
        ? currentUser 
        : students.find(s => String(s.nis).trim() === String(auth.nis).trim());

      const session = currentSession && currentSession.id === auth.sessionId 
        ? currentSession 
        : sessions.find(s => s.id === auth.sessionId);

      if (student && session) {
        // Validate class and active status of the student's exam session
        const isSessionValid = session.isActive && String(session.class).trim() === String(student.class).trim();

        if (isSessionValid) {
          if (view === 'STUDENT_LOGIN') {
            setView('EXAM_ROOM');
            if (student.status !== StudentStatus.SEDANG_UJIAN) {
              handleAction('UPDATE_STUDENT', {
                ...student,
                status: StudentStatus.SEDANG_UJIAN
              });
            }
          }
        } else {
          // The exam session is no longer valid (either deactivated by the proctor, or PIN changed, or class changed)
          console.log("Exam session is no longer valid or active. Logging out student.");
          localStorage.removeItem('examsy_auth');
          setCurrentUser(null);
          setCurrentSession(null);
          setView('STUDENT_LOGIN');

          // Reset student status to BELUM_MASUK in Firestore so they are able to log in to another active session (subject)
          if (student.status === StudentStatus.SEDANG_UJIAN || student.status === StudentStatus.SELESAI) {
            handleAction('UPDATE_STUDENT', {
              ...student,
              status: StudentStatus.BELUM_MASUK,
              violations: 0
            });
          }
        }
      } else if (view === 'EXAM_ROOM' && students.length > 0 && sessions.length > 0) {
        // Student or Session no longer exists in the database
        console.log("Student or Session not found in database. Resetting session.");
        localStorage.removeItem('examsy_auth');
        setCurrentUser(null);
        setCurrentSession(null);
        setView('STUDENT_LOGIN');
      }
    } catch (e) {
      console.error("Error in real-time student session validation effect:", e);
    }
  }, [students, sessions, view, currentUser, currentSession, isLoading]);

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
            <strong>Project ID:</strong> {activeConfig.projectId}
          </div>

          {isPermissionError ? (
            <div className="text-xs text-slate-300 mt-2 border-t border-slate-800/80 pt-3 space-y-3">
              <p className="font-semibold text-amber-400">🔑 Solusi Masalah Perizinan (Permission Denied):</p>
              <p className="leading-relaxed">
                Database Firebase baru Anda (<code className="text-indigo-400 font-mono bg-indigo-950/45 px-1 py-0.5 rounded">{activeConfig.projectId}</code>) saat ini memblokir akses baca-tulis karena aturan keamanannya. Ikuti 3 langkah mudah ini untuk membukanya:
              </p>
              <ol className="list-decimal pl-4 space-y-2">
                <li>
                  Buka tab <strong>Rules</strong> pada Firestore Database di Konsol Firebase Anda:<br />
                  <a 
                    href={`https://console.firebase.google.com/project/${activeConfig.projectId}/firestore/rules`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:underline font-semibold inline-block mt-1 font-mono break-all text-xs"
                  >
                    🔗 console.firebase.google.com/project/{activeConfig.projectId}/firestore/rules
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
                <li>Firestore Database belum diaktifkan di Console Firebase proyek <code className="text-indigo-400">{activeConfig.projectId}</code>. Silakan buka tab <strong>Firestore Database</strong> dan klik <strong>Create Database</strong>.</li>
                <li>Akun Google/Firebase Anda belum dibuat database atau masih dalam proses pembuatan.</li>
                <li>Koneksi internet Anda sedang diblokir oleh VPN, firewall, atau browser ad-blocker.</li>
              </ul>
            </div>
          )}
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-lg justify-center">
          <button 
            type="button"
            onClick={handleForceDemoDatabase} 
            className="cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-xl transition text-xs shadow-lg shadow-indigo-950/20"
          >
            🚀 Masuk dengan Demo DB bawaan
          </button>
          <button 
            type="button"
            onClick={() => {
              localStorage.clear();
              sessionStorage.clear();
              window.location.reload();
            }} 
            className="cursor-pointer bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 px-4 rounded-xl transition text-xs shadow-lg shadow-red-950/20"
          >
            Bersihkan Cache & Refresh
          </button>
          <button 
            type="button"
            onClick={() => window.location.reload()} 
            className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 px-4 rounded-xl transition text-xs border border-slate-700"
          >
            Muat Ulang
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center select-none font-sans">
        <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden text-left">
          {/* Decorative glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl"></div>

          <div className="flex items-center gap-4 mb-6">
            <div className="relative">
              <div className="w-12 h-12 border-3 border-slate-800 border-t-indigo-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-xs">☁️</div>
            </div>
            <div>
              <h2 className="text-white font-bold leading-tight">Examsy Cloud Sync...</h2>
              <p className="text-slate-400 text-xs">Mempersiapkan Koneksi Database Real-time</p>
            </div>
          </div>

          <div className="text-xs bg-slate-950/60 p-3 rounded-lg font-mono text-slate-400 border border-slate-800/80 mb-5 flex flex-col gap-1">
            <div><span className="text-indigo-400">Project ID:</span> {activeConfig.projectId}</div>
            <div><span className="text-indigo-400">Database Engine:</span> Cloud Firestore (modular)</div>
            <div><span className="text-amber-500">Koneksi:</span> Menunggu respons snapshot...</div>
          </div>

          {!showDiagnostics ? (
            <div className="text-center py-4">
              <p className="text-slate-500 text-xs animate-pulse">Menghubungkan ke layanan cloud... Kami akan menampilkan opsi diagnosa jika hal ini memerlukan waktu lama.</p>
            </div>
          ) : (
            <div className="space-y-4 pt-4 border-t border-slate-800/80">
              <div className="bg-amber-500/15 border border-amber-500/25 p-4 rounded-xl text-xs space-y-2 text-slate-300">
                <p className="font-bold text-amber-400 flex items-center gap-1.5">
                  ⚠️ Koneksi Tertunda (Loading Terus-menerus)
                </p>
                <p className="leading-relaxed">
                  Aplikasi sedang mencoba terhubung ke Firebase Anda (<code className="text-amber-300 bg-amber-950/40 px-1 rounded">{activeConfig.projectId}</code>). Namun, server Firestore belum memberikan respon balik.
                </p>
                <p className="font-semibold text-white mt-2">Penyebab Utama & Solusi:</p>
                <ul className="list-decimal pl-4 space-y-1.5 text-slate-300">
                  <li>
                    <strong className="text-white">Firestore Belum Dibuat:</strong> 
                    Apakah Anda sudah masuk ke tab <span className="font-semibold text-indigo-400">Firestore Database</span> di Console Firebase Anda untuk proyek tersebut, lalu mengklik <strong className="text-white">"Create Database"</strong>? Jika belum, SDK akan terus memutar halaman ini selamanya.
                  </li>
                  <li>
                    <strong className="text-white">Konfigurasi Salah:</strong> 
                    Pastikan API Key, App ID, dan Project ID sudah tepat dan sesuai dengan Web App yang Anda daftarkan di Firebase.
                  </li>
                  <li>
                    <strong className="text-white">Gagal Bypass Rules:</strong> 
                    Pastikan di tab <strong className="text-indigo-400">Rules</strong> Anda telah menyetel <code className="bg-slate-950 px-1 text-emerald-400 font-mono rounded">allow read, write: if true;</code>.
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <p className="font-semibold text-slate-300 text-xs uppercase tracking-wider">Pilih Aksi Pemulihan Quick-Fix:</p>
                
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={handleForceDemoDatabase}
                    className="cursor-pointer text-left w-full p-3 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 rounded-xl transition-all duration-200"
                  >
                    <div className="font-bold text-indigo-400 text-xs">🚀 Reset Kembali ke Database Utama Bawaan (examsy-new)</div>
                    <div className="text-[10px] text-slate-400 mt-1">Mengabaikan database kosong kustom & langsung mengaktifkan database demo siap pakai agar web berjalan lancar seketika.</div>
                  </button>

                  <button
                    type="button"
                    onClick={handleSeedSampleData}
                    disabled={seedStatus === 'seeding'}
                    className="cursor-pointer text-left w-full p-3 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 rounded-xl transition-all duration-200 disabled:opacity-50"
                  >
                    <div className="font-bold text-emerald-400 text-xs flex items-center justify-between">
                      <span>🌱 Hubungkan & Isi Data Contoh ke Database Anda</span>
                      {seedStatus === 'seeding' && <span className="animate-spin text-xs">🌀</span>}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">Gunakan ini JIKA Anda sudah yakin mengklik "Create Database" di Firebase Console Anda, untuk secara otomatis membuat tabel/koleksi awal kosong dengan data contoh.</div>
                  </button>

                  <button
                    type="button"
                    onClick={handleRestoreDefaultConfig}
                    className="cursor-pointer text-left w-full p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/80 rounded-xl transition-all duration-200"
                  >
                    <div className="font-bold text-slate-300 text-xs">📂 Reset Kembali Ke Konfigurasi File JSON Asli</div>
                    <div className="text-[10px] text-slate-400 mt-1">Menghapus cache lokal dan memuat ulang menggunakan setelan default yang tersimpan di file config.</div>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
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
              // Hapus sesi login dari localStorage agar tidak terkena efek sinkronisasi otomatis
              localStorage.removeItem('examsy_auth');
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
