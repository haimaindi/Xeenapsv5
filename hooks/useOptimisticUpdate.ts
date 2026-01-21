
import React, { useState, useCallback } from 'react';

/**
 * useOptimisticUpdate
 * Hook standar Xeenaps untuk mengelola pembaruan instan (Optimistic UI).
 * Prinsip: Update UI dulu -> Jalankan Async di background -> Rollback jika gagal.
 */
export const useOptimisticUpdate = <T extends { id: string }>() => {
  const [isSyncing, setIsSyncing] = useState(false);

  /**
   * performUpdate: Optimistic logic for property updates (e.g., toggles)
   */
  const performUpdate = useCallback(async (
    currentItems: T[],
    setItems: React.Dispatch<React.SetStateAction<T[]>>,
    targetIds: string[],
    updateFn: (item: T) => T,
    asyncAction: (updatedItem: T) => Promise<boolean>,
    onError?: (error: any) => void
  ) => {
    const originalItems = [...currentItems];
    setItems(prev => prev.map(item => 
      targetIds.includes(item.id) ? updateFn(item) : item
    ));

    setIsSyncing(true);
    try {
      const targetItems = originalItems.filter(i => targetIds.includes(i.id));
      const results = await Promise.all(
        targetItems.map(item => asyncAction(updateFn(item)))
      );
      if (results.some(r => !r)) throw new Error('Update sync failed');
    } catch (error) {
      setItems(originalItems);
      if (onError) onError(error);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  /**
   * performDelete: Optimistic logic for item removal
   */
  const performDelete = useCallback(async (
    currentItems: T[],
    setItems: React.Dispatch<React.SetStateAction<T[]>>,
    targetIds: string[],
    asyncAction: (id: string) => Promise<boolean>,
    onError?: (error: any) => void
  ) => {
    // 1. Save original state for Rollback
    const originalItems = [...currentItems];

    // 2. Instant UI Removal
    setItems(prev => prev.filter(item => !targetIds.includes(item.id)));

    // 3. Background Sync
    setIsSyncing(true);
    try {
      const results = await Promise.all(
        targetIds.map(id => asyncAction(id))
      );
      if (results.some(r => !r)) throw new Error('Delete sync failed');
    } catch (error) {
      // 4. Rollback if server fails
      setItems(originalItems);
      if (onError) onError(error);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  return { performUpdate, performDelete, isSyncing };
};
