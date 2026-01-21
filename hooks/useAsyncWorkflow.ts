
import { useCallback, useRef, useEffect } from 'react';

/**
 * useAsyncWorkflow
 * Hook untuk mengelola operasi asinkron dengan fitur:
 * 1. Auto-abort request sebelumnya jika request baru dimulai.
 * 2. Timeout otomatis (default 30 detik).
 * 3. Pembersihan (cleanup) saat komponen unmount.
 */
export const useAsyncWorkflow = (timeoutMs: number = 30000) => {
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef<number>(0);

  const execute = useCallback(async <T>(
    asyncFn: (signal: AbortSignal) => Promise<T>,
    onSuccess?: (data: T) => void,
    onError?: (error: any) => void
  ) => {
    // Generate ID unik untuk request ini
    const requestId = ++requestIdRef.current;
    
    // Batalkan request sebelumnya jika masih berjalan
    if (controllerRef.current) {
      controllerRef.current.abort();
    }

    // Buat controller baru
    const controller = new AbortController();
    controllerRef.current = controller;

    // Set timeout 30 detik
    const timeoutId = setTimeout(() => {
      controller.abort('TIMEOUT');
    }, timeoutMs);

    try {
      const result = await asyncFn(controller.signal);
      
      // Hanya eksekusi sukses jika ini masih request terakhir
      if (requestId === requestIdRef.current) {
        onSuccess?.(result);
      }
    } catch (err: any) {
      // Hanya eksekusi error jika ini masih request terakhir
      if (requestId === requestIdRef.current) {
        // Jangan anggap abort manual (karena request baru) sebagai error yang perlu ditampilkan ke user
        if (err === 'TIMEOUT' || (err.name === 'AbortError' && controller.signal.aborted)) {
          onError?.(err === 'TIMEOUT' ? new Error('TIMEOUT') : err);
        } else if (err.name !== 'AbortError') {
          onError?.(err);
        }
      }
    } finally {
      if (requestId === requestIdRef.current) {
        clearTimeout(timeoutId);
      }
    }
  }, [timeoutMs]);

  // Cleanup saat unmount
  useEffect(() => {
    return () => {
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
    };
  }, []);

  return { execute };
};
