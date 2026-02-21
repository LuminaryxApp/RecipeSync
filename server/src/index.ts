import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import app from './app';
import { setupWebSocketServer } from './ws/collaboration';

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
setupWebSocketServer(server);

server.listen(PORT, () => {
  console.log(`RecipeSync server running on port ${PORT}`);
});
