
// Fix: Use the standard modular import for Firebase v9+ from 'firebase/app'.
// In some environments, if 'initializeApp' is reported as missing, ensure the package is correctly resolved.
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
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const errCode = (error as any)?.code || 'permission-denied';
  
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };

  const formattedError = new Error(JSON.stringify(errInfo));
  (formattedError as any).code = errCode; // preserve the original code for our UI component
  
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw formattedError;
}

/**
 * Firebase Configuration.
 * GANTI nilai di bawah ini dengan data dari Firebase Console proyek baru Anda.
 */
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const db = (firebaseConfig as any).firestoreDatabaseId
  ? getFirestore(app, (firebaseConfig as any).firestoreDatabaseId)
  : getFirestore(app);

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
  onRoomsUpdate: (data: Room[]) => void,
  onError?: (error: any) => void
) => {
  const unsubStudents = onSnapshot(collection(db, "students"), 
    (snapshot) => {
      const data = snapshot.docs.map(sDoc => sDoc.data() as Student);
      onStudentsUpdate(data);
    },
    (error) => {
      console.error("students snapshot error:", error);
      try {
        handleFirestoreError(error, OperationType.GET, "students");
      } catch (formattedError) {
        if (onError) onError(formattedError);
      }
    }
  );

  const unsubSessions = onSnapshot(collection(db, "sessions"), 
    (snapshot) => {
      const data = snapshot.docs.map(sDoc => sDoc.data() as ExamSession);
      onSessionsUpdate(data);
    },
    (error) => {
      console.error("sessions snapshot error:", error);
      try {
        handleFirestoreError(error, OperationType.GET, "sessions");
      } catch (formattedError) {
        if (onError) onError(formattedError);
      }
    }
  );

  const unsubRooms = onSnapshot(collection(db, "rooms"), 
    (snapshot) => {
      const data = snapshot.docs.map(sDoc => sDoc.data() as Room);
      onRoomsUpdate(data);
    },
    (error) => {
      console.error("rooms snapshot error:", error);
      try {
        handleFirestoreError(error, OperationType.GET, "rooms");
      } catch (formattedError) {
        if (onError) onError(formattedError);
      }
    }
  );

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
  } catch (err) {
    console.error("Firebase Action Error:", err);
    try {
      handleFirestoreError(err, OperationType.WRITE, action);
    } catch (e) {
      // Just catch formatted error so it doesn't crash the call stack
    }
    return false;
  }
};
