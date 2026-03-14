/**
 * JRonda Formatting Utilities
 * Centralized date/time formatting and number formatting
 */

// Locale mapping for different languages
const LOCALE_MAP = {
  en: 'en-MY',
  ms: 'ms-MY',
  zh: 'zh-CN',
  yue: 'yue-HK',
  ta: 'ta-MY',
  ar: 'ar-MY',
};

/**
 * Get the current locale from i18n or default
 * @returns {string} Locale code
 */
export function getCurrentLocale() {
  const currentLang = typeof window !== 'undefined' 
    && window.jrondaI18n?.getLang 
    ? window.jrondaI18n.getLang() 
    : 'en';
  return LOCALE_MAP[currentLang] || 'en-MY';
}

/**
 * Get locale for clock display
 * @returns {string} Locale code
 */
export function getClockLocale() {
  return getCurrentLocale();
}

/**
 * Format a number to have minimum digits (padding)
 * @param {number} value - Number to format
 * @param {number} minDigits - Minimum number of digits
 * @returns {string} Formatted string
 */
export function formatDigits(value, minDigits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '00'.padStart(minDigits, '0');
  
  return new Intl.NumberFormat('en-MY', {
    minimumIntegerDigits: minDigits,
    useGrouping: false,
  }).format(num);
}

/**
 * Format time in HH:MM:SS format
 * @param {Date} date - Date object
 * @param {string} [locale] - Optional locale override
 * @returns {string} Formatted time
 */
export function formatTime(date, locale) {
  const loc = locale || getCurrentLocale();
  const hours = formatDigits(date.getHours());
  const minutes = formatDigits(date.getMinutes());
  const seconds = formatDigits(date.getSeconds());
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Format time in HH:MM format (shorter)
 * @param {Date} date - Date object
 * @returns {string} Formatted time
 */
export function formatTimeShort(date) {
  const hours = formatDigits(date.getHours());
  const minutes = formatDigits(date.getMinutes());
  return `${hours}:${minutes}`;
}

/**
 * Format date in DD-MM-YYYY format
 * @param {Date} date - Date object
 * @returns {string} Formatted date
 */
export function formatDate(date) {
  const day = formatDigits(date.getDate());
  const month = formatDigits(date.getMonth() + 1);
  const year = formatDigits(date.getFullYear(), 4);
  return `${day}-${month}-${year}`;
}

/**
 * Format day of week
 * @param {Date} date - Date object
 * @returns {string} Day name
 */
export function formatDayName(date) {
  const locale = getCurrentLocale();
  return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
}

/**
 * Format distance in meters to human-readable string
 * @param {number} meters - Distance in meters
 * @returns {string} Formatted distance
 */
export function formatDistance(meters) {
  const d = Number(meters);
  if (!Number.isFinite(d) || d <= 0) return '0 m';
  if (d < 1000) return `${Math.round(d)} m`;
  if (d < 100000) return `${(d / 1000).toFixed(1)} km`;
  return `${Math.round(d / 1000)} km`;
}

/**
 * Format ETA minutes to human-readable string
 * @param {number} totalMinutes - Total minutes
 * @returns {string} Formatted ETA
 */
export function formatEtaMinutes(totalMinutesRaw) {
  const totalMinutes = Math.max(0, Number(totalMinutesRaw) || 0);
  if (totalMinutes < 60) return `${Math.round(totalMinutes)} min`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  return mins ? `${hours} h ${mins} min` : `${hours} h`;
}

/**
 * Format ETA with arrival time
 * @param {number} etaMinutes - ETA in minutes
 * @returns {Object} Object with formatted now, eta, and arrival times
 */
export function formatEtaWithArrival(etaMinutes) {
  const now = new Date();
  const arrival = new Date(now.getTime() + etaMinutes * 60 * 1000);
  
  return {
    now: formatTime(now),
    eta: Math.round(etaMinutes),
    arrival: formatTimeShort(arrival),
  };
}

/**
 * Calculate time until a future timestamp
 * @param {number} futureTimestamp - Future timestamp in ms
 * @returns {number} Seconds until future
 */
export function getSecondsUntil(futureTimestamp) {
  const now = Date.now();
  if (futureTimestamp <= now) return 0;
  return Math.ceil((futureTimestamp - now) / 1000);
}

/**
 * Parse HH:MM time string to minutes since midnight
 * @param {string} timeStr - Time string in HH:MM or H:MM format
 * @returns {number|null} Minutes since midnight or null if invalid
 */
export function parseHHMMToMinutes(timeStr) {
  const m = String(timeStr || '').match(/^(\d{1,3}):(\d{2})$/);
  if (!m) return null;
  
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm < 0 || mm > 59) {
    return null;
  }
  return hh * 60 + mm;
}

/**
 * Convert minutes since midnight to HH:MM format
 * @param {number} minutes - Minutes since midnight
 * @returns {string} Formatted time
 */
export function minutesToHHMM(minutes) {
  const m = Math.round(minutes);
  const hh = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${formatDigits(hh)}:${formatDigits(mm)}`;
}

/**
 * Format a number with thousand separators
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
export function formatNumber(num) {
  const n = Number(num);
  if (!Number.isFinite(n)) return '0';
  
  return new Intl.NumberFormat(getCurrentLocale()).format(n);
}

