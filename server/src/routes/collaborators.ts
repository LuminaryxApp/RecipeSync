import { Router, Response } from 'express';
import db from '../db/connection';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getParam } from '../middleware/params';

const router = Router({ mergeParams: true });

router.use(authenticate);

// Invite collaborator by email
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const recipeId = getParam(req, 'id');
    const { email, role } = req.body;

    const recipe = await db('recipes').where({ id: recipeId }).first();
    if (!recipe || recipe.owner_id !== req.userId) {
      res.status(403).json({ error: 'Only the owner can invite collaborators' });
      return;
    }

    const user = await db('users').where({ email }).first();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const [collab] = await db('recipe_collaborators')
      .insert({ recipe_id: recipeId, user_id: user.id, role: role || 'editor' })
      .returning('*');

    res.status(201).json(collab);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List collaborators
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const recipeId = getParam(req, 'id');
    const collaborators = await db('recipe_collaborators')
      .join('users', 'recipe_collaborators.user_id', 'users.id')
      .where({ recipe_id: recipeId })
      .select('recipe_collaborators.*', 'users.email', 'users.display_name', 'users.avatar_url');

    res.json(collaborators);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update role
router.put('/:uid', async (req: AuthRequest, res: Response) => {
  try {
    const recipeId = getParam(req, 'id');
    const uid = getParam(req, 'uid');
    const recipe = await db('recipes').where({ id: recipeId }).first();
    if (!recipe || recipe.owner_id !== req.userId) {
      res.status(403).json({ error: 'Only the owner can update roles' });
      return;
    }

    const [updated] = await db('recipe_collaborators')
      .where({ recipe_id: recipeId, user_id: uid })
      .update({ role: req.body.role })
      .returning('*');

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove collaborator
router.delete('/:uid', async (req: AuthRequest, res: Response) => {
  try {
    const recipeId = getParam(req, 'id');
    const uid = getParam(req, 'uid');
    const recipe = await db('recipes').where({ id: recipeId }).first();
    if (!recipe || recipe.owner_id !== req.userId) {
      res.status(403).json({ error: 'Only the owner can remove collaborators' });
      return;
    }

    await db('recipe_collaborators')
      .where({ recipe_id: recipeId, user_id: uid })
      .del();

    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
