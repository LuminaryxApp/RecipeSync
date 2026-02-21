import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth';
import recipeRoutes from './routes/recipes';
import collaboratorRoutes from './routes/collaborators';
import imageRoutes from './routes/images';
import presenceRoutes from './routes/presence';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/recipes/:id/collaborators', collaboratorRoutes);
app.use('/api/recipes/:id/images', imageRoutes);
app.use('/api/recipes/:id/presence', presenceRoutes);

export default app;
