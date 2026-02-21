import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useYjsCollaboration } from '../hooks/useYjsCollaboration';
import { usePresence } from '../hooks/usePresence';
import PresenceBar from '../components/PresenceBar';
import { uploadStepImage } from '../api/images';
import * as ImagePicker from 'expo-image-picker';
import * as Y from 'yjs';

type Props = NativeStackScreenProps<RootStackParamList, 'RecipeEditor'>;

interface IngredientItem {
  name: string;
  quantity: string;
  unit: string;
}

interface StepItem {
  instruction: string;
  image_url?: string;
}

export default function RecipeEditorScreen({ route, navigation }: Props) {
  const { recipeId, mode } = route.params;
  const { doc, connected, synced, getText, getArray } =
    useYjsCollaboration(recipeId);
  const presence = usePresence(recipeId);
  const isReadOnly = mode === 'view';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
  const [steps, setSteps] = useState<StepItem[]>([]);

  // Sync from Yjs doc to local state
  useEffect(() => {
    if (!synced) return;

    const titleText = getText('title');
    const descText = getText('description');
    const ingredientsArray = getArray('ingredients');
    const stepsArray = getArray('steps');

    const syncState = () => {
      setTitle(titleText.toString());
      setDescription(descText.toString());
      setIngredients(ingredientsArray.toArray() as IngredientItem[]);
      setSteps(stepsArray.toArray() as StepItem[]);
    };

    syncState();

    titleText.observe(syncState);
    descText.observe(syncState);
    ingredientsArray.observe(syncState);
    stepsArray.observe(syncState);

    return () => {
      titleText.unobserve(syncState);
      descText.unobserve(syncState);
      ingredientsArray.unobserve(syncState);
      stepsArray.unobserve(syncState);
    };
  }, [synced, getText, getArray]);

  const updateTitle = useCallback(
    (text: string) => {
      const yTitle = getText('title');
      doc.transact(() => {
        yTitle.delete(0, yTitle.length);
        yTitle.insert(0, text);
      });
      setTitle(text);
    },
    [doc, getText]
  );

  const updateDescription = useCallback(
    (text: string) => {
      const yDesc = getText('description');
      doc.transact(() => {
        yDesc.delete(0, yDesc.length);
        yDesc.insert(0, text);
      });
      setDescription(text);
    },
    [doc, getText]
  );

  const addIngredient = useCallback(() => {
    const yIngredients = getArray('ingredients');
    yIngredients.push([{ name: '', quantity: '', unit: '' }]);
  }, [getArray]);

  const updateIngredient = useCallback(
    (index: number, field: keyof IngredientItem, value: string) => {
      const yIngredients = getArray('ingredients');
      const current = yIngredients.get(index) as IngredientItem;
      if (current) {
        doc.transact(() => {
          yIngredients.delete(index, 1);
          yIngredients.insert(index, [{ ...current, [field]: value }]);
        });
      }
    },
    [doc, getArray]
  );

  const removeIngredient = useCallback(
    (index: number) => {
      const yIngredients = getArray('ingredients');
      yIngredients.delete(index, 1);
    },
    [getArray]
  );

  const addStep = useCallback(() => {
    const ySteps = getArray('steps');
    ySteps.push([{ instruction: '' }]);
  }, [getArray]);

  const updateStep = useCallback(
    (index: number, instruction: string) => {
      const ySteps = getArray('steps');
      const current = ySteps.get(index) as StepItem;
      if (current) {
        doc.transact(() => {
          ySteps.delete(index, 1);
          ySteps.insert(index, [{ ...current, instruction }]);
        });
      }
    },
    [doc, getArray]
  );

  const removeStep = useCallback(
    (index: number) => {
      const ySteps = getArray('steps');
      ySteps.delete(index, 1);
    },
    [getArray]
  );

  const handleAddStepImage = useCallback(
    async (index: number) => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        try {
          const { url } = await uploadStepImage(
            recipeId,
            result.assets[0].uri
          );
          const ySteps = getArray('steps');
          const current = ySteps.get(index) as StepItem;
          if (current) {
            doc.transact(() => {
              ySteps.delete(index, 1);
              ySteps.insert(index, [{ ...current, image_url: url }]);
            });
          }
        } catch {
          Alert.alert('Error', 'Failed to upload image');
        }
      }
    },
    [recipeId, doc, getArray]
  );

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>Back</Text>
        </TouchableOpacity>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.dot,
              { backgroundColor: connected ? '#4CAF50' : '#F44336' },
            ]}
          />
          <Text style={styles.statusText}>
            {connected ? 'Connected' : 'Reconnecting...'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('Collaborators', { recipeId })}
        >
          <Text style={styles.collabLink}>Share</Text>
        </TouchableOpacity>
      </View>

      <PresenceBar userIds={Object.keys(presence)} />

      {!synced ? (
        <Text style={styles.loading}>Loading recipe...</Text>
      ) : (
        <>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={updateTitle}
            placeholder="Recipe Title"
            editable={!isReadOnly}
            placeholderTextColor="#bbb"
          />
          <TextInput
            style={styles.descInput}
            value={description}
            onChangeText={updateDescription}
            placeholder="Add a description..."
            multiline
            editable={!isReadOnly}
            placeholderTextColor="#bbb"
          />

          {/* Ingredients */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Ingredients</Text>
            <Text style={styles.sectionCount}>
              {ingredients.length} items
            </Text>
          </View>
          {ingredients.map((ing, i) => (
            <View key={i} style={styles.ingredientRow}>
              <TextInput
                style={styles.ingQuantity}
                value={ing.quantity}
                onChangeText={(v) => updateIngredient(i, 'quantity', v)}
                placeholder="Qty"
                editable={!isReadOnly}
                keyboardType="numeric"
                placeholderTextColor="#bbb"
              />
              <TextInput
                style={styles.ingUnit}
                value={ing.unit}
                onChangeText={(v) => updateIngredient(i, 'unit', v)}
                placeholder="Unit"
                editable={!isReadOnly}
                placeholderTextColor="#bbb"
              />
              <TextInput
                style={styles.ingName}
                value={ing.name}
                onChangeText={(v) => updateIngredient(i, 'name', v)}
                placeholder="Ingredient name"
                editable={!isReadOnly}
                placeholderTextColor="#bbb"
              />
              {!isReadOnly && (
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => removeIngredient(i)}
                >
                  <Text style={styles.removeBtnText}>x</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
          {!isReadOnly && (
            <TouchableOpacity
              style={styles.addButton}
              onPress={addIngredient}
            >
              <Text style={styles.addButtonText}>+ Add Ingredient</Text>
            </TouchableOpacity>
          )}

          {/* Steps */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Steps</Text>
            <Text style={styles.sectionCount}>{steps.length} steps</Text>
          </View>
          {steps.map((step, i) => (
            <View key={i} style={styles.stepContainer}>
              <View style={styles.stepRow}>
                <View style={styles.stepNumberBadge}>
                  <Text style={styles.stepNumber}>{i + 1}</Text>
                </View>
                <TextInput
                  style={styles.stepInput}
                  value={step.instruction}
                  onChangeText={(v) => updateStep(i, v)}
                  placeholder="Describe this step..."
                  multiline
                  editable={!isReadOnly}
                  placeholderTextColor="#bbb"
                />
                {!isReadOnly && (
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => removeStep(i)}
                  >
                    <Text style={styles.removeBtnText}>x</Text>
                  </TouchableOpacity>
                )}
              </View>
              {step.image_url && (
                <Image
                  source={{ uri: step.image_url }}
                  style={styles.stepImage}
                  resizeMode="cover"
                />
              )}
              {!isReadOnly && (
                <TouchableOpacity
                  style={styles.photoButton}
                  onPress={() => handleAddStepImage(i)}
                >
                  <Text style={styles.photoButtonText}>
                    {step.image_url ? 'Change Photo' : 'Add Photo'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
          {!isReadOnly && (
            <TouchableOpacity style={styles.addButton} onPress={addStep}>
              <Text style={styles.addButtonText}>+ Add Step</Text>
            </TouchableOpacity>
          )}

          <View style={styles.bottomPadding} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
  },
  back: { color: '#FF6B35', fontSize: 16, fontWeight: '500' },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 12, color: '#666' },
  collabLink: { color: '#FF6B35', fontSize: 16, fontWeight: '500' },
  loading: { textAlign: 'center', marginTop: 40, color: '#999', fontSize: 16 },
  titleInput: {
    fontSize: 28,
    fontWeight: 'bold',
    paddingHorizontal: 16,
    marginBottom: 8,
    color: '#1a1a1a',
  },
  descInput: {
    fontSize: 16,
    color: '#666',
    paddingHorizontal: 16,
    marginBottom: 24,
    minHeight: 60,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  sectionCount: { fontSize: 13, color: '#999' },
  ingredientRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 8,
    alignItems: 'center',
  },
  ingQuantity: {
    width: 60,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 10,
    marginRight: 8,
    fontSize: 14,
    backgroundColor: '#fafafa',
  },
  ingUnit: {
    width: 70,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 10,
    marginRight: 8,
    fontSize: 14,
    backgroundColor: '#fafafa',
  },
  ingName: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    backgroundColor: '#fafafa',
  },
  removeBtn: {
    marginLeft: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffebee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeBtnText: { color: '#F44336', fontSize: 14, fontWeight: '600' },
  stepContainer: { paddingHorizontal: 16, marginBottom: 16 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start' },
  stepNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 10,
  },
  stepNumber: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  stepInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    minHeight: 70,
    fontSize: 14,
    textAlignVertical: 'top',
    backgroundColor: '#fafafa',
  },
  stepImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginTop: 10,
    marginLeft: 38,
  },
  photoButton: {
    marginTop: 8,
    marginLeft: 38,
  },
  photoButtonText: { color: '#FF6B35', fontSize: 13, fontWeight: '500' },
  addButton: {
    marginHorizontal: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#FF6B35',
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
    borderStyle: 'dashed',
  },
  addButtonText: { color: '#FF6B35', fontWeight: '600', fontSize: 14 },
  bottomPadding: { height: 60 },
});
