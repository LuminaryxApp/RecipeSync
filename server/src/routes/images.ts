import { Router, Response } from 'express';
import multer from 'multer';
import cloudinary from '../config/cloudinary';
import db from '../db/connection';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getParam } from '../middleware/params';

const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate);

router.post('/', upload.single('image'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }

    const recipeId = getParam(req, 'id');
    const recipe = await db('recipes').where({ id: recipeId }).first();
    if (!recipe) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }

    // Check access
    if (recipe.owner_id !== req.userId) {
      const collab = await db('recipe_collaborators')
        .where({ recipe_id: recipe.id, user_id: req.userId, role: 'editor' })
        .first();
      if (!collab) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
    }

    const result = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: `recipesync/${recipeId}`, resource_type: 'image' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(req.file!.buffer);
    });

    res.status(201).json({
      image_id: result.public_id,
      url: result.secure_url,
      width: result.width,
      height: result.height,
    });
  } catch {
    res.status(500).json({ error: 'Image upload failed' });
  }
});

router.delete('/:imageId', async (req: AuthRequest, res: Response) => {
  try {
    const recipeId = getParam(req, 'id');
    const imageId = getParam(req, 'imageId');
    const recipe = await db('recipes').where({ id: recipeId }).first();
    if (!recipe || recipe.owner_id !== req.userId) {
      res.status(403).json({ error: 'Only the owner can delete images' });
      return;
    }

    await cloudinary.uploader.destroy(imageId);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Image deletion failed' });
  }
});

export default router;
