
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
        } else if (auth.role === 'PROCTOR' && auth.roomId) {
          // Kita akan set view ke PROCTOR_DASHBOARD nanti setelah rooms terisi
          // Untuk sementara kita simpan roomId-nya
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
        setIsLoading(false);
        setIsSyncing(false);
      },
      (sessionData) => {
        setSessions(sessionData);
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
      }
    );

    return () => unsub();
  }, []);

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
    // Update status siswa menjadi sedang ujian di database
    const success = await handleAction('UPDATE_STUDENT', { 
      ...student, 
      status: StudentStatus.SEDANG_UJIAN 
    });
    
    if (success) {
      setCurrentUser(student);
      setCurrentSession(session);
      setView('EXAM_ROOM');
    } else {
      alert("Gagal memproses login. Silakan cek koneksi Anda.");
    }
    setIsProcessing(false);
  };

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
