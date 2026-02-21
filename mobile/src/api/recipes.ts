import client from './client';

export interface Recipe {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  tags: string[];
  nutritional_info: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface RecipeDetail extends Recipe {
  ingredients: Ingredient[];
  steps: Step[];
}

export interface Ingredient {
  id: string;
  recipe_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  order_index: number;
}

export interface Step {
  id: string;
  recipe_id: string;
  instruction: string;
  image_url: string | null;
  order_index: number;
}

export async function getRecipes(): Promise<Recipe[]> {
  const { data } = await client.get<Recipe[]>('/recipes');
  return data;
}

export async function getRecipe(id: string): Promise<RecipeDetail> {
  const { data } = await client.get<RecipeDetail>(`/recipes/${id}`);
  return data;
}

export async function createRecipe(
  title: string,
  description?: string
): Promise<Recipe> {
  const { data } = await client.post<Recipe>('/recipes', { title, description });
  return data;
}

export async function updateRecipeMetadata(
  id: string,
  metadata: Partial<
    Pick<
      Recipe,
      | 'prep_time_minutes'
      | 'cook_time_minutes'
      | 'servings'
      | 'difficulty'
      | 'tags'
      | 'nutritional_info'
    >
  >
): Promise<Recipe> {
  const { data } = await client.put<Recipe>(`/recipes/${id}/metadata`, metadata);
  return data;
}

export async function deleteRecipe(id: string): Promise<void> {
  await client.delete(`/recipes/${id}`);
}
