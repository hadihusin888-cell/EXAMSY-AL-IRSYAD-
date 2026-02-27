
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Student, ExamSession, StudentStatus } from '../types';

interface ExamRoomProps {
  student: Student;
  students: Student[]; 
  session: ExamSession;
  onAction: (action: string, payload: any) => Promise<boolean>;
  onFinish: () => void;
}

const ExamRoom: React.FC<ExamRoomProps> = ({ student, students, session, onAction, onFinish }) => {
  const [timeLeft, setTimeLeft] = useState(session.durationMinutes * 60);
  const [hasConsented, setHasConsented] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [violations, setViolations] = useState(0);
  const [isFocusLost, setIsFocusLost] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0); 
  const [zoomLevel, setZoomLevel] = useState(1);
  
  const [isZoomVisible, setIsZoomVisible] = useState(true);
  const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);

  const wakeLockRef = useRef<any>(null);
  const videoWakeLockRef = useRef<HTMLVideoElement>(null);
  const lastViolationTime = useRef(0);

  const MAX_VIOLATIONS = 3;
  const CLIPPING_TOP = 120;      
  const CLIPPING_BOTTOM = 5000;   
  const CLIPPING_SIDE = 60;      

  const currentStudentData = students.find(s => String(s.nis) === String(student.nis));
  const isBlocked = currentStudentData?.status === StudentStatus.BLOKIR;

  const resetZoomTimer = useCallback(() => {
    setIsZoomVisible(true);
    if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
    zoomTimerRef.current = setTimeout(() => {
      setIsZoomVisible(false);
    }, 3000);
  }, []);

  useEffect(() => {
    if (hasConsented) resetZoomTimer();
    return () => { if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current); };
  }, [hasConsented, resetZoomTimer]);

  const checkMobileLandscape = useCallback(() => {
    const isLandscape = window.innerWidth > window.innerHeight;
    const isMobileHeight = window.innerHeight <= 500;
    setIsMobileLandscape(isLandscape && isMobileHeight);
  }, []);

  useEffect(() => {
    checkMobileLandscape();
    window.addEventListener('resize', checkMobileLandscape);
    window.addEventListener('orientationchange', checkMobileLandscape);
    return () => {
      window.removeEventListener('resize', checkMobileLandscape);
      window.removeEventListener('orientationchange', checkMobileLandscape);
    };
  }, [checkMobileLandscape]);

  const sanitizePdfUrl = (url: string) => {
    if (!url) return '';
    let sanitized = url;
    if (url.includes('drive.google.com')) {
      sanitized = url.replace(/\/view(\?.*)?$/, '/preview');
      if (!sanitized.includes('/preview')) {
        sanitized = sanitized.replace(/\/edit(\?.*)?$/, '/preview');
      }
      const separator = sanitized.includes('?') ? '&' : '?';
      sanitized = `${sanitized}${separator}rm=minimal`;
    }
    return sanitized;
  };

  const handleZoom = (delta: number) => {
    setZoomLevel(prev => Math.min(Math.max(prev + delta, 0.5), 3.0));
    resetZoomTimer();
  };

  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
      if (videoWakeLockRef.current) {
        videoWakeLockRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.warn("Wake Lock Error:", err);
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
    if (videoWakeLockRef.current) {
      videoWakeLockRef.current.pause();
      videoWakeLockRef.current.src = "";
      videoWakeLockRef.current.load();
    }
  }, []);

  const handleFinalFinish = () => {
    releaseWakeLock();
    if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onFinish();
  };

  const triggerViolation = useCallback((reason: string) => {
    if (isBlocked) return;
    const now = Date.now();
    // Berikan toleransi 3 detik untuk gangguan sistem (seperti notifikasi atau overlay Family Link)
    if (now - lastViolationTime.current < 3000) return; 
    lastViolationTime.current = now;
    setIsFocusLost(true);
    
    const newViolationCount = violations + 1;
    setViolations(newViolationCount);

    // Sync ke database
    onAction('UPDATE_STUDENT', {
      ...student,
      violations: newViolationCount
    });
  }, [isBlocked, violations, student, onAction]);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && (e.key === 'p' || e.key === 's' || e.key === 'u')) || e.key === 'F12') {
        e.preventDefault();
        triggerViolation("Unauthorized Shortcut");
      }
    };
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [triggerViolation]);

  useEffect(() => {
    const handleFsChange = () => {
      const isFs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(isFs);
      
      // Jika sudah mulai ujian (hasConsented) dan keluar dari fullscreen, anggap pelanggaran
      if (hasConsented && !isFs && !isBlocked) {
        triggerViolation("Keluar Mode Fullscreen");
      }
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    
    const timer = setInterval(() => {
      if (hasConsented && timeLeft > 0 && !isBlocked) setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      clearInterval(timer);
      releaseWakeLock();
    };
  }, [hasConsented, timeLeft, releaseWakeLock, isBlocked, triggerViolation]);

  useEffect(() => {
    if (!hasConsented || isBlocked) return;
    const handleVisibilityChange = () => { if (document.hidden) triggerViolation("App Switched"); };
    const handleBlur = () => {
      // Pengetatan deteksi: Kurangi delay untuk respon lebih cepat terhadap panel sistem
      setTimeout(() => {
        if (!document.hasFocus()) triggerViolation("Window Blur / Quick Settings");
      }, 200);
    };
    
    // Deteksi swipe dari area atas layar (Status Bar / Quick Settings)
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches[0].clientY < 25) {
        // Jika sentuhan dimulai di 25px teratas, kemungkinan besar akan menarik panel
        // Kita tidak bisa menghentikan OS, tapi bisa memberikan feedback visual/peringatan
        resetZoomTimer();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('touchstart', handleTouchStart);
    };
  }, [hasConsented, triggerViolation, isBlocked]);

  const startPersistence = async () => {
    try {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if ((elem as any).webkitRequestFullscreen) {
        await (elem as any).webkitRequestFullscreen();
      }
      await requestWakeLock();
      setHasConsented(true);
    } catch (err) {
      setHasConsented(true); // Tetap lanjut meskipun fullscreen gagal (khusus iPhone)
    }
  };

  useEffect(() => {
    if (violations >= MAX_VIOLATIONS) handleFinalFinish();
  }, [violations]);

  const isIPhone = /iPhone/i.test(navigator.userAgent);

  return (
    <div 
      className="flex flex-col h-[100dvh] w-screen overflow-hidden select-none bg-slate-950 font-sans relative"
      onClick={resetZoomTimer}
      onTouchStart={resetZoomTimer}
    >
      {/* ANTI PULL-DOWN ZONE (Android Security) */}
      <div className="fixed top-0 left-0 right-0 h-2 z-[9999] touch-none pointer-events-none bg-transparent"></div>

      <video 
        ref={videoWakeLockRef} 
        className="hidden" 
        muted playsInline loop 
        src="data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAG1wNDJpc29tYXZjMQAAAZptb292AAAAbG12aGQAAAAA3u7XdN7u13QAAAPoAAAAKAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAGWlvZHMAAAAAEAAfQEAAAP8fAgACAAAAAAAFdHJhawAAAFx0a2hkAAAAAd7u13Te7u13AAAABQAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAp1ZHRhAAAAImNoYXAAAAAaAAAAAEIARQBJAE4ARwAgAFMARQBYAFkAAAAAeW1kYXQAAAAI"
      />

      {/* MODAL DIBLOKIR */}
      {isBlocked && (
        <div className="fixed inset-0 z-[10000] bg-slate-950/90 flex items-center justify-center p-6 backdrop-blur-xl">
          <div className="bg-white w-full max-w-[360px] p-8 md:p-10 rounded-[2.5rem] text-center shadow-2xl border-t-8 border-red-600 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m0-8V7m0 0a2 2 0 100-4 2 2 0 000 4zm-8.228 11h16.456c.959 0 1.56-1.04 1.08-1.861L13.08 4.14a1.25 1.25 0 00-2.16 0L2.692 16.14c-.48.821.121 1.861 1.08 1.861z" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-3 uppercase tracking-tighter">Akses Diblokir</h2>
            <p className="text-slate-600 text-sm font-bold uppercase mb-10 leading-relaxed">Ujian dihentikan secara sepihak oleh Proktor Ruang. Silakan hubungi petugas.</p>
            <button onClick={handleFinalFinish} className="w-full bg-red-600 hover:bg-red-700 text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-red-100 transition-all active:scale-95">KONFIRMASI & KELUAR</button>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI MULAI */}
      {!hasConsented && !isBlocked && (
        <div className="fixed inset-0 z-[1000] bg-slate-950/90 flex items-center justify-center p-6 backdrop-blur-md">
          <div className="bg-white w-full max-w-[400px] p-10 rounded-[2.5rem] text-center shadow-2xl border-t-8 border-indigo-600 animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-4 uppercase tracking-tight leading-none">Konfirmasi Ujian</h2>
            <p className="text-slate-600 text-sm font-medium leading-relaxed mb-10">
              Sistem akan mengaktifkan <span className="text-indigo-600 font-bold">Mode Proteksi Layar</span>. Dilarang keras <span className="text-red-600 font-bold">menurunkan panel notifikasi/pengaturan</span> atau berpindah aplikasi selama ujian berlangsung.
            </p>
            <button onClick={startPersistence} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-5 rounded-2xl font-black text-sm md:text-base uppercase tracking-[0.15em] shadow-xl shadow-indigo-100 transition-all active:scale-95">
              Mulai Ujian Sekarang
            </button>
          </div>
        </div>
      )}

      <header className={`shrink-0 z-50 border-b border-white/5 bg-black/80 backdrop-blur-2xl flex items-center px-4 md:px-10 transition-all duration-300 ${isMobileLandscape ? 'h-8 px-3' : 'h-14 md:h-16'}`}>
        <div className="flex-1 overflow-hidden">
          <h2 className={`text-white font-black uppercase truncate ${isMobileLandscape ? 'text-[8px]' : 'text-[10px] md:text-sm'}`}>{student.name}</h2>
          <span className={`text-indigo-400 font-bold uppercase tracking-widest ${isMobileLandscape ? 'text-[6px]' : 'text-[8px] md:text-[10px]'}`}>Kls {student.class} | {student.nis}</span>
        </div>
        <div className={`flex-1 text-center ${isMobileLandscape ? 'hidden' : 'hidden sm:block'}`}>
          <h1 className="text-white font-black uppercase tracking-tighter truncate text-xs md:text-lg">{session.name}</h1>
        </div>
        <div className={`flex-1 flex items-center justify-end transition-all ${isMobileLandscape ? 'gap-2' : 'gap-3 md:gap-4'}`}>
          <button 
            onClick={() => setIframeKey(prev => prev + 1)} 
            className={`text-indigo-400 hover:text-white transition-colors ${isMobileLandscape ? 'p-1' : 'p-2'}`}
            title="Reload Soal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`${isMobileLandscape ? 'h-3 w-3' : 'h-4 w-4 md:h-5 md:w-5'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <div className={`font-mono font-black ${isMobileLandscape ? 'text-xs' : 'text-sm md:text-lg'} ${timeLeft < 300 ? 'text-red-500 animate-pulse' : 'text-indigo-400'}`}>
            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
          </div>
          <button onClick={() => setShowConfirm(true)} className={`bg-emerald-500 text-white rounded-xl font-black uppercase tracking-widest shadow-lg active:scale-90 transition-all ${isMobileLandscape ? 'px-3 py-1 text-[7px]' : 'px-4 md:px-8 py-2 md:py-3 text-[9px] md:text-xs'}`}>Selesai</button>
        </div>
      </header>

      <main className={`flex-1 bg-slate-900 relative transition-all duration-300 overflow-hidden ${(isFocusLost || isBlocked || (hasConsented && !isFullscreen && !isIPhone)) ? 'blur-3xl pointer-events-none' : ''}`}>
        <div className="w-full h-full overflow-auto scrollbar-hide">
          <div className="w-full h-full relative transition-transform duration-300 ease-out origin-top" style={{ transform: `scale(${zoomLevel})` }}>
            <div className="relative w-full h-full overflow-hidden" style={{ marginTop: `-${CLIPPING_TOP}px`, marginLeft: `-${CLIPPING_SIDE}px`, width: `calc(100% + ${CLIPPING_SIDE * 2}px)`, height: `calc(100% + ${CLIPPING_TOP + CLIPPING_BOTTOM}px)` }}>
              {hasConsented && session.pdfUrl && (
                <iframe 
                  key={iframeKey} 
                  src={sanitizePdfUrl(session.pdfUrl)} 
                  className="w-full h-full border-none" 
                  title="Soal PDF" 
                />
              )}
            </div>
          </div>
        </div>

        <div className={`absolute transition-all duration-500 z-[200] items-center flex bg-black/40 backdrop-blur-xl border border-white/10 rounded-[1.5rem] shadow-2xl transition-opacity pointer-events-auto
          ${isZoomVisible ? 'opacity-40 hover:opacity-100' : 'opacity-[0.15] hover:opacity-100'}
          ${isMobileLandscape 
            ? 'top-1/2 right-2 bottom-auto translate-y-[-50%] flex-col scale-[0.65] p-1.5' 
            : 'bottom-6 right-4 flex-col md:bottom-10 md:left-1/2 md:right-auto md:translate-x-[-50%] md:flex-row md:scale-100 max-md:scale-[0.8] max-md:bottom-4 p-2'}`}>
           <button onClick={(e) => { e.stopPropagation(); handleZoom(0.1); }} className="w-10 h-10 md:w-11 md:h-11 flex items-center justify-center bg-white/5 hover:bg-indigo-600 text-white rounded-xl transition-all active:scale-90">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
           </button>
           <div className="px-1 min-w-[50px] md:min-w-[60px] text-center">
              <span className="text-[10px] md:text-xs font-black text-indigo-400 uppercase">{Math.round(zoomLevel * 100)}%</span>
           </div>
           <button onClick={(e) => { e.stopPropagation(); handleZoom(-0.1); }} className="w-10 h-10 md:w-11 md:h-11 flex items-center justify-center bg-white/5 hover:bg-indigo-600 text-white rounded-xl transition-all active:scale-90">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" /></svg>
           </button>
        </div>
      </main>

      {/* MODAL PELANGGARAN */}
      {isFocusLost && hasConsented && !isBlocked && (
        <div className="fixed inset-0 z-[5000] bg-slate-950/95 flex items-center justify-center p-8 backdrop-blur-xl">
          <div className="bg-white w-full max-w-[360px] p-10 rounded-[2.5rem] text-center shadow-2xl border-b-8 border-red-500 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.268 15c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight leading-none">Terdeteksi Pelanggaran</h3>
            <p className="text-slate-600 text-sm font-bold uppercase mb-6 leading-relaxed">
              Sistem mendeteksi aktivitas luar aplikasi atau keluar dari mode fullscreen.
            </p>
            <div className="bg-slate-50 p-4 rounded-2xl mb-8">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Sisa Kesempatan</p>
              <p className="text-2xl font-black text-red-600">{MAX_VIOLATIONS - violations} / {MAX_VIOLATIONS}</p>
            </div>
            <button onClick={() => { setIsFocusLost(false); startPersistence(); }} className="w-full py-5 bg-slate-900 hover:bg-black text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all">
              Masuk Fullscreen & Lanjut
            </button>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI SELESAI */}
      {showConfirm && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-white w-full max-w-[340px] md:max-w-[440px] p-8 md:p-12 rounded-[2.5rem] shadow-2xl text-center border-t-8 border-emerald-500 animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl md:text-3xl font-black text-slate-900 mb-4 uppercase tracking-tight leading-none">Akhiri Sesi?</h3>
            <p className="text-slate-600 text-sm font-medium leading-relaxed mb-10">Pastikan seluruh jawaban Anda telah disalin dengan benar sebelum keluar.</p>
            <div className="flex flex-col gap-3">
              <button onClick={handleFinalFinish} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-5 rounded-2xl font-black text-sm md:text-base uppercase tracking-[0.15em] active:scale-95 transition-all shadow-lg shadow-emerald-100">Selesai & Keluar</button>
              <button onClick={() => setShowConfirm(false)} className="w-full text-slate-400 font-bold py-3 text-xs md:text-sm uppercase tracking-[0.1em] hover:text-slate-600 transition-colors">Kembali ke Soal</button>
            </div>
          </div>
        </div>
      )}

      <style>{`.scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
};

export default ExamRoom;
