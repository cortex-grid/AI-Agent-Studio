export {};

declare global {
  interface Window {
    __updateCanvasNode?: (id: string, updates: Record<string, unknown>) => void;
  }
}
