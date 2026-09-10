const mysql = require('mysql2/promise');
mysql.createPool({
  host: 'auth-db1777.hstgr.io',
  port: 3306,
  user: 'u156099858_shcaba',
  password: 'SAHARCO1957abadiocese',
  database: 'u156099858_shcaba_db'
}).getConnection().then(c => {
  console.log('✅ Connected!');
  c.release();
  process.exit(0);
}).catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
