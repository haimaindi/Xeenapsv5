
import Swal, { SweetAlertIcon } from 'sweetalert2';

/**
 * XEENAPS TOAST FACTORY
 * A non-interruptive feedback system for background actions.
 * Features: Glassmorphism, Emerald Green success state, and automated progress tracking.
 */

export const showXeenapsToast = (icon: SweetAlertIcon, title: string) => {
  const iconColors = {
    success: '#10b981', // Emerald Green
    error: '#ef4444',   // Rose Red
    warning: '#f59e0b', // Amber Gold
    info: '#004A74',    // Xeenaps Blue
    question: '#8b5cf6' // Violet
  };

  const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    background: 'rgba(255, 255, 255, 0.8)',
    didOpen: (toast) => {
      toast.addEventListener('mouseenter', Swal.stopTimer);
      toast.addEventListener('mouseleave', Swal.resumeTimer);
      
      // Inject glassmorphism and custom styling
      toast.style.backdropFilter = 'blur(12px)';
      // Fix: Use type assertion to any to access vendor-prefixed property 'webkitBackdropFilter' which is missing in standard CSSStyleDeclaration type
      (toast.style as any).webkitBackdropFilter = 'blur(12px)';
      toast.style.borderRadius = '1.25rem';
      toast.style.border = '1px solid rgba(255, 255, 255, 0.2)';
      toast.style.boxShadow = '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)';
      
      // Style progress bar to match icon color
      const progressBar = toast.querySelector('.swal2-timer-progress-bar') as HTMLElement;
      if (progressBar) {
        progressBar.style.backgroundColor = iconColors[icon] || iconColors.info;
      }
    },
    customClass: {
      popup: 'p-4',
      title: 'text-[#004A74] text-xs font-black uppercase tracking-widest px-2',
      icon: 'm-0'
    }
  });

  return Toast.fire({
    icon,
    title,
    iconColor: iconColors[icon] || iconColors.info,
  });
};
