import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db/connection';
import { generateTokens } from '../middleware/auth';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, display_name } = req.body;

    if (!email || !password || !display_name) {
      res.status(400).json({ error: 'email, password, and display_name are required' });
      return;
    }

    const existing = await db('users').where({ email }).first();
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const password_hash = await bcrypt.hash(password, 12);
    const [user] = await db('users')
      .insert({ email, password_hash, display_name, auth_provider: 'local' })
      .returning(['id', 'email', 'display_name', 'avatar_url', 'auth_provider', 'created_at']);

    const tokens = generateTokens(user.id);
    res.status(201).json({ user, ...tokens });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await db('users').where({ email }).first();
    if (!user || !user.password_hash) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const tokens = generateTokens(user.id);
    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, ...tokens });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      res.status(400).json({ error: 'refresh_token is required' });
      return;
    }

    const payload = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET!) as { userId: string };
    const tokens = generateTokens(payload.userId);
    res.json(tokens);
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Google OAuth
router.post('/google', async (req: Request, res: Response) => {
  try {
    const { id_token } = req.body;
    if (!id_token) {
      res.status(400).json({ error: 'id_token is required' });
      return;
    }

    // In production, verify with Google's OAuth2Client
    // For now, decode the token (it should be verified in production)
    let payload: { email?: string; name?: string; picture?: string };
    try {
      payload = jwt.decode(id_token) as any;
    } catch {
      res.status(401).json({ error: 'Invalid Google token' });
      return;
    }

    if (!payload || !payload.email) {
      res.status(401).json({ error: 'Invalid Google token' });
      return;
    }

    let user = await db('users').where({ email: payload.email }).first();
    if (!user) {
      [user] = await db('users')
        .insert({
          email: payload.email,
          display_name: payload.name || payload.email,
          avatar_url: payload.picture || null,
          auth_provider: 'google',
        })
        .returning(['id', 'email', 'display_name', 'avatar_url', 'auth_provider', 'created_at']);
    }

    const tokens = generateTokens(user.id);
    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, ...tokens });
  } catch {
    res.status(401).json({ error: 'Invalid Google token' });
  }
});

// Apple Sign-In
router.post('/apple', async (req: Request, res: Response) => {
  try {
    const { id_token, display_name } = req.body;
    if (!id_token) {
      res.status(400).json({ error: 'id_token is required' });
      return;
    }

    // Decode Apple identity token — in production, verify signature with Apple's public keys
    const decoded = jwt.decode(id_token) as { email?: string; sub?: string } | null;
    if (!decoded || !decoded.email) {
      res.status(401).json({ error: 'Invalid Apple token' });
      return;
    }

    let user = await db('users').where({ email: decoded.email }).first();
    if (!user) {
      [user] = await db('users')
        .insert({
          email: decoded.email,
          display_name: display_name || decoded.email,
          auth_provider: 'apple',
        })
        .returning(['id', 'email', 'display_name', 'avatar_url', 'auth_provider', 'created_at']);
    }

    const tokens = generateTokens(user.id);
    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, ...tokens });
  } catch {
    res.status(401).json({ error: 'Invalid Apple token' });
  }
});

export default router;
