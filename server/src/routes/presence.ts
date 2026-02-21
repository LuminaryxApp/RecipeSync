import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getPresence } from '../services/presence';
import { getParam } from '../middleware/params';

const router = Router({ mergeParams: true });
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const recipeId = getParam(req, 'id');
    const presence = await getPresence(recipeId);
    res.json(presence);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
