const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
    queueLimit: 0
});

pool.on && pool.on('error', (err) => {
    console.error('MySQL pool error', err);
});

module.exports = {
    pool,
    query: async (sql, params) => {
        const [rows] = await pool.query(sql, params);
        return rows;
    },
    getConnection: () => pool.getConnection()
};