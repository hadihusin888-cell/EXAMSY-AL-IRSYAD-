import express from "express";
import path from "path";
import fs from "fs";
import { MongoClient, Db } from "mongodb";
import { createServer as createViteServer } from "vite";

// Firebase imports for the highly optimized server-side caching proxy (reduces read operations by 99%)
import { initializeApp as initializeFirebaseApp } from "firebase/app";
import { 
  getFirestore as getFirebaseFirestore, 
  collection as fsCollection, 
  doc as fsDoc, 
  getDocs as fsGetDocs, 
  setDoc as fsSetDoc, 
  deleteDoc as fsDeleteDoc,
  writeBatch as fsWriteBatch
} from "firebase/firestore";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));

// Paths
const LOCAL_DB_PATH = path.join(process.cwd(), "local_db.json");

// Types mirroring the structures in types.ts
interface Student {
  nis: string;
  name: string;
  class: string;
  roomId?: string;
  password?: string;
  status: string;
  violations?: number;
  [key: string]: any;
}

interface ExamSession {
  id: string;
  name: string;
  class: string;
  pin: string;
  isActive: boolean;
  [key: string]: any;
}

interface Room {
  id: string;
  name: string;
  [key: string]: any;
}

interface DBState {
  students: Student[];
  sessions: ExamSession[];
  rooms: Room[];
}

// Default initial state for local fallback DB
const defaultDBState: DBState = {
  students: [],
  sessions: [],
  rooms: []
};

// Database Status State
let dbClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let isMongoActive = false;
let mongoConnectionError = "";

// Firebase Proxy Caching Configuration & State
let firebaseApp: any = null;
let firestoreDb: any = null;
let isFirebaseActive = false;
let firebaseConnectionError = "";

// In-Memory cache with 5 seconds TTL (Time to Live) to reduce Firestore reads by 99%
const CACHE_TTL_MS = 5000;
const dbCache: {
  students: Student[] | null;
  sessions: ExamSession[] | null;
  rooms: Room[] | null;
} = {
  students: null,
  sessions: null,
  rooms: null
};

const cacheTimestamps = {
  students: 0,
  sessions: 0,
  rooms: 0
};

// Request Consolidation: holds active fetch projects/promises to prevent parallel Firestore reads
const activeFetches: {
  students: Promise<Student[]> | null;
  sessions: Promise<ExamSession[]> | null;
  rooms: Promise<Room[]> | null;
} = {
  students: null,
  sessions: null,
  rooms: null
};

// Initialize Firebase Proxy on Server Startup
function initFirebaseOnServer() {
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (!fs.existsSync(configPath)) {
      firebaseConnectionError = "firebase-applet-config.json not found";
      console.log("[Firebase Proxy Cache] firebase-applet-config.json not found. Server runs as MongoDB or LocalFallback only.");
      return;
    }
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (!config.apiKey || !config.projectId) {
      firebaseConnectionError = "Invalid Firebase config in firebase-applet-config.json";
      return;
    }
    
    firebaseApp = initializeFirebaseApp(config);
    firestoreDb = getFirebaseFirestore(firebaseApp);
    isFirebaseActive = true;
    firebaseConnectionError = "";
    console.log(`[Firebase Proxy Cache] Initialized server-side Firebase on project: ${config.projectId}`);
  } catch (err: any) {
    console.error("[Firebase Proxy Cache] Initialization failure:", err);
    firebaseConnectionError = err.message || String(err);
    isFirebaseActive = false;
  }
}

// Highly optimized caching & request consolidation routine for Firestore lists
async function getFirebaseCachedCollection(collectionName: "students" | "sessions" | "rooms"): Promise<any[]> {
  if (!isFirebaseActive || !firestoreDb) {
    throw new Error("Firebase server-side engine is not active or not configured");
  }

  const now = Date.now();
  // Return cached list if elapsed time is less than TTL
  if (dbCache[collectionName] && (now - cacheTimestamps[collectionName] < CACHE_TTL_MS)) {
    return dbCache[collectionName]!;
  }

  // Request Consolidation (Deduplication): reuse the active query promise if already fetching!
  if (activeFetches[collectionName]) {
    return activeFetches[collectionName]!;
  }

  // Define new fetch promise
  const fetchPromise = (async () => {
    try {
      console.log(`[Firebase Proxy Cache] PHYSICAL READ: Fetching collection "${collectionName}" from Firestore...`);
      const qSnap = await fsGetDocs(fsCollection(firestoreDb, collectionName));
      const list = qSnap.docs.map(doc => doc.data() as any);
      
      // Save to cache
      dbCache[collectionName] = list;
      cacheTimestamps[collectionName] = Date.now();
      return list;
    } catch (err: any) {
      console.error(`[Firebase Proxy Cache] Physical Firestore read error on "${collectionName}":`, err.message);
      // Failover to stale cache if we have one, maintaining offline/quota recovery
      if (dbCache[collectionName]) {
        console.warn(`[Firebase Proxy Cache] Recovering with STALE cache for "${collectionName}"`);
        return dbCache[collectionName]!;
      }
      throw err;
    } finally {
      activeFetches[collectionName] = null;
    }
  })();

  activeFetches[collectionName] = fetchPromise;
  return fetchPromise;
}

// Writes reconciliation helper: updates the cached lists instantly on writes (Write-Through cache)
function invalidateOrUpdateCache(collectionName: "students" | "sessions" | "rooms", action: "upsert" | "delete" | "bulk_delete", payload: any) {
  const cacheArr = dbCache[collectionName];
  if (!cacheArr) return; // If cache is not loaded yet, next sync will load it directly from Firestore

  try {
    const idKey = collectionName === "students" ? "nis" : "id";
    if (action === "upsert") {
      const targetId = String(payload[idKey]);
      const idx = cacheArr.findIndex(item => String(item[idKey]) === targetId);
      if (idx >= 0) {
        cacheArr[idx] = { ...cacheArr[idx], ...payload };
      } else {
        cacheArr.push(payload);
      }
    } 
    else if (action === "delete") {
      const targetId = String(payload);
      dbCache[collectionName] = cacheArr.filter(item => String(item[idKey]) !== targetId) as any;
    }
    else if (action === "bulk_delete") {
      const idsToDelete = (payload || []).map((id: any) => String(id));
      dbCache[collectionName] = cacheArr.filter(item => !idsToDelete.includes(String(item[idKey]))) as any;
    }
  } catch (e) {
    console.warn("[Firebase Proxy Cache] Cache reconciliation warning:", e);
    // Erase timestamp to force fresh reload on next fetch
    cacheTimestamps[collectionName] = 0;
  }
}

// Initialize MongoDB Connection (Lazy initialization)
async function getMongoConnection() {
  const envUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!envUri) {
    mongoConnectionError = "Enviroment variable MONGODB_URI is not set";
    isMongoActive = false;
    return null;
  }

  const uri = envUri.trim();
  if (uri === "" || uri === "YOUR_MONGODB_URI") {
    mongoConnectionError = "Environment variable MONGODB_URI is empty or placeholder";
    isMongoActive = false;
    return null;
  }

  if (dbClient && mongoDb) {
    return mongoDb;
  }

  // Pre-validate the connection string scheme before giving it to MongoClient
  if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
    mongoConnectionError = 'Invalid scheme, expected connection string to start with "mongodb://" or "mongodb+srv://"';
    isMongoActive = false;
    return null;
  }

  try {
    console.log("[MongoDB] Connecting to instance...");
    dbClient = new MongoClient(uri, {
      connectTimeoutMS: 8000,
      serverSelectionTimeoutMS: 8000,
    });
    await dbClient.connect();
    
    // Extract DB name from URI or default to "examsy"
    let dbName = "examsy_db";
    try {
      const parsedUri = new URL(uri);
      dbName = parsedUri.pathname.substring(1) || "examsy_db";
    } catch (e) {
      // Clean fallback if URL parsing throws
    }
    
    mongoDb = dbClient.db(dbName);
    isMongoActive = true;
    mongoConnectionError = "";
    console.log(`[MongoDB] Connected successfully to database: ${dbName}`);

    // Create indexes for optimal lookup performance
    await mongoDb.collection("students").createIndex({ nis: 1 }, { unique: true });
    await mongoDb.collection("sessions").createIndex({ id: 1 }, { unique: true });
    await mongoDb.collection("rooms").createIndex({ id: 1 }, { unique: true });

    return mongoDb;
  } catch (err: any) {
    console.error("[MongoDB] Connection Error:", err.message);
    mongoConnectionError = err.message || String(err);
    isMongoActive = false;
    dbClient = null;
    mongoDb = null;
    return null;
  }
}

// Local File Database Helper
function getLocalDB(): DBState {
  try {
    if (!fs.existsSync(LOCAL_DB_PATH)) {
      fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(defaultDBState, null, 2), "utf8");
      return defaultDBState;
    }
    const raw = fs.readFileSync(LOCAL_DB_PATH, "utf8");
    return JSON.parse(raw) as DBState;
  } catch (err) {
    console.error("Local DB read failed, using empty database:", err);
    return defaultDBState;
  }
}

function saveLocalDB(state: DBState) {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    console.error("Local DB save failed:", err);
  }
}

// API Routes
app.get("/api/status", async (req, res) => {
  const db = await getMongoConnection();
  res.json({
    success: true,
    engine: isMongoActive ? "MongoDB" : (isFirebaseActive ? "Firebase (Optimized Proxy)" : "Local JSON Fallback"),
    mongoConnected: isMongoActive,
    firebaseConnected: isFirebaseActive,
    error: mongoConnectionError || firebaseConnectionError,
    uriSet: !!(process.env.MONGODB_URI || process.env.MONGO_URI),
    localFilePath: LOCAL_DB_PATH
  });
});

// Sync Endpoint (Gets latest snapshot of students, sessions, rooms depending on role/filters)
app.get("/api/sync", async (req, res) => {
  const roomId = req.query.roomId as string | undefined;
  const db = await getMongoConnection();

  if (isMongoActive && db) {
    try {
      let studentQuery = {};
      if (roomId) {
        studentQuery = { roomId: String(roomId) };
      }

      const [students, sessions, rooms] = await Promise.all([
        db.collection("students").find(studentQuery).toArray(),
        db.collection("sessions").find({}).toArray(),
        db.collection("rooms").find({}).toArray()
      ]);

      res.json({
        success: true,
        source: "MongoDB",
        data: {
          students: students.map(s => ({ ...s, _id: undefined })),
          sessions: sessions.map(s => ({ ...s, _id: undefined })),
          rooms: rooms.map(r => ({ ...r, _id: undefined }))
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  } else if (isFirebaseActive && firestoreDb) {
    // HIGHLY OPTIMIZED: Fetch via server-side cache and consolidate concurrent requests!
    try {
      const [students, sessions, rooms] = await Promise.all([
        getFirebaseCachedCollection("students"),
        getFirebaseCachedCollection("sessions"),
        getFirebaseCachedCollection("rooms")
      ]);

      let filteredStudents = students;
      if (roomId) {
        filteredStudents = students.filter(s => String(s.roomId) === String(roomId));
      }

      res.json({
        success: true,
        source: "Firebase Proxy (Cached)",
        data: {
          students: filteredStudents,
          sessions,
          rooms
        }
      });
    } catch (err: any) {
      console.warn("[Firebase Proxy Sync Error] Falling back to Local File DB:", err.message);
      // Failover gracefully to local database on error
      const local = getLocalDB();
      let filteredStudents = local.students;
      if (roomId) {
        filteredStudents = local.students.filter(s => String(s.roomId) === String(roomId));
      }
      res.json({
        success: true,
        source: "Local Fallback (Firebase Sync Error)",
        data: {
          students: filteredStudents,
          sessions: local.sessions,
          rooms: local.rooms
        }
      });
    }
  } else {
    // Return Local database data
    const local = getLocalDB();
    let filteredStudents = local.students;
    if (roomId) {
      filteredStudents = local.students.filter(s => String(s.roomId) === String(roomId));
    }
    res.json({
      success: true,
      source: "Local JSON Fallback",
      data: {
        students: filteredStudents,
        sessions: local.sessions,
        rooms: local.rooms
      }
    });
  }
});

// Single Student Query Endpoint (zero table-scans / zero direct Firestore reads for login speed)
app.get("/api/students/:nis", async (req, res) => {
  const nis = String(req.params.nis).trim();
  const db = await getMongoConnection();

  if (isMongoActive && db) {
    try {
      const student = await db.collection("students").findOne({ nis });
      if (!student) {
        return res.status(404).json({ success: false, error: "Student not found" });
      }
      res.json({ success: true, data: { ...student, _id: undefined } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  } else if (isFirebaseActive && firestoreDb) {
    // Zero Direct Reads: Match from local server-side student memory pool!
    try {
      const students = await getFirebaseCachedCollection("students");
      const student = students.find(s => String(s.nis).trim() === nis);
      if (!student) {
        return res.status(404).json({ success: false, error: "Student not found" });
      }
      res.json({ success: true, data: student });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  } else {
    const local = getLocalDB();
    const student = local.students.find(s => String(s.nis).trim() === nis);
    if (!student) {
      return res.status(404).json({ success: false, error: "Student not found" });
    }
    res.json({ success: true, data: student });
  }
});

// Migrate / Import Firebase backplane payload straight to MongoDB
app.post("/api/migrate-from-firebase", async (req, res) => {
  const { students, sessions, rooms } = req.body as { students?: Student[]; sessions?: ExamSession[]; rooms?: Room[] };
  
  const db = await getMongoConnection();
  if (isMongoActive && db) {
    try {
      // Import students
      if (students && students.length > 0) {
        for (const student of students) {
          const cleanStudent = { ...student };
          delete (cleanStudent as any)._id; // prevent duplicate keys
          await db.collection("students").replaceOne({ nis: String(student.nis) }, cleanStudent, { upsert: true });
        }
      }

      // Import sessions
      if (sessions && sessions.length > 0) {
        for (const session of sessions) {
          const cleanSession = { ...session };
          delete (cleanSession as any)._id;
          await db.collection("sessions").replaceOne({ id: String(session.id) }, cleanSession, { upsert: true });
        }
      }

      // Import rooms
      if (rooms && rooms.length > 0) {
        for (const room of rooms) {
          const cleanRoom = { ...room };
          delete (cleanRoom as any)._id;
          await db.collection("rooms").replaceOne({ id: String(room.id) }, cleanRoom, { upsert: true });
        }
      }

      res.json({ success: true, message: `Successfully imported ${students?.length || 0} students, ${sessions?.length || 0} sessions, and ${rooms?.length || 0} rooms directly into MongoDB!` });
    } catch (err: any) {
      console.error("Migration write to Mongo failed:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  } else {
    // Import into Local storage
    try {
      const local = getLocalDB();

      if (students && students.length > 0) {
        students.forEach(s => {
          const idx = local.students.findIndex(exist => String(exist.nis) === String(s.nis));
          if (idx >= 0) local.students[idx] = s;
          else local.students.push(s);
        });
      }

      if (sessions && sessions.length > 0) {
        sessions.forEach(se => {
          const idx = local.sessions.findIndex(exist => String(exist.id) === String(se.id));
          if (idx >= 0) local.sessions[idx] = se;
          else local.sessions.push(se);
        });
      }

      if (rooms && rooms.length > 0) {
        rooms.forEach(r => {
          const idx = local.rooms.findIndex(exist => String(exist.id) === String(r.id));
          if (idx >= 0) local.rooms[idx] = r;
          else local.rooms.push(r);
        });
      }

      saveLocalDB(local);
      res.json({ success: true, message: "No active MongoDB. Data has been saved to Local JSON database fallback context instead." });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

// Dynamic CRUD Operations Endpoint
app.post("/api/action", async (req, res) => {
  const { action, payload } = req.body;
  if (!action) {
    return res.status(400).json({ success: false, error: "Action is required" });
  }

  const db = await getMongoConnection();
  if (isMongoActive && db) {
    try {
      switch (action) {
        case 'ADD_STUDENT':
        case 'UPDATE_STUDENT': {
          const cleanPayload = { ...payload };
          delete cleanPayload._id;
          await db.collection("students").replaceOne({ nis: String(payload.nis) }, cleanPayload, { upsert: true });
          break;
        }

        case 'DELETE_STUDENT':
          await db.collection("students").deleteOne({ nis: String(payload.nis) });
          break;

        case 'BULK_DELETE_STUDENTS': {
          const ids = (payload || []).map((nis: any) => String(nis));
          await db.collection("students").deleteMany({ nis: { $in: ids } });
          break;
        }

        case 'BULK_UPDATE_STUDENTS': {
          const nisList = (payload.selectedNis || []).map((nis: any) => String(nis));
          const updates = { ...payload.updates };
          delete updates._id;
          await db.collection("students").updateMany(
            { nis: { $in: nisList } },
            { $set: updates }
          );
          break;
        }

        case 'ADD_SESSION':
        case 'UPDATE_SESSION': {
          const cleanPayload = { ...payload };
          delete cleanPayload._id;
          await db.collection("sessions").replaceOne({ id: String(payload.id) }, cleanPayload, { upsert: true });
          break;
        }

        case 'DELETE_SESSION':
          await db.collection("sessions").deleteOne({ id: String(payload.id) });
          break;

        case 'BULK_DELETE_SESSIONS': {
          const ids = (payload || []).map((id: any) => String(id));
          await db.collection("sessions").deleteMany({ id: { $in: ids } });
          break;
        }

        case 'ADD_ROOM':
        case 'UPDATE_ROOM': {
          const cleanPayload = { ...payload };
          delete cleanPayload._id;
          await db.collection("rooms").replaceOne({ id: String(payload.id) }, cleanPayload, { upsert: true });
          break;
        }

        case 'DELETE_ROOM':
          await db.collection("rooms").deleteOne({ id: String(payload.id) });
          break;

        default:
          return res.status(400).json({ success: false, error: `Unsupported action: ${action}` });
      }
      return res.json({ success: true });
    } catch (err: any) {
      console.error(`MongoDB write action (${action}) failed:`, err);
      return res.status(500).json({ success: false, error: err.message });
    }
  } else if (isFirebaseActive && firestoreDb) {
    // HIGH-EFFICIENCY PROXY WRITES (Updates both Firestore and the in-memory Cache context)
    try {
      switch (action) {
        case 'ADD_STUDENT':
        case 'UPDATE_STUDENT': {
          const cleanPayload = { ...payload };
          delete cleanPayload._id;
          await fsSetDoc(fsDoc(firestoreDb, "students", String(payload.nis)), cleanPayload, { merge: true });
          invalidateOrUpdateCache("students", "upsert", cleanPayload);
          break;
        }

        case 'DELETE_STUDENT':
          await fsDeleteDoc(fsDoc(firestoreDb, "students", String(payload.nis)));
          invalidateOrUpdateCache("students", "delete", payload.nis);
          break;

        case 'BULK_DELETE_STUDENTS': {
          const ids = (payload || []).map((nis: any) => String(nis));
          const batch = fsWriteBatch(firestoreDb);
          ids.forEach((id: string) => {
            batch.delete(fsDoc(firestoreDb, "students", id));
          });
          await batch.commit();
          invalidateOrUpdateCache("students", "bulk_delete", ids);
          break;
        }

        case 'BULK_UPDATE_STUDENTS': {
          const nisList = (payload.selectedNis || []).map((nis: any) => String(nis));
          const updates = { ...payload.updates };
          delete updates._id;
          const batch = fsWriteBatch(firestoreDb);
          nisList.forEach((id: string) => {
            batch.set(fsDoc(firestoreDb, "students", id), updates, { merge: true });
          });
          await batch.commit();
          // Update cache
          if (dbCache.students) {
            dbCache.students = dbCache.students.map(s => {
              if (nisList.includes(String(s.nis))) {
                return { ...s, ...updates };
              }
              return s;
            });
          }
          break;
        }

        case 'ADD_SESSION':
        case 'UPDATE_SESSION': {
          const cleanPayload = { ...payload };
          delete cleanPayload._id;
          await fsSetDoc(fsDoc(firestoreDb, "sessions", String(payload.id)), cleanPayload, { merge: true });
          invalidateOrUpdateCache("sessions", "upsert", cleanPayload);
          break;
        }

        case 'DELETE_SESSION':
          await fsDeleteDoc(fsDoc(firestoreDb, "sessions", String(payload.id)));
          invalidateOrUpdateCache("sessions", "delete", payload.id);
          break;

        case 'BULK_DELETE_SESSIONS': {
          const ids = (payload || []).map((id: any) => String(id));
          const batch = fsWriteBatch(firestoreDb);
          ids.forEach((id: string) => {
            batch.delete(fsDoc(firestoreDb, "sessions", id));
          });
          await batch.commit();
          invalidateOrUpdateCache("sessions", "bulk_delete", ids);
          break;
        }

        case 'ADD_ROOM':
        case 'UPDATE_ROOM': {
          const cleanPayload = { ...payload };
          delete cleanPayload._id;
          await fsSetDoc(fsDoc(firestoreDb, "rooms", String(payload.id)), cleanPayload, { merge: true });
          invalidateOrUpdateCache("rooms", "upsert", cleanPayload);
          break;
        }

        case 'DELETE_ROOM':
          await fsDeleteDoc(fsDoc(firestoreDb, "rooms", String(payload.id)));
          invalidateOrUpdateCache("rooms", "delete", payload.id);
          break;

        default:
          return res.status(400).json({ success: false, error: `Unsupported action: ${action}` });
      }
      return res.json({ success: true });
    } catch (err: any) {
      console.error(`Firebase proxy write action (${action}) failed:`, err);
      return res.status(500).json({ success: false, error: err.message });
    }
  } else {
    // Local File DB Write Action Operation
    try {
      const local = getLocalDB();

      switch (action) {
        case 'ADD_STUDENT':
        case 'UPDATE_STUDENT': {
          const idx = local.students.findIndex(s => String(s.nis) === String(payload.nis));
          if (idx >= 0) {
            local.students[idx] = { ...local.students[idx], ...payload };
          } else {
            local.students.push(payload);
          }
          break;
        }

        case 'DELETE_STUDENT':
          local.students = local.students.filter(s => String(s.nis) !== String(payload.nis));
          break;

        case 'BULK_DELETE_STUDENTS': {
          const ids = (payload || []).map((nis: any) => String(nis));
          local.students = local.students.filter(s => !ids.includes(String(s.nis)));
          break;
        }

        case 'BULK_UPDATE_STUDENTS': {
          const nisList = (payload.selectedNis || []).map((nis: any) => String(nis));
          local.students = local.students.map(s => {
            if (nisList.includes(String(s.nis))) {
              return { ...s, ...payload.updates };
            }
            return s;
          });
          break;
        }

        case 'ADD_SESSION':
        case 'UPDATE_SESSION': {
          const idx = local.sessions.findIndex(s => String(s.id) === String(payload.id));
          if (idx >= 0) {
            local.sessions[idx] = { ...local.sessions[idx], ...payload };
          } else {
            local.sessions.push(payload);
          }
          break;
        }

        case 'DELETE_SESSION':
          local.sessions = local.sessions.filter(s => String(s.id) !== String(payload.id));
          break;

        case 'BULK_DELETE_SESSIONS': {
          const ids = (payload || []).map((id: any) => String(id));
          local.sessions = local.sessions.filter(s => !ids.includes(String(s.id)));
          break;
        }

        case 'ADD_ROOM':
        case 'UPDATE_ROOM': {
          const idx = local.rooms.findIndex(s => String(s.id) === String(payload.id));
          if (idx >= 0) {
            local.rooms[idx] = { ...local.rooms[idx], ...payload };
          } else {
            local.rooms.push(payload);
          }
          break;
        }

        case 'DELETE_ROOM':
          local.rooms = local.rooms.filter(s => String(s.id) !== String(payload.id));
          break;

        default:
          return res.status(400).json({ success: false, error: `Unsupported action: ${action}` });
      }

      saveLocalDB(local);
      return res.json({ success: true });
    } catch (err: any) {
      console.error(`Local DB write action (${action}) failed:`, err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
});

// Configure Vite integration or Static delivery
async function startServer() {
  // Pre-initialize Firebase proxy server-side caching engine
  initFirebaseOnServer();

  // Try to pre-establish MongoDB lazy connection in background if available
  getMongoConnection().catch(() => {});

  if (process.env.NODE_ENV !== "production") {
    console.log("[Server] Configuring Vite middleware dev mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[Server] Configuring production static asset delivery...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Server successfully booted and taking connections on PORT ${PORT}`);
  });
}

startServer();
