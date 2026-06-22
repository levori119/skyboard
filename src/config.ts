// Global API endpoint — relative path proxied to the Express server
export const API_URL = '/api';

// Map bt-screenSize values (inches) to --s scale factor
export const SCREEN_SCALE_MAP: Record<string, number> = {
  '15.6': 1.00,
  '16': 1.05,
  '18': 1.22,
  '24': 1.65,
};
