import client from './client';

export interface UploadedImage {
  image_id: string;
  url: string;
  width: number;
  height: number;
}

export async function uploadStepImage(
  recipeId: string,
  imageUri: string
): Promise<UploadedImage> {
  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    type: 'image/jpeg',
    name: 'step-image.jpg',
  } as any);

  const { data } = await client.post<UploadedImage>(
    `/recipes/${recipeId}/images`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    }
  );

  return data;
}

export async function deleteImage(
  recipeId: string,
  imageId: string
): Promise<void> {
  await client.delete(`/recipes/${recipeId}/images/${imageId}`);
}
