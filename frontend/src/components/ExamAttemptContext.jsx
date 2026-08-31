import { createContext, useCallback, useContext, useMemo, useState } from "react";

const ExamAttemptContext = createContext(null);

export function ExamAttemptProvider({ children }) {
  const [activeAttemptId, setActiveAttemptId] = useState(null);

  const setActiveExamAttempt = useCallback((attemptId) => {
    setActiveAttemptId(attemptId ? String(attemptId) : null);
  }, []);

  const clearExamAttempt = useCallback((attemptId) => {
    setActiveAttemptId((current) => !attemptId || current === String(attemptId) ? null : current);
  }, []);

  const value = useMemo(() => ({ activeAttemptId, setActiveExamAttempt, clearExamAttempt }), [activeAttemptId, setActiveExamAttempt, clearExamAttempt]);
  return <ExamAttemptContext.Provider value={value}>{children}</ExamAttemptContext.Provider>;
}

export function useExamAttempt() {
  const context = useContext(ExamAttemptContext);
  if (!context) throw new Error("useExamAttempt must be used inside ExamAttemptProvider");
  return context;
}
