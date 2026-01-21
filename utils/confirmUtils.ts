
import Swal from 'sweetalert2';
import { XEENAPS_SWAL_CONFIG } from './swalUtils';

/**
 * showXeenapsDeleteConfirm
 * Reusable confirmation dialog for delete operations.
 * Features: High-contrast red styling for danger zone awareness.
 */
export const showXeenapsDeleteConfirm = async (count: number) => {
  const result = await Swal.fire({
    ...XEENAPS_SWAL_CONFIG,
    icon: 'warning',
    iconColor: '#ef4444',
    title: 'CONFIRM DELETE',
    text: `Are you sure you want to permanently delete ${count} selected item(s)? This action cannot be undone.`,
    showCancelButton: true,
    confirmButtonText: 'DELETE PERMANENTLY',
    cancelButtonText: 'CANCEL',
    customClass: {
      ...XEENAPS_SWAL_CONFIG.customClass,
      confirmButton: 'bg-red-600 text-white px-8 py-3.5 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all border-none outline-none focus:ring-4 focus:ring-red-600/20 mx-2 mt-4'
    }
  });
  return result.isConfirmed;
};
