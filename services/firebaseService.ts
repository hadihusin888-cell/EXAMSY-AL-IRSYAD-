
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot,
  writeBatch,
  enableIndexedDbPersistence
} from "firebase/firestore";
import { Student, ExamSession, Room } from "../types";

/**
 * Firebase Configuration.
 * GANTI nilai di bawah ini dengan data dari Firebase Console proyek baru Anda.
 */
const firebaseConfig = {
  apiKey: "AIzaSyDvx0AIwIkc1lfeDCNpKQ1GDbYiJT5-5v4",
  authDomain: "examsy-baru.firebaseapp.com",
  projectId: "examsy-baru",
  storageBucket: "examsy-baru.firebasestorage.app",
  messagingSenderId: "734881817348",
  appId: "1:734881817348:web:b2f327e57ff58f17662651",
  measurementId: "G-S2FKT3XVS6"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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

/**
 * Real-time data synchronization with Firestore.
 */
export const syncData = (
  onStudentsUpdate: (data: Student[]) => void,
  onSessionsUpdate: (data: ExamSession[]) => void,
  onRoomsUpdate: (data: Room[]) => void
) => {
  const unsubStudents = onSnapshot(collection(db, "students"), (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as Student);
    onStudentsUpdate(data);
  });

  const unsubSessions = onSnapshot(collection(db, "sessions"), (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as ExamSession);
    onSessionsUpdate(data);
  });

  const unsubRooms = onSnapshot(collection(db, "rooms"), (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as Room);
    onRoomsUpdate(data);
  });

  return () => {
    unsubStudents();
    unsubSessions();
    unsubRooms();
  };
};

/**
 * Performa database actions menggunakan Firestore.
 */
export const dbAction = async (action: string, payload: any): Promise<boolean> => {
  try {
    switch (action) {
      case 'ADD_STUDENT':
      case 'UPDATE_STUDENT':
        await setDoc(doc(db, "students", String(payload.nis)), payload, { merge: true });
        break;
      
      case 'DELETE_STUDENT':
        await deleteDoc(doc(db, "students", String(payload.nis)));
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
  } catch (err) {
    console.error("Firebase Action Error:", err);
    return false;
  }
};
