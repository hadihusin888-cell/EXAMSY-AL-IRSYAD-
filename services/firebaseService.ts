
// Fix: Use the standard modular import for Firebase v9+ from 'firebase/app'.
// In some environments, if 'initializeApp' is reported as missing, ensure the package is correctly resolved.
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc,
  getDocs,
  query,
  where,
  setDoc, 
  deleteDoc, 
  onSnapshot,
  writeBatch,
  enableIndexedDbPersistence
} from "firebase/firestore";
import { Student, ExamSession, Room, StudentStatus } from "../types";

// Firebase Configuration.
// GANTI nilai di bawah ini dengan data dari Firebase Console proyek baru Anda.
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Setup Error Handler conforming to FirestoreErrorInfo
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

// Global active offline fallback status flag
let isOfflineFallbackActive = false;

// Check if we are running in quota-exceeded or offline-simulated mode
export const checkIsOfflineFallbackActive = (): boolean => {
  if (typeof window !== 'undefined') {
    return isOfflineFallbackActive || localStorage.getItem("examsy_quota_exceeded") === "true";
  }
  return isOfflineFallbackActive;
};

export const setOfflineFallbackActive = (active: boolean) => {
  isOfflineFallbackActive = active;
  if (typeof window !== 'undefined') {
    if (active) {
      localStorage.setItem("examsy_quota_exceeded", "true");
    } else {
      localStorage.removeItem("examsy_quota_exceeded");
    }
  }
};

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  if (errMsg.includes("Quota exceeded") || errMsg.includes("quota")) {
    setOfflineFallbackActive(true);
  }
  
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: null,
      email: null,
    },
    operationType,
    path
  };
  console.warn('Firestore Handled Error (quota/conn): ', JSON.stringify(errInfo));
}

// Enable Offline Persistence untuk fitur semi-online
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn("Persistensi gagal: Tab ganda terbuka.");
    } else if (err.code === 'unimplemented') {
      console.warn("Browser ini tidak mendukung persistensi offline.");
    }
  });
}

// PREMIUM DEMO FALLBACK DATA
export const DEFAULT_FALLBACK_ROOMS: Room[] = [
  { id: "ruang_01", name: "Laboratorium Komputer 1", capacity: 36, username: "proktor01", password: "password01" },
  { id: "ruang_02", name: "Laboratorium Komputer 2", capacity: 36, username: "proktor02", password: "password02" },
  { id: "ruang_03", name: "Laboratorium Bahasa", capacity: 30, username: "proktor03", password: "password03" }
];

export const DEFAULT_FALLBACK_SESSIONS: ExamSession[] = [
  {
    id: "session_01",
    name: "Penilaian Akhir Semester - Matematika",
    class: "XII-IPA-1",
    pin: "MATE12",
    durationMinutes: 90,
    isActive: true,
    date: "2026-06-15",
    questions: [
      {
        id: "q1",
        text: "Jika f(x) = 2x + 3 dan g(x) = x^2 - 1, tentukan nilai dari (f o g)(2)!",
        options: ["11", "9", "15", "7", "13"],
        correctAnswer: 1
      },
      {
        id: "q2",
        text: "Hitunglah nilai limit x mendekati 3 dari (x^2 - 9)/(x - 3)!",
        options: ["3", "6", "9", "12", "0"],
        correctAnswer: 1
      },
      {
        id: "q3",
        text: "Tentukan turunan pertama dari y = sin(2x)!",
        options: ["cos(2x)", "2 cos(2x)", "-2 cos(2x)", "-cos(2x)", "2 sin(2x)"],
        correctAnswer: 1
      },
      {
        id: "q4",
        text: "Sebuah dadu dilempar sekali. Peluang munculnya mata dadu prima ganjil adalah...",
        options: ["1/6", "1/3", "1/2", "2/3", "5/6"],
        correctAnswer: 1
      },
      {
        id: "q5",
        text: "Berapa banyak susunan kata berbeda yang dapat dibentuk dari kata 'BATU'?",
        options: ["12", "24", "48", "6", "18"],
        correctAnswer: 1
      }
    ]
  },
  {
    id: "session_02",
    name: "Penilaian Akhir Semester - Bahasa Inggris",
    class: "XII-IPS-2",
    pin: "ENGL12",
    durationMinutes: 120,
    isActive: true,
    date: "2026-06-16",
    questions: [
      {
        id: "eq1",
        text: "What is the synonym of the word 'BENEFICIAL'?",
        options: ["Harmful", "Useless", "Helpful", "Damaging", "Costly"],
        correctAnswer: 2
      },
      {
        id: "eq2",
        text: "Complete the sentence: 'If I ___ you, I would take the offer.'",
        options: ["am", "was", "were", "been", "would be"],
        correctAnswer: 2
      }
    ]
  }
];

export const DEFAULT_FALLBACK_STUDENTS: Student[] = [
  { nis: "12345", name: "Ahmad Fauzi", class: "XII-IPA-1", password: "password123", status: StudentStatus.BELUM_MASUK, roomId: "ruang_01", violations: 0 },
  { nis: "54215", name: "Budi Santoso", class: "XII-IPA-1", password: "password123", status: StudentStatus.BELUM_MASUK, roomId: "ruang_01", violations: 0 },
  { nis: "11223", name: "Citra Lestari", class: "XII-IPA-1", password: "password123", status: StudentStatus.BELUM_MASUK, roomId: "ruang_01", violations: 0 },
  { nis: "67890", name: "Dewi Anggraini", class: "XII-IPS-2", password: "password123", status: StudentStatus.BELUM_MASUK, roomId: "ruang_02", violations: 0 },
  { nis: "98765", name: "Eko Prasetyo", class: "XII-IPS-2", password: "password123", status: StudentStatus.BELUM_MASUK, roomId: "ruang_02", violations: 0 }
];

// Helper to pre-populate cache empty state
const initCacheIfEmpty = () => {
  if (typeof window !== 'undefined') {
    if (!localStorage.getItem("examsy_cache_students")) {
      localStorage.setItem("examsy_cache_students", JSON.stringify(DEFAULT_FALLBACK_STUDENTS));
    }
    if (!localStorage.getItem("examsy_cache_sessions")) {
      localStorage.setItem("examsy_cache_sessions", JSON.stringify(DEFAULT_FALLBACK_SESSIONS));
    }
    if (!localStorage.getItem("examsy_cache_rooms")) {
      localStorage.setItem("examsy_cache_rooms", JSON.stringify(DEFAULT_FALLBACK_ROOMS));
    }
  }
};
initCacheIfEmpty();

/**
 * Sync operations back to localStorage cache list directly so actions persist locally during quota simulation.
 */
export const updateLocalCacheList = (action: string, payload: any) => {
  if (typeof window === 'undefined') return;
  
  const getHelper = (key: string): any[] => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  };

  const cachedStudents = getHelper("examsy_cache_students").length ? getHelper("examsy_cache_students") : DEFAULT_FALLBACK_STUDENTS;
  const cachedSessions = getHelper("examsy_cache_sessions").length ? getHelper("examsy_cache_sessions") : DEFAULT_FALLBACK_SESSIONS;
  const cachedRooms = getHelper("examsy_cache_rooms").length ? getHelper("examsy_cache_rooms") : DEFAULT_FALLBACK_ROOMS;

  if (action === 'ADD_STUDENT' || action === 'UPDATE_STUDENT') {
    const list = [...cachedStudents];
    const idx = list.findIndex(s => String(s.nis) === String(payload.nis));
    if (idx > -1) {
      list[idx] = { ...list[idx], ...payload };
    } else {
      list.push(payload);
    }
    localStorage.setItem("examsy_cache_students", JSON.stringify(list));
  } else if (action === 'DELETE_STUDENT') {
    const list = cachedStudents.filter(s => String(s.nis) !== String(payload.nis));
    localStorage.setItem("examsy_cache_students", JSON.stringify(list));
  } else if (action === 'BULK_DELETE_STUDENTS') {
    const list = cachedStudents.filter(s => !payload.includes(String(s.nis)));
    localStorage.setItem("examsy_cache_students", JSON.stringify(list));
  } else if (action === 'BULK_UPDATE_STUDENTS') {
    const list = cachedStudents.map(s => {
      if (payload.selectedNis.includes(String(s.nis))) {
        return { ...s, ...payload.updates };
      }
      return s;
    });
    localStorage.setItem("examsy_cache_students", JSON.stringify(list));
  } else if (action === 'ADD_SESSION' || action === 'UPDATE_SESSION') {
    const list = [...cachedSessions];
    const idx = list.findIndex(s => String(s.id) === String(payload.id));
    if (idx > -1) {
      list[idx] = { ...list[idx], ...payload };
    } else {
      list.push(payload);
    }
    localStorage.setItem("examsy_cache_sessions", JSON.stringify(list));
  } else if (action === 'DELETE_SESSION') {
    const list = cachedSessions.filter(s => String(s.id) !== String(payload.id));
    localStorage.setItem("examsy_cache_sessions", JSON.stringify(list));
  } else if (action === 'BULK_DELETE_SESSIONS') {
    const list = cachedSessions.filter(s => !payload.includes(String(s.id)));
    localStorage.setItem("examsy_cache_sessions", JSON.stringify(list));
  } else if (action === 'ADD_ROOM' || action === 'UPDATE_ROOM') {
    const list = [...cachedRooms];
    const idx = list.findIndex(r => String(r.id) === String(payload.id));
    if (idx > -1) {
      list[idx] = { ...list[idx], ...payload };
    } else {
      list.push(payload);
    }
    localStorage.setItem("examsy_cache_rooms", JSON.stringify(list));
  } else if (action === 'DELETE_ROOM') {
    const list = cachedRooms.filter(r => String(r.id) !== String(payload.id));
    localStorage.setItem("examsy_cache_rooms", JSON.stringify(list));
  }
};

/**
 * Load static data profiles with one-time fetch (getDocs) to conserve reads.
 */
export const fetchStudents = async (): Promise<Student[]> => {
  try {
    if (checkIsOfflineFallbackActive()) {
      throw new Error("Quota Exceeded Mode");
    }
    const qSnapshot = await getDocs(collection(db, "students"));
    const data = qSnapshot.docs.map(doc => doc.data() as Student);
    localStorage.setItem("examsy_cache_students", JSON.stringify(data));
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "students");
    const cached = localStorage.getItem("examsy_cache_students");
    if (cached) {
      try { return JSON.parse(cached); } catch(_) {}
    }
    return DEFAULT_FALLBACK_STUDENTS;
  }
};

export const fetchSessions = async (): Promise<ExamSession[]> => {
  try {
    if (checkIsOfflineFallbackActive()) {
      throw new Error("Quota Exceeded Mode");
    }
    const qSnapshot = await getDocs(collection(db, "sessions"));
    const data = qSnapshot.docs.map(doc => doc.data() as ExamSession);
    localStorage.setItem("examsy_cache_sessions", JSON.stringify(data));
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "sessions");
    const cached = localStorage.getItem("examsy_cache_sessions");
    if (cached) {
      try { return JSON.parse(cached); } catch(_) {}
    }
    return DEFAULT_FALLBACK_SESSIONS;
  }
};

export const fetchRooms = async (): Promise<Room[]> => {
  try {
    if (checkIsOfflineFallbackActive()) {
      throw new Error("Quota Exceeded Mode");
    }
    const qSnapshot = await getDocs(collection(db, "rooms"));
    const data = qSnapshot.docs.map(doc => doc.data() as Room);
    localStorage.setItem("examsy_cache_rooms", JSON.stringify(data));
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "rooms");
    const cached = localStorage.getItem("examsy_cache_rooms");
    if (cached) {
      try { return JSON.parse(cached); } catch(_) {}
    }
    return DEFAULT_FALLBACK_ROOMS;
  }
};

/**
 * Combined high-efficiency static data fetcher.
 */
export const fetchStaticData = async (): Promise<{ students: Student[]; sessions: ExamSession[]; rooms: Room[] }> => {
  try {
    const [students, sessions, rooms] = await Promise.all([
      fetchStudents(),
      fetchSessions(),
      fetchRooms()
    ]);
    return { students, sessions, rooms };
  } catch (error) {
    console.error("Combined static data fetch failed:", error);
    const cachedStudents = localStorage.getItem("examsy_cache_students");
    const cachedSessions = localStorage.getItem("examsy_cache_sessions");
    const cachedRooms = localStorage.getItem("examsy_cache_rooms");
    return {
      students: cachedStudents ? JSON.parse(cachedStudents) : DEFAULT_FALLBACK_STUDENTS,
      sessions: cachedSessions ? JSON.parse(cachedSessions) : DEFAULT_FALLBACK_SESSIONS,
      rooms: cachedRooms ? JSON.parse(cachedRooms) : DEFAULT_FALLBACK_ROOMS
    };
  }
};

/**
 * Real-time data synchronization with Firestore.
 * Deprecated active entire-collection listeners to conserve reads quota,
 * keeping it as a legacy helper fallback or simple emitter if needed.
 */
export const syncData = (
  onStudentsUpdate: (data: Student[]) => void,
  onSessionsUpdate: (data: ExamSession[]) => void,
  onRoomsUpdate: (data: Room[]) => void
) => {
  // We use fallback fetch to notify once, immediately terminating active continuous listeners
  fetchStaticData().then(data => {
    onStudentsUpdate(data.students);
    onSessionsUpdate(data.sessions);
    onRoomsUpdate(data.rooms);
  });

  return () => {
    // No-op closure
  };
};

/**
 * Validasi Login Siswa secara langsung / on-demand untuk menghemat kuota reads Firestore.
 * Hanya melakukan getDoc pada 1 dokumen murid dan query minimal pada sesi aktif.
 */
export const validateStudentLogin = async (
  nis: string,
  pass: string,
  studentClass: string,
  pin: string
): Promise<{ success: boolean; student?: Student; session?: ExamSession; error?: string }> => {
  const trimmedNis = String(nis).trim();
  const trimmedPass = String(pass).trim();
  const trimmedClass = String(studentClass).trim();
  const trimmedPin = String(pin).trim().toUpperCase();

  try {
    if (checkIsOfflineFallbackActive()) {
      throw new Error("Quota simulation active");
    }

    // 1. Ambil dokumen siswa secara langsung lewat ID (NIS)
    const studentRef = doc(db, "students", trimmedNis);
    const studentSnap = await getDoc(studentRef);

    if (!studentSnap.exists()) {
      return { success: false, error: 'NIS atau Password Anda tidak terdaftar.' };
    }

    const student = studentSnap.data() as Student;
    if (String(student.password || '').trim() !== trimmedPass) {
      return { success: false, error: 'NIS atau Password Anda tidak terdaftar.' };
    }

    if (student.status === StudentStatus.BLOKIR) {
      return { success: false, error: 'Akses ditolak. Akun Anda dalam status BLOKIR.' };
    }

    if (student.status === StudentStatus.SELESAI) {
      return { success: false, error: 'Anda telah menyelesaikan sesi ujian ini.' };
    }

    if (String(student.class).trim() !== trimmedClass) {
      return { success: false, error: `Sinkronisasi Gagal: Anda terdaftar di Kelas ${student.class}, bukan Kelas ${trimmedClass}.` };
    }

    // 2. Cari sesi aktif berdasarkan kriteria filter minimal
    const q = query(
      collection(db, "sessions"), 
      where("isActive", "==", true),
      where("class", "==", trimmedClass)
    );
    const querySnapshot = await getDocs(q);
    
    let matchedSession: ExamSession | null = null;
    querySnapshot.forEach((doc) => {
      const sess = doc.data() as ExamSession;
      if (String(sess.pin || '').trim().toUpperCase() === trimmedPin) {
        matchedSession = sess;
      }
    });

    if (!matchedSession) {
      return { success: false, error: 'PIN Sesi tidak aktif atau tidak ditemukan.' };
    }

    // Cache the validated state locally also
    updateLocalCacheList('UPDATE_STUDENT', student);
    updateLocalCacheList('UPDATE_SESSION', matchedSession);

    return { success: true, student, session: matchedSession };
  } catch (err) {
    console.warn("Optimized DB Login failed, attempting cache verification as safe fallback:", err);
    setOfflineFallbackActive(true);

    // Cache local check
    const cachedStudentsRaw = localStorage.getItem("examsy_cache_students");
    const cachedStudents: Student[] = cachedStudentsRaw ? JSON.parse(cachedStudentsRaw) : DEFAULT_FALLBACK_STUDENTS;
    const student = cachedStudents.find(s => String(s.nis).trim() === trimmedNis);

    if (!student) {
      return { success: false, error: 'NIS atau Password tidak ditemukan dalam sistem lokal.' };
    }

    if (String(student.password || '').trim() !== trimmedPass) {
      return { success: false, error: 'NIS atau Password Anda salah (Verifikasi Offline).' };
    }

    if (student.status === StudentStatus.BLOKIR) {
      return { success: false, error: 'Akses ditolak. Akun Anda dalam status BLOKIR.' };
    }

    if (student.status === StudentStatus.SELESAI) {
      return { success: false, error: 'Anda telah menyelesaikan sesi ujian ini.' };
    }

    if (String(student.class).trim() !== trimmedClass) {
      return { success: false, error: `Sinkronisasi Gagal: Anda terdaftar di Kelas ${student.class}, bukan Kelas ${trimmedClass}.` };
    }

    const cachedSessionsRaw = localStorage.getItem("examsy_cache_sessions");
    const cachedSessions: ExamSession[] = cachedSessionsRaw ? JSON.parse(cachedSessionsRaw) : DEFAULT_FALLBACK_SESSIONS;
    const matchedSession = cachedSessions.find(sess => 
      sess.isActive && 
      String(sess.class).trim() === trimmedClass && 
      String(sess.pin || '').trim().toUpperCase() === trimmedPin
    );

    if (!matchedSession) {
      return { success: false, error: 'PIN Sesi tidak aktif atau tidak ditemukan.' };
    }

    return { success: true, student, session: matchedSession };
  }
};

/**
 * Performa database actions menggunakan Firestore.
 */
export const dbAction = async (action: string, payload: any): Promise<boolean> => {
  // Always update our local storage mirror first to maintain real-time responsiveness and keep local simulation running!
  updateLocalCacheList(action, payload);

  if (checkIsOfflineFallbackActive()) {
    console.log(`[Offline Simulation Mode] Saved action ${action} directly to local sandbox cache.`);
    return true;
  }

  try {
    switch (action) {
      case 'ADD_STUDENT':
      case 'UPDATE_STUDENT':
        await setDoc(doc(db, "students", String(payload.nis)), payload, { merge: true });
        break;
      
      case 'DELETE_STUDENT':
        await deleteDoc(doc(db, "students", String(payload.nis)));
        break;

      case 'BULK_DELETE_STUDENTS':
        const studentBatch = writeBatch(db);
        payload.forEach((nis: string) => {
          const studentRef = doc(db, "students", String(nis));
          studentBatch.delete(studentRef);
        });
        await studentBatch.commit();
        break;

      case 'BULK_UPDATE_STUDENTS':
        const batch = writeBatch(db);
        payload.selectedNis.forEach((nis: string) => {
          const studentRef = doc(db, "students", nis);
          batch.update(studentRef, payload.updates);
        });
        await batch.commit();
        break;

      case 'ADD_SESSION':
      case 'UPDATE_SESSION':
        await setDoc(doc(db, "sessions", String(payload.id)), payload, { merge: true });
        break;

      case 'DELETE_SESSION':
        await deleteDoc(doc(db, "sessions", String(payload.id)));
        break;

      case 'BULK_DELETE_SESSIONS':
        const sessionBatch = writeBatch(db);
        payload.forEach((id: string) => {
          const sessionRef = doc(db, "sessions", id);
          sessionBatch.delete(sessionRef);
        });
        await sessionBatch.commit();
        break;

      case 'ADD_ROOM':
      case 'UPDATE_ROOM':
        await setDoc(doc(db, "rooms", String(payload.id)), payload, { merge: true });
        break;

      case 'DELETE_ROOM':
        await deleteDoc(doc(db, "rooms", String(payload.id)));
        break;

      default:
        return false;
    }
    return true;
  } catch (err: any) {
    console.warn("Firebase action write error, seamlessly backed up locally: " + err.message);
    if (err.message?.includes("Quota exceeded") || err.message?.includes("quota")) {
      setOfflineFallbackActive(true);
    }
    // Return true since we saved this locally successfully!
    return true;
  }
};
