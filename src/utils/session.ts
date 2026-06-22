import type { WorkstationSession } from '../types/index';

export const getSession = (): WorkstationSession | null => {
  try {
    const data = sessionStorage.getItem('workstation_session');
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

export const saveSession = (session: WorkstationSession): void => {
  sessionStorage.setItem('workstation_session', JSON.stringify(session));
};

export const clearSession = (): void => {
  sessionStorage.removeItem('workstation_session');
};
