import client from './client';

export interface Collaborator {
  recipe_id: string;
  user_id: string;
  role: 'editor' | 'viewer';
  email: string;
  display_name: string;
  avatar_url: string | null;
  invited_at: string;
}

export async function getCollaborators(
  recipeId: string
): Promise<Collaborator[]> {
  const { data } = await client.get<Collaborator[]>(
    `/recipes/${recipeId}/collaborators`
  );
  return data;
}

export async function inviteCollaborator(
  recipeId: string,
  email: string,
  role: string = 'editor'
): Promise<Collaborator> {
  const { data } = await client.post<Collaborator>(
    `/recipes/${recipeId}/collaborators`,
    { email, role }
  );
  return data;
}

export async function updateCollaboratorRole(
  recipeId: string,
  userId: string,
  role: string
): Promise<Collaborator> {
  const { data } = await client.put<Collaborator>(
    `/recipes/${recipeId}/collaborators/${userId}`,
    { role }
  );
  return data;
}

export async function removeCollaborator(
  recipeId: string,
  userId: string
): Promise<void> {
  await client.delete(`/recipes/${recipeId}/collaborators/${userId}`);
}
