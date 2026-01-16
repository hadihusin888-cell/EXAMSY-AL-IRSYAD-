
export const fetchFromCloud = async (url: string) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 detik timeout

  try {
    const cacheBuster = `cb=${Date.now()}`;
    const finalUrl = url.includes('?') ? `${url}&${cacheBuster}` : `${url}?${cacheBuster}`;
    
    const response = await fetch(finalUrl, { 
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const result = await response.json();
    return result.success ? result.data : null;
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error("Gagal mengambil data dari Google Script:", error);
    return null;
  }
};

export const callCloudAction = async (url: string, action: string, payload: any) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 detik untuk POST

  try {
    // Kami menggunakan text/plain agar tidak memicu preflight OPTIONS
    // Google Apps Script tidak mendukung OPTIONS request dengan baik
    const response = await fetch(url, {
      method: 'POST',
      mode: 'no-cors', // Coba no-cors jika cors gagal di WebView
      redirect: 'follow',
      body: JSON.stringify({ action, payload }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    // Karena no-cors, kita tidak bisa membaca response body secara langsung
    // Namun untuk write action, biasanya kita asumsikan berhasil jika tidak ada error
    return true; 
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Fallback: coba lagi dengan mode cors jika no-cors gagal
    try {
      const retryResponse = await fetch(url, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        body: JSON.stringify({ action, payload }),
      });
      const result = await retryResponse.json();
      return result.success;
    } catch (e) {
      console.error(`Action ${action} failed:`, e);
      return false;
    }
  }
};
