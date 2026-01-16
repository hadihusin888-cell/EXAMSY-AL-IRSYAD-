
// Fix: Use standard modular import for Firebase 9+
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
 * The API key is obtained from process.env.API_KEY as per the instructions.
 */
const firebaseConfig = {
  apiKey: process.env.API_KEY,
  authDomain: "examsy-al-irsyad.firebaseapp.com",
  projectId: "examsy-al-irsyad",
  storageBucket: "examsy-al-irsyad.firebasestorage.app",
  messagingSenderId: "1086198390639",
  appId: "1:1086198390639:web:78fb6ab78df0a062b4129a"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Enable Offline Persistence for semi-online functionality
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn("Multiple tabs open, persistence can only be enabled in one tab at a time.");
    } else if (err.code === 'unimplemented') {
      console.warn("The current browser does not support persistence.");
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
  // Real-time listener for students
  const unsubStudents = onSnapshot(collection(db, "students"), (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as Student);
    onStudentsUpdate(data);
  });

  // Real-time listener for exam sessions
  const unsubSessions = onSnapshot(collection(db, "sessions"), (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as ExamSession);
    onSessionsUpdate(data);
  });

  // Real-time listener for rooms
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
 * Performs database actions using Firestore.
 */
export const dbAction = async (action: string, payload: any): Promise<boolean> => {
  try {
    switch (action) {
      case 'ADD_STUDENT':
      case 'UPDATE_STUDENT':
        // Use NIS as Document ID to prevent duplicates
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
        console.warn("Action not recognized:", action);
        return false;
    }
    return true;
  } catch (err) {
    console.error("Firebase DB Action Error:", err);
    return false;
  }
};
