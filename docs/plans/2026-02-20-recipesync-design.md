# RecipeSync Design Document

*Collaborative cooking made easy.*

**Date:** 2026-02-20
**Complexity:** Medium | **Market:** High

## Overview

RecipeSync is a React Native mobile app that allows users to create, share, and collaborate on recipes in real-time using Google Docs-style editing. Users can invite friends or family to contribute to a recipe, with live presence indicators and automatic conflict resolution via CRDTs.

## Architecture

```
┌─────────────────┐         ┌──────────────────────┐
│  React Native    │◄──WS──►│  Node.js / Express    │
│  (iOS/Android)   │◄─HTTP─►│                        │
└─────────────────┘         │  - REST API            │
                            │  - WebSocket (Yjs sync)│
                            │  - Auth (JWT)          │
                            └──────────┬─────────────┘
                                       │
                       ┌───────────────┼───────────────┐
                       ▼               ▼               ▼
                 ┌──────────┐   ┌──────────┐   ┌────────────┐
                 │ PostgreSQL│   │  Redis    │   │ Cloudinary │
                 │ (data)   │   │ (presence │   │ (images)   │
                 │          │   │  & cache) │   │            │
                 └──────────┘   └──────────┘   └────────────┘
```

- **PostgreSQL** for persistent data (users, recipes, permissions, shopping lists)
- **Redis** for real-time presence (who's editing), WebSocket session management, and caching
- **Cloudinary** for all image upload/storage/transformation
- **WebSockets** for Yjs CRDT sync and live presence indicators
- **REST API** for everything else (auth, recipe CRUD, shopping lists, user management)

## Data Model

### Users

```
User {
  id: UUID
  email: string
  password_hash: string (nullable, for social-only users)
  display_name: string
  avatar_url: string
  auth_provider: enum [local, google, apple]
  created_at: timestamp
}
```

### Recipes

```
Recipe {
  id: UUID
  owner_id: UUID → User
  title: string
  description: text
  prep_time_minutes: int
  cook_time_minutes: int
  servings: int
  difficulty: enum [easy, medium, hard]
  tags: string[]
  nutritional_info: jsonb {calories, protein, carbs, fat}
  yjs_document: bytea (CRDT state for collaborative editing)
  created_at: timestamp
  updated_at: timestamp
}

Ingredient {
  id: UUID
  recipe_id: UUID → Recipe
  name: string
  quantity: decimal
  unit: string
  order_index: int
}

Step {
  id: UUID
  recipe_id: UUID → Recipe
  instruction: text
  image_url: string (Cloudinary)
  order_index: int
}
```

### Collaboration

```
RecipeCollaborator {
  recipe_id: UUID → Recipe
  user_id: UUID → User
  role: enum [editor, viewer]
  invited_at: timestamp
}
```

**Notes:**
- The `yjs_document` field stores the serialized CRDT state so collaboration can resume across sessions
- Ingredients and steps are separate tables so they're independently orderable and queryable (important for shopping list generation later)
- Tags are a Postgres array for simplicity — no need for a join table at MVP

## Real-Time Collaboration

### How it works

1. User opens a recipe → client connects via WebSocket to `/ws/recipe/:id`
2. Server loads the Yjs document from Postgres (or creates one if new)
3. Yjs awareness protocol broadcasts presence — each collaborator sees who else is editing and where their cursor is
4. Edits sync via Yjs update messages over WebSocket — no REST calls during active editing
5. Server persists the Yjs document to Postgres on a debounced interval (every 2-3 seconds of inactivity) and on disconnect

### Collaborative vs. standard fields

| Collaborative (Yjs CRDT) | Standard REST |
|---|---|
| Title, description | Recipe metadata (prep time, cook time, servings, difficulty) |
| Ingredients (add, edit, reorder, delete) | Tags, nutritional info |
| Steps (add, edit, reorder, delete) | Image uploads |
| | Collaborator management |

### Presence indicators

- Colored avatar badges showing who's currently viewing the recipe
- Highlighted field borders showing which field each collaborator is editing
- Stored in Redis with TTL expiry so stale presence auto-cleans

### Offline handling

- Yjs natively supports offline — edits queue locally and merge on reconnect
- No special code needed, this comes free with the CRDT approach

## API Endpoints

### Auth

```
POST   /api/auth/register          — email/password signup
POST   /api/auth/login             — email/password login
POST   /api/auth/google            — Google OAuth token exchange
POST   /api/auth/apple             — Apple Sign-In token exchange
POST   /api/auth/refresh           — refresh JWT token
```

### Recipes

```
GET    /api/recipes                — list user's recipes (owned + collaborating)
POST   /api/recipes                — create new recipe
GET    /api/recipes/:id            — get recipe details
PUT    /api/recipes/:id/metadata   — update non-collaborative fields
DELETE /api/recipes/:id            — delete recipe (owner only)
```

### Collaboration

```
POST   /api/recipes/:id/collaborators      — invite collaborator (by email)
GET    /api/recipes/:id/collaborators      — list collaborators
PUT    /api/recipes/:id/collaborators/:uid — update role
DELETE /api/recipes/:id/collaborators/:uid — remove collaborator
```

### Images

```
POST   /api/recipes/:id/images     — upload image, returns Cloudinary URL
DELETE /api/recipes/:id/images/:imageId — remove image
```

### WebSocket

```
WS     /ws/recipe/:id              — Yjs sync + presence
```

All REST endpoints are JWT-authenticated. The WebSocket connection authenticates via a token in the initial handshake. Authorization checks ensure only owners and collaborators can access a recipe.

## React Native App Structure

### Navigation

```
AuthStack (unauthenticated)
  ├── LoginScreen
  ├── RegisterScreen
  └── SocialAuthScreen

MainStack (authenticated)
  ├── HomeScreen (recipe list — owned + shared with me)
  ├── RecipeEditorScreen (the core collaborative editing view)
  ├── RecipeViewScreen (read-only view for viewers)
  ├── CollaboratorsScreen (manage who has access)
  └── ProfileScreen (account settings, avatar)
```

### Key components

```
RecipeEditor/
  ├── RecipeHeader         — title, description (Yjs-bound)
  ├── MetadataBar          — prep time, cook time, servings, difficulty
  ├── IngredientList       — drag-to-reorder, add/edit/delete (Yjs-bound)
  ├── StepList             — drag-to-reorder, add/edit/delete (Yjs-bound)
  ├── StepImagePicker      — camera/gallery → Cloudinary upload
  ├── NutritionPanel       — manual entry for calories, protein, carbs, fat
  ├── TagPicker            — add/remove tags
  ├── PresenceBar          — avatar badges of active collaborators
  └── CollaboratorCursors  — colored highlights on fields others are editing
```

### State management

- **Yjs document** is the source of truth for collaborative fields — no Redux/Zustand duplication
- **React Query** for server state (recipe list, user profile, collaborator lists)
- **React Context** for auth state (JWT token, current user)

## Error Handling & Edge Cases

### Connection loss during editing
- Yjs queues edits locally in memory automatically
- UI shows a "reconnecting..." banner when WebSocket drops
- On reconnect, Yjs merges local and remote changes — no data loss

### Collaborator conflicts
- CRDTs guarantee automatic merge without conflicts by design
- For list operations (ingredients, steps): concurrent inserts both appear, concurrent reorder uses last-writer-wins on position
- For text fields: concurrent character-level edits merge naturally

### Permission edge cases
- Owner removes a collaborator while they're editing → WebSocket forcefully closed, user sees "You no longer have access"
- Owner deletes a recipe while collaborators are editing → WebSocket closed, collaborators see "This recipe has been deleted"
- Viewer tries to edit → UI disables all input fields, shows "View only" badge

### Image upload failures
- Retry up to 3 times with exponential backoff
- Show inline error on the specific step with a "Retry" button
- Don't block recipe editing while an upload is in progress

### Auth edge cases
- JWT expires during editing → silent refresh via refresh token, WebSocket reconnects automatically
- Social account linked to existing email → prompt user to link accounts or sign in with existing method

## Testing Strategy

### Backend
- Unit tests for auth logic, permission checks, and recipe CRUD operations (Jest)
- Integration tests for WebSocket Yjs sync — verify two clients editing simultaneously produce correct merged state
- API endpoint tests with Supertest

### Mobile
- Component tests for RecipeEditor sub-components (React Native Testing Library)
- Integration test for the Yjs binding — verify local edits propagate to Yjs document and vice versa
- E2E tests for critical flows: sign up → create recipe → invite collaborator → both edit → verify merge (Detox)

### What NOT to test in MVP
- Don't unit test simple CRUD resolvers or trivial components
- Don't aim for coverage numbers — focus on the collaboration logic since that's where bugs will hide

## MVP Features

1. User account creation and management (email/password + Google + Apple Sign-In)
2. Recipe creation and editing (rich model with per-step photos, nutritional info, tags, difficulty)
3. Real-time collaboration on recipes (Google Docs-style with Yjs CRDTs)

## Tech Stack Summary

| Layer | Technology |
|---|---|
| Mobile | React Native |
| Backend | Node.js / Express |
| Database | PostgreSQL |
| Cache/Presence | Redis |
| Real-time | WebSockets + Yjs |
| Image hosting | Cloudinary |
| Auth | JWT + Google OAuth + Apple Sign-In |
| Testing | Jest, Supertest, React Native Testing Library, Detox |
