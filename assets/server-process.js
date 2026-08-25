import { startServer } from './server.js';

const PORT = parseInt(process.env.LOUPE_PORT || '7429', 10);
startServer(PORT);
