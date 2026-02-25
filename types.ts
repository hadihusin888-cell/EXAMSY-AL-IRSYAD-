
export enum UserRole {
  STUDENT = 'STUDENT',
  ADMIN = 'ADMIN',
  PROCTOR = 'PROCTOR'
}

export enum StudentStatus {
  BELUM_MASUK = 'BELUM_MASUK',
  SEDANG_UJIAN = 'SEDANG_UJIAN',
  SELESAI = 'SELESAI',
  BLOKIR = 'BLOKIR'
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
}

export interface ExamSession {
  id: string;
  name: string;
  class: string;
  pin: string;
  durationMinutes: number;
  isActive: boolean;
  questions: Question[];
  pdfUrl?: string; // Link ke file PDF soal
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
  username?: string; // Username untuk login Proktor
  password?: string; // Password untuk login Proktor
}

export interface Student {
  nis: string;
  name: string;
  class: string;
  password?: string;
  status: StudentStatus;
  roomId?: string; // ID Ruang tempat siswa ujian
  violations?: number; // Jumlah pelanggaran yang dilakukan
}

export interface ExamSubmission {
  studentNis: string;
  sessionId: string;
  answers: Record<string, number>;
  score: number;
  submittedAt: string;
}

export type ViewState = 'STUDENT_LOGIN' | 'ADMIN_LOGIN' | 'STUDENT_DASHBOARD' | 'ADMIN_DASHBOARD' | 'PROCTOR_DASHBOARD' | 'EXAM_ROOM' | 'EXAM_SUMMARY';
