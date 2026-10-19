/** Vandaag als YYYY-MM-DD in Europe/Brussels (niet in UTC: rond middernacht scheelt dat een dag). */
export function vandaagInBrussel(nu = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(nu);
}
