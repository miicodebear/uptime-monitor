/**
 * Default / seed websites only.
 * After the first deploy, the live list is stored in Redis and managed
 * from the dashboard UI (Add / Remove). Editing this file only matters
 * when Redis has no sites yet.
 */
module.exports = [
  {
    name: 'iPad EFB Login',
    url: 'https://ipad.laoops.com/efb/login.php',
  },
  {
    name: 'Laos AAD',
    url: 'https://laosaad.codebear.win/',
  },
];
