import { useRef, useCallback } from "react";

export function useUndo(initialState) {
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const currentRef = useRef(initialState);

  const pushState = useCallback((state) => {
    undoStack.current.push(currentRef.current);
    redoStack.current = [];
    currentRef.current = state;
    if (undoStack.current.length > 50) undoStack.current.shift();
  }, []);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return null;
    redoStack.current.push(currentRef.current);
    currentRef.current = undoStack.current.pop();
    return currentRef.current;
  }, []);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return null;
    undoStack.current.push(currentRef.current);
    currentRef.current = redoStack.current.pop();
    return currentRef.current;
  }, []);

  return { pushState, undo, redo };
}
