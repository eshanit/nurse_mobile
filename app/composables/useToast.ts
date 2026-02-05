/**
 * Toast Composable
 * 
 * Simple toast notification wrapper for the HealthBridge app.
 * Uses UToast component if available, otherwise uses console.
 */

interface ToastOptions {
  title: string;
  description?: string;
  color?: 'success' | 'error' | 'warning' | 'info';
  timeout?: number;
}

export function useToast() {
  /**
   * Show a toast notification
   */
  function toast(options: ToastOptions) {
    const { title, description, color = 'info', timeout = 3000 } = options;
    
    // Try to use the global toast if available (from Nuxt UI)
    if (typeof window !== 'undefined' && (window as any).$toast) {
      (window as any).$toast.add({
        title,
        description,
        color,
        timeout
      });
      return;
    }
    
    // Fallback to console
    console.log(`[Toast ${color}] ${title}: ${description || ''}`);
  }
  
  return {
    toast
  };
}
