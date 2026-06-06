
// Fix: Use the standard modular import for Firebase v9+ from 'firebase/app'.
// In some environments, if 'initializeApp' is reported as missing, ensure the package is correctly resolved.
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
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
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

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
  let userId: string | null = null;
  let email: string | null = null;
  let emailVerified: boolean | null = null;
  let isAnonymous: boolean | null = null;
  let tenantId: string | null = null;
  let providerInfo: any[] = [];

  try {
    const auth = getAuth();
    userId = auth.currentUser?.uid || null;
    email = auth.currentUser?.email || null;
    emailVerified = auth.currentUser?.emailVerified || null;
    isAnonymous = auth.currentUser?.isAnonymous || null;
    tenantId = auth.currentUser?.tenantId || null;
    providerInfo = auth.currentUser?.providerData?.map(provider => ({
      providerId: provider.providerId,
      email: provider.email,
    })) || [];
  } catch (e) {
    // Auth might not be fully configured / loaded yet
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId,
      email,
      emailVerified,
      isAnonymous,
      tenantId,
      providerInfo
    },
    operationType,
    path
  };

  const errorMsg = error instanceof Error ? error.message : String(error);
  if (errorMsg.includes("Quota exceeded") || errorMsg.includes("resource-exhausted")) {
    console.warn(
      "Batas kuota harian Firestore gratis telah terlampaui (Quota exceeded / resource-exhausted). " +
      "Tautan peningkatan database Anda: https://console.firebase.google.com/project/portal-informatika/firestore/databases/ai-studio-92db1e8d-d270-4e51-b4f1-efdc8c346eb3/data?openUpgradeDialog=true"
    );
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
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

/**
 * Real-time data synchronization with Firestore.
 */
export const syncData = (
  onStudentsUpdate: (data: Student[]) => void,
  onSessionsUpdate: (data: ExamSession[]) => void,
  onRoomsUpdate: (data: Room[]) => void
) => {
  // Use unique variable names in map to avoid shadowing the 'doc' function imported from firestore
  const unsubStudents = onSnapshot(collection(db, "students"), (snapshot) => {
    const data = snapshot.docs.map(sDoc => sDoc.data() as Student);
    onStudentsUpdate(data);
  }, (error) => {
    try {
      handleFirestoreError(error, OperationType.GET, "students");
    } catch (e) {
      console.warn("Snapshot error handled at students list:", e);
    }
  });

  const unsubSessions = onSnapshot(collection(db, "sessions"), (snapshot) => {
    const data = snapshot.docs.map(sDoc => sDoc.data() as ExamSession);
    onSessionsUpdate(data);
  }, (error) => {
    try {
      handleFirestoreError(error, OperationType.GET, "sessions");
    } catch (e) {
      console.warn("Snapshot error handled at sessions list:", e);
    }
  });

  const unsubRooms = onSnapshot(collection(db, "rooms"), (snapshot) => {
    const data = snapshot.docs.map(sDoc => sDoc.data() as Room);
    onRoomsUpdate(data);
  }, (error) => {
    try {
      handleFirestoreError(error, OperationType.GET, "rooms");
    } catch (e) {
      console.warn("Snapshot error handled at rooms list:", e);
    }
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
        try {
          await setDoc(doc(db, "students", String(payload.nis)), payload, { merge: true });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `students/${payload.nis}`);
        }
        break;
      
      case 'DELETE_STUDENT':
        try {
          await deleteDoc(doc(db, "students", String(payload.nis)));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `students/${payload.nis}`);
        }
        break;

      case 'BULK_DELETE_STUDENTS':
        try {
          const studentBatch = writeBatch(db);
          payload.forEach((nis: string) => {
            const studentRef = doc(db, "students", String(nis));
            studentBatch.delete(studentRef);
          });
          await studentBatch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, "students");
        }
        break;

      case 'BULK_UPDATE_STUDENTS':
        try {
          const batch = writeBatch(db);
          payload.selectedNis.forEach((nis: string) => {
            const studentRef = doc(db, "students", nis);
            batch.update(studentRef, payload.updates);
          });
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, "students");
        }
        break;

      case 'ADD_SESSION':
      case 'UPDATE_SESSION':
        try {
          await setDoc(doc(db, "sessions", String(payload.id)), payload, { merge: true });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `sessions/${payload.id}`);
        }
        break;

      case 'DELETE_SESSION':
        try {
          await deleteDoc(doc(db, "sessions", String(payload.id)));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `sessions/${payload.id}`);
        }
        break;

      case 'BULK_DELETE_SESSIONS':
        try {
          const sessionBatch = writeBatch(db);
          payload.forEach((id: string) => {
            const sessionRef = doc(db, "sessions", id);
            sessionBatch.delete(sessionRef);
          });
          await sessionBatch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, "sessions");
        }
        break;

      case 'ADD_ROOM':
      case 'UPDATE_ROOM':
        try {
          await setDoc(doc(db, "rooms", String(payload.id)), payload, { merge: true });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `rooms/${payload.id}`);
        }
        break;

      case 'DELETE_ROOM':
        try {
          await deleteDoc(doc(db, "rooms", String(payload.id)));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `rooms/${payload.id}`);
        }
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
