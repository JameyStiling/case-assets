import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import router from './routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS setup - allow frontend running on Vite (default 5173)
app.use(cors({
  origin: '*', // Allow all for local desktop app usage
}));

app.use(express.json());

// Main router
app.use(router);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Centralized error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`  Case Art Organizer Backend running on port ${PORT}`);
  console.log(`===============================================`);
});
