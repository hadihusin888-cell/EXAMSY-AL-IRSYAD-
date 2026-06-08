import { Student, ExamSession, Room } from "../types";

export interface DatabaseStatus {
  success: boolean;
  engine: "MongoDB" | "Local JSON Fallback";
  mongoConnected: boolean;
  error?: string;
  uriSet: boolean;
  localFilePath?: string;
}

/**
 * Fetch database status diagnostics from Express server.
 */
export const getDatabaseStatus = async (): Promise<DatabaseStatus> => {
  try {
    const res = await fetch("/api/status");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      engine: "Local JSON Fallback",
      mongoConnected: false,
      error: err.message || String(err),
      uriSet: false
    };
  }
};

/**
 * Fetch a single student's document with exact target lookup.
 */
export const getStudentOnce = async (nis: string): Promise<Student | null> => {
  try {
    const res = await fetch(`/api/students/${encodeURIComponent(nis)}`);
    if (!res.ok) return null;
    const body = await res.json();
    return body.success ? body.data : null;
  } catch (err) {
    console.error("Failed to fetch student once:", err);
    return null;
  }
};

/**
 * Migrate/Import existing client data (loaded from Firebase/Local) directly onto the backend.
 */
export const migrateToBackendMongoDB = async (data: {
  students: Student[];
  sessions: ExamSession[];
  rooms: Room[];
}): Promise<{ success: boolean; message: string }> => {
  try {
    const res = await fetch("/api/migrate-from-firebase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    
    if (!res.ok) {
       throw new Error(`Migration Failed with HTTP ${res.status}`);
    }
    
    return await res.json();
  } catch (err: any) {
    console.error("Migration error:", err);
    return { success: false, message: err.message || "Failed to contact migration endpoint" };
  }
};

/**
 * Perform any database modification/CRUD actions on the backend.
 */
export const dbAction = async (action: string, payload: any): Promise<boolean> => {
  try {
    const res = await fetch("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload })
    });
    
    if (!res.ok) return false;
    const result = await res.json();
    return result.success;
  } catch (err) {
    console.error(`dbAction (${action}) failed to reach endpoint:`, err);
    return false;
  }
};

/**
 * Unified synchronization manager for the clients.
 * Uses optimized polling to fetch differences every 3 seconds for active rooms/exams, 
 * or 15 seconds for idle screens, keeping read consumption at complete zero on Firebase!
 */
export const syncBackendData = (
  role: 'ADMIN' | 'PROCTOR' | 'STUDENT' | 'LOGIN',
  roomId: string | null,
  onUpdate: (data: { students: Student[]; sessions: ExamSession[]; rooms: Room[] }) => void,
  intervalMs = 4000
) => {
  let isStopped = false;
  let timerId: any = null;

  const performFetch = async () => {
    if (isStopped) return;
    try {
      let url = "/api/sync";
      if (role === 'PROCTOR' && roomId) {
        url += `?roomId=${encodeURIComponent(roomId)}`;
      }
      
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      const body = await res.json();
      if (body.success && body.data) {
        onUpdate({
          students: body.data.students || [],
          sessions: body.data.sessions || [],
          rooms: body.data.rooms || []
        });
      }
    } catch (err) {
      console.warn("Database sync polling failed (offline fallback active):", err);
    } finally {
      if (!isStopped) {
        timerId = setTimeout(performFetch, intervalMs);
      }
    }
  };

  // Run immediately
  performFetch();

  return () => {
    isStopped = true;
    if (timerId) clearTimeout(timerId);
  };
};
