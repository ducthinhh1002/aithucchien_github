import { createApp } from './app.js';

const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT phải là số nguyên từ 1 đến 65535');
}
// Also serve the built SPA under npm start without requiring a shell-specific env assignment.
const server = createApp({ serveDist: true }).listen(port, () => {
  // Startup metadata only; never print profiles, meals, images or credentials.
  console.info(`API dinh dưỡng đang lắng nghe tại cổng ${port}`);
});
function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
