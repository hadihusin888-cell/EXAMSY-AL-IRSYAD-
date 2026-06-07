
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

export interface QuotaStats {
  readsUsed: number;
  writesUsed: number;
  deletesUsed: number;
  readsLimit: number;
  writesLimit: number;
  deletesLimit: number;
  readsPercent: number;
  writesPercent: number;
  deletesPercent: number;
  estimatedDocCount: number;
  estimatedStorageBytes: number;
  storageLimitBytes: number;
  storagePercent: number;
}

const QUOTA_STORAGE_KEY = "firebase_quota_tracker_v1";

export const getQuotaStats = (currentDocsCount: number = 0): QuotaStats => {
  if (typeof window === "undefined") {
    return {
      readsUsed: 0, writesUsed: 0, deletesUsed: 0,
      readsLimit: 50000, writesLimit: 20000, deletesLimit: 20000,
      readsPercent: 0, writesPercent: 0, deletesPercent: 0,
      estimatedDocCount: 0, estimatedStorageBytes: 0, storageLimitBytes: 1048576 * 1024,
      storagePercent: 0
    };
  }

  const todayStr = new Date().toISOString().split('T')[0];
  let dataStr = localStorage.getItem(QUOTA_STORAGE_KEY);
  let data = { date: todayStr, reads: 0, writes: 0, deletes: 0 };

  if (dataStr) {
    try {
      const parsed = JSON.parse(dataStr);
      if (parsed.date === todayStr) {
        data = parsed;
      } else {
        data = { date: todayStr, reads: 0, writes: 0, deletes: 0 };
        localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(data));
      }
    } catch (e) {
      console.error("Error parsing quota data", e);
    }
  }

  const readsLimit = 50000;
  const writesLimit = 20000;
  const deletesLimit = 20000;
  const storageLimitBytes = 1024 * 1024 * 1024; // 1 GiB

  // Document storage estimate: average document size is ~800 bytes in Firestore metadata
  const avgDocSizeBytes = 800;
  const estimatedStorageBytes = currentDocsCount * avgDocSizeBytes;

  return {
    readsUsed: data.reads,
    writesUsed: data.writes,
    deletesUsed: data.deletes,
    readsLimit,
    writesLimit,
    deletesLimit,
    readsPercent: parseFloat(((data.reads / readsLimit) * 100).toFixed(2)),
    writesPercent: parseFloat(((data.writes / writesLimit) * 100).toFixed(2)),
    deletesPercent: parseFloat(((data.deletes / deletesLimit) * 100).toFixed(2)),
    estimatedDocCount: currentDocsCount,
    estimatedStorageBytes,
    storageLimitBytes,
    storagePercent: parseFloat(((estimatedStorageBytes / storageLimitBytes) * 100).toFixed(4))
  };
};

export const incrementQuotaMetric = (metric: "reads" | "writes" | "deletes", count: number = 1) => {
  if (typeof window === "undefined") return;
  const todayStr = new Date().toISOString().split('T')[0];
  let dataStr = localStorage.getItem(QUOTA_STORAGE_KEY);
  let data = { date: todayStr, reads: 0, writes: 0, deletes: 0 };

  if (dataStr) {
    try {
      const parsed = JSON.parse(dataStr);
      if (parsed.date === todayStr) {
        data = parsed;
      }
    } catch (e) {}
  }

  data[metric] = (data[metric] || 0) + count;
  localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(data));
};

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
      // Track read operations only if they do not come from the offline cache
      if (!snapshot.metadata.fromCache) {
        incrementQuotaMetric("reads", snapshot.docChanges().length);
      }
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
      // Track read operations only if they do not come from the offline cache
      if (!snapshot.metadata.fromCache) {
        incrementQuotaMetric("reads", snapshot.docChanges().length);
      }
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
      // Track read operations only if they do not come from the offline cache
      if (!snapshot.metadata.fromCache) {
        incrementQuotaMetric("reads", snapshot.docChanges().length);
      }
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
        incrementQuotaMetric("writes", 1);
        break;
      
      case 'DELETE_STUDENT':
        await deleteDoc(doc(db, "students", String(payload.nis)));
        incrementQuotaMetric("deletes", 1);
        break;
 
      case 'BULK_DELETE_STUDENTS':
        const studentBatch = writeBatch(db);
        payload.forEach((nis: string) => {
          const studentRef = doc(db, "students", String(nis));
          studentBatch.delete(studentRef);
        });
        await studentBatch.commit();
        incrementQuotaMetric("deletes", payload.length);
        break;
 
      case 'BULK_UPDATE_STUDENTS':
        const batch = writeBatch(db);
        payload.selectedNis.forEach((nis: string) => {
          const studentRef = doc(db, "students", nis);
          batch.update(studentRef, payload.updates);
        });
        await batch.commit();
        incrementQuotaMetric("writes", payload.selectedNis.length);
        break;
 
      case 'ADD_SESSION':
      case 'UPDATE_SESSION':
        await setDoc(doc(db, "sessions", String(payload.id)), payload, { merge: true });
        incrementQuotaMetric("writes", 1);
        break;
 
      case 'DELETE_SESSION':
        await deleteDoc(doc(db, "sessions", String(payload.id)));
        incrementQuotaMetric("deletes", 1);
        break;
 
      case 'BULK_DELETE_SESSIONS':
        const sessionBatch = writeBatch(db);
        payload.forEach((id: string) => {
          const sessionRef = doc(db, "sessions", id);
          sessionBatch.delete(sessionRef);
        });
        await sessionBatch.commit();
        incrementQuotaMetric("deletes", payload.length);
        break;
 
      case 'ADD_ROOM':
      case 'UPDATE_ROOM':
        await setDoc(doc(db, "rooms", String(payload.id)), payload, { merge: true });
        incrementQuotaMetric("writes", 1);
        break;
 
      case 'DELETE_ROOM':
        await deleteDoc(doc(db, "rooms", String(payload.id)));
        incrementQuotaMetric("deletes", 1);
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
