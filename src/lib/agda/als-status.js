/**
 * The ALS worker's status as shown in the UI: a label and a `tone` that
 * picks colors from theme.css (a bright --app-<tone>-dot for the status
 * dot, an AA-contrast --app-<tone>-text for text; neutral text uses the
 * regular muted color).
 * @param {import('$lib/controller.svelte').AgdaController} agdaController
 * @returns {{ tone: 'neutral' | 'warning' | 'success' | 'danger', label: string }}
 */
export function alsStatusMeta(agdaController) {
  switch (agdaController.alsWorkerStatus) {
    case 'initial': return { tone: 'neutral', label: 'Starting...' }
    case 'loading': return { tone: 'warning', label: 'Loading...' }
    case 'loaded': return { tone: 'warning', label: agdaController.driveIsCreated ? 'Setting up...' : 'Fetching libraries...' }
    case 'active': return { tone: 'success', label: 'Active' }
    case 'deactivating': return { tone: 'neutral', label: 'Stopping...' }
    case 'errored': return { tone: 'danger', label: 'Error' }
    case 'exited': return { tone: 'neutral', label: 'Exited' }
    case 'terminated': return { tone: 'neutral', label: 'Terminated' }
    default: return { tone: 'neutral', label: agdaController.alsWorkerStatus }
  }
}
