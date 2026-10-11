// Test the real application API with Supabase Auth, DB and Realtime.
// No background order expiry/cleanup jobs are started by this test server.
process.env.PORT = '8081';
process.env.CORS_ALLOWED_ORIGINS = 'http://127.0.0.1:5174';
process.env.COOKIE_SECURE = 'false';
process.env.MIGRATIONS_ENABLED = 'false';
const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/common/db.js');
const { createServer } = await import('node:http');
const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/__chat_test_stop') {
    // Drain the DB before deleting temporary profiles. Pending /me requests
    // would otherwise provision an orphan profile after test cleanup.
    server.close();
    server.closeIdleConnections();
    await pool.end();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"stopped":true}');
    return;
  }
  app(req, res);
});
server.listen(8081, '127.0.0.1', () => console.log('Chat live test API ready.'));
async function close() { server.close(); await pool.end(); process.exit(0); }
process.on('SIGTERM', close); process.on('SIGINT', close);
