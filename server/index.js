import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);

// Required headers for WebLLM SharedArrayBuffer access
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

app.use(express.static(join(__dirname, '../public')));

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Gemma Web running at http://localhost:${PORT}`);
});
