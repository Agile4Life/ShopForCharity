// Unit/embedded tests must never depend on private .env or a real shop database.
process.env.NODE_ENV = 'test';
process.env.RESEND_API_KEY = '';
process.env.ORDER_EMAIL_FROM = '';
process.env.GOOGLE_SHEETS_SPREADSHEET_ID = '';
process.env.GOOGLE_SHEETS_TAB_NAME = '';
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = '';
process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = '';
process.env.IDEMPOTENCY_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
process.env.GUEST_SESSION_SIGNING_KEY = Buffer.alloc(32, 2).toString('base64');
process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173';
process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/test';
process.env.DB_SSL_CA = '';
process.env.DB_SSL_CA_PATH = '';
process.env.DB_SSL = 'false';
