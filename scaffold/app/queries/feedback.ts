// Everything the app fetches from its own server goes through Pinia Colada, one file per
// kind of data in app/queries/. Pages and components use these composables; they never
// call $fetch themselves. That keeps caching, loading states and refreshing consistent.
//
// Reads use useRequestFetch(): during server rendering it forwards the visitor's cookies,
// including their Cloudflare Access sign-in, so staff-only data renders on first load.

export const feedbackKeys = {
  all: ['feedback'] as const,
}

// Reported problems, newest first. Staff only: fails with 401 for anyone not signed in.
export function useFeedbackList() {
  const api = useRequestFetch()
  return useQuery({
    key: feedbackKeys.all,
    query: () => api('/api/feedback'),
  })
}

export interface NewReport {
  message: string
  page?: string
  turnstileToken?: string | null
}

// Send a report, then refresh the list so /reports shows it straight away.
export function useReportProblem() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (report: NewReport) => $fetch('/api/feedback', { method: 'POST', body: report }),
    onSettled: () => queryCache.invalidateQueries({ key: feedbackKeys.all }),
  })
}
