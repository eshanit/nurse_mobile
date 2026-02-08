/**
 * Toast Composable
 * 
 * Toast notification wrapper for the HealthBridge app.
 * Uses Nuxt UI's toast composable.
 */

interface ToastOptions {
  title: string;
  description?: string;
  color?: 'success' | 'error' | 'warning' | 'info' | 'primary' | 'secondary' | 'neutral';
  timeout?: number;
}

export function useToast() {
  // Try to use Nuxt UI's toast composable if available
  let uiToast: { add: (options: any) => void } | null = null;
  
  if (typeof window !== 'undefined') {
    // Check if Nuxt UI's toast is available globally
    try {
      uiToast = (window as any).$toast || null;
    } catch (e) {
      // Ignore errors
    }
  }

  /**
   * Show a toast notification
   */
  function toast(options: ToastOptions) {
    const { title, description, color = 'info', timeout = 3000 } = options;
    
    // Try to use the global toast if available
    if (uiToast) {
      try {
        uiToast.add({
          title,
          description,
          color,
          timeout
        });
        return;
      } catch (e) {
        console.warn('Toast failed, falling back to console:', e);
      }
    }
    
    // Fallback to console
    console.log(`[Toast ${color}] ${title}: ${description || ''}`);
  }
  
  return {
    toast
  };
}
