function getDateRangeFromNow(days) {
  const now = new Date();
  const target = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return { now, target };
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addSeconds(date, seconds) {
  const result = new Date(date);
  result.setSeconds(result.getSeconds() + seconds);
  return result;
}

function daysBetween(date1, date2) {
  const oneDay = 24 * 60 * 60 * 1000;
  const diffMs = Math.abs(date2 - date1);
  return Math.ceil(diffMs / oneDay);
}

function isExpired(date) {
  return new Date(date) < new Date();
}

function isWithinGracePeriod(expiryDate, graceDays) {
  const now = new Date();
  const graceEnd = addDays(new Date(expiryDate), graceDays);
  return now > new Date(expiryDate) && now <= graceEnd;
}

function toISOString(date) {
  return new Date(date).toISOString();
}

function formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

module.exports = {
  getDateRangeFromNow,
  addDays,
  addSeconds,
  daysBetween,
  isExpired,
  isWithinGracePeriod,
  toISOString,
  formatDate
};
