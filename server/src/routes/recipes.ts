import { Router, Response } from 'express';
import db from '../db/connection';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getParam } from '../middleware/params';

const router = Router();

router.use(authenticate);

// List user's recipes (owned + collaborating)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const owned = await db('recipes').where({ owner_id: req.userId });
    const collaborating = await db('recipes')
      .join('recipe_collaborators', 'recipes.id', 'recipe_collaborators.recipe_id')
      .where({ 'recipe_collaborators.user_id': req.userId })
      .select('recipes.*');

    const allRecipes = [...owned, ...collaborating];
    // Deduplicate by id
    const seen = new Set<string>();
    const unique = allRecipes.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    res.json(unique);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create recipe
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { title, description } = req.body;
    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    const [recipe] = await db('recipes')
      .insert({ title, description, owner_id: req.userId })
      .returning('*');

    res.status(201).json(recipe);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recipe details
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = getParam(req, 'id');
    const recipe = await db('recipes').where({ id }).first();
    if (!recipe) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }

    // Check access: owner or collaborator
    if (recipe.owner_id !== req.userId) {
      const collab = await db('recipe_collaborators')
        .where({ recipe_id: recipe.id, user_id: req.userId })
        .first();
      if (!collab) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
    }

    const ingredients = await db('ingredients')
      .where({ recipe_id: recipe.id })
      .orderBy('order_index');
    const steps = await db('steps')
      .where({ recipe_id: recipe.id })
      .orderBy('order_index');

    res.json({ ...recipe, ingredients, steps });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update metadata
router.put('/:id/metadata', async (req: AuthRequest, res: Response) => {
  try {
    const id = getParam(req, 'id');
    const recipe = await db('recipes').where({ id }).first();
    if (!recipe) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }
    if (recipe.owner_id !== req.userId) {
      const collab = await db('recipe_collaborators')
        .where({ recipe_id: recipe.id, user_id: req.userId, role: 'editor' })
        .first();
      if (!collab) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
    }

    const allowed = ['prep_time_minutes', 'cook_time_minutes', 'servings', 'difficulty', 'tags', 'nutritional_info'];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date();

    const [updated] = await db('recipes')
      .where({ id })
      .update(updates)
      .returning('*');

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete recipe (owner only)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = getParam(req, 'id');
    const recipe = await db('recipes').where({ id }).first();
    if (!recipe) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }
    if (recipe.owner_id !== req.userId) {
      res.status(403).json({ error: 'Only the owner can delete a recipe' });
      return;
    }

    await db('recipes').where({ id }).del();
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
