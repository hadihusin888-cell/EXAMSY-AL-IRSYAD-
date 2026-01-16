
import React from 'react';
import { ExamSubmission, ExamSession } from '../types';

interface ExamSummaryProps {
  submission: ExamSubmission;
  session: ExamSession;
  onBack: () => void;
}

const ExamSummary: React.FC<ExamSummaryProps> = ({ submission, session, onBack }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-50">
      <div className="w-full max-w-xl bg-white p-12 rounded-3xl shadow-xl border border-slate-100 text-center">
        <div className="w-24 h-24 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-4xl font-extrabold text-slate-900 mb-2">Ujian Selesai!</h1>
        <p className="text-slate-500 mb-10 text-lg">Terima kasih telah mengerjakan {session.name}. Jawaban Anda telah berhasil direkam ke sistem.</p>

        <div className="grid grid-cols-2 gap-6 mb-12">
          <div className="bg-slate-50 p-6 rounded-3xl">
            <p className="text-xs text-slate-400 font-bold uppercase mb-1">Skor Akhir</p>
            <p className="text-4xl font-bold text-indigo-600">{Math.round(submission.score)}</p>
          </div>
          <div className="bg-slate-50 p-6 rounded-3xl">
            <p className="text-xs text-slate-400 font-bold uppercase mb-1">Status</p>
            <p className={`text-4xl font-bold ${submission.score >= 75 ? 'text-emerald-500' : 'text-amber-500'}`}>
              {submission.score >= 75 ? 'LULUS' : 'REMED'}
            </p>
          </div>
        </div>

        <button
          onClick={onBack}
          className="w-full bg-slate-900 hover:bg-black text-white font-bold py-5 rounded-2xl shadow-xl transition-all active:scale-[0.98]"
        >
          Kembali ke Beranda
        </button>
        
        <p className="mt-8 text-slate-400 text-sm italic">
          Data ini telah disinkronkan dengan Database Google Apps Script Sekolah.
        </p>
      </div>
    </div>
  );
};

export default ExamSummary;
