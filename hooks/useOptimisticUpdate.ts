
import React, { useState, useCallback } from 'react';

/**
 * useOptimisticUpdate
 * Hook standar Xeenaps untuk mengelola pembaruan instan (Optimistic UI).
 * Prinsip: Update UI dulu -> Jalankan Async di background -> Rollback jika gagal.
 */
// Fix: Added React import to resolve namespace errors for Dispatch and SetStateAction
export const useOptimisticUpdate = <T extends { id: string }>() => {
  const [isSyncing, setIsSyncing] = useState(false);

  const performUpdate = useCallback(async (
    currentItems: T[],
    setItems: React.Dispatch<React.SetStateAction<T[]>>,
    targetIds: string[],
    updateFn: (item: T) => T,
    asyncAction: (updatedItem: T) => Promise<boolean>,
    onError?: (error: any) => void
  ) => {
    // 1. Simpan state asli untuk Rollback
    const originalItems = [...currentItems];

    // 2. Optimistic Update (Update UI secara instan)
    setItems(prev => prev.map(item => 
      targetIds.includes(item.id) ? updateFn(item) : item
    ));

    // 3. Jalankan sinkronisasi di latar belakang (Silent Sync)
    setIsSyncing(true);
    try {
      const targetItems = originalItems.filter(i => targetIds.includes(i.id));
      const results = await Promise.all(
        targetItems.map(item => asyncAction(updateFn(item)))
      );

      // Jika ada satu saja yang gagal, trigger error untuk rollback
      if (results.some(r => !r)) {
        throw new Error('Background synchronization failed');
      }
    } catch (error) {
      // 4. Rollback otomatis jika gagal
      setItems(originalItems);
      if (onError) onError(error);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  return { performUpdate, isSyncing };
};
