export const useProcessingStatus = () => {
  // This hook is now a no-op — progress management has moved to ChatWindow
  // to avoid Zustand batching issues and React lifecycle conflicts.
  return {};
};