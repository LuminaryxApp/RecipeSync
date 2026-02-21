import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  RefreshControl,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import {
  getRecipes,
  createRecipe,
  deleteRecipe,
  Recipe,
} from '../api/recipes';
import { useAuth } from '../context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState('');

  const {
    data: recipes,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['recipes'],
    queryFn: getRecipes,
  });

  const createMutation = useMutation({
    mutationFn: (title: string) => createRecipe(title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      setNewTitle('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRecipe,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['recipes'] }),
  });

  const handleDelete = (id: string) => {
    Alert.alert('Delete Recipe', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(id),
      },
    ]);
  };

  const handleCreate = () => {
    const title = newTitle.trim();
    if (!title) return;
    createMutation.mutate(title);
  };

  const renderRecipe = ({ item }: { item: Recipe }) => (
    <TouchableOpacity
      style={styles.recipeCard}
      onPress={() =>
        navigation.navigate('RecipeEditor', {
          recipeId: item.id,
          mode: item.owner_id === user?.id ? 'edit' : 'edit',
        })
      }
      onLongPress={() => handleDelete(item.id)}
    >
      <View style={styles.recipeCardHeader}>
        <Text style={styles.recipeTitle}>{item.title}</Text>
        {item.difficulty && (
          <Text
            style={[
              styles.badge,
              item.difficulty === 'easy' && styles.badgeEasy,
              item.difficulty === 'medium' && styles.badgeMedium,
              item.difficulty === 'hard' && styles.badgeHard,
            ]}
          >
            {item.difficulty}
          </Text>
        )}
      </View>
      {item.description && (
        <Text style={styles.recipeDesc} numberOfLines={2}>
          {item.description}
        </Text>
      )}
      <View style={styles.recipeFooter}>
        {item.prep_time_minutes && (
          <Text style={styles.metaText}>
            Prep: {item.prep_time_minutes}m
          </Text>
        )}
        {item.cook_time_minutes && (
          <Text style={styles.metaText}>
            Cook: {item.cook_time_minutes}m
          </Text>
        )}
        {item.servings && (
          <Text style={styles.metaText}>
            Serves: {item.servings}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Recipes</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
          <Text style={styles.profileLink}>{user?.display_name}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.createRow}>
        <TextInput
          style={styles.input}
          placeholder="New recipe name..."
          value={newTitle}
          onChangeText={setNewTitle}
          onSubmitEditing={handleCreate}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[
            styles.addButton,
            !newTitle.trim() && styles.addButtonDisabled,
          ]}
          onPress={handleCreate}
          disabled={!newTitle.trim()}
        >
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={recipes}
        keyExtractor={(item) => item.id}
        renderItem={renderRecipe}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} />
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No recipes yet</Text>
              <Text style={styles.emptySubtext}>
                Create your first recipe above
              </Text>
            </View>
          ) : null
        }
      />
    </View>
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
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1a1a1a' },
  profileLink: { fontSize: 14, color: '#FF6B35', fontWeight: '500' },
  createRow: {
    flexDirection: 'row',
    padding: 16,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginRight: 8,
    backgroundColor: '#fafafa',
  },
  addButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    width: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonDisabled: {
    opacity: 0.4,
  },
  addButtonText: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  list: { padding: 16, paddingTop: 0 },
  recipeCard: {
    backgroundColor: '#fafafa',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  recipeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recipeTitle: { fontSize: 18, fontWeight: '600', color: '#1a1a1a', flex: 1 },
  recipeDesc: { fontSize: 14, color: '#666', marginTop: 6 },
  recipeFooter: { flexDirection: 'row', marginTop: 12, gap: 12 },
  metaText: { fontSize: 12, color: '#999' },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
    textTransform: 'capitalize',
    marginLeft: 8,
  },
  badgeEasy: { backgroundColor: '#E8F5E9', color: '#2E7D32' },
  badgeMedium: { backgroundColor: '#FFF3E0', color: '#E65100' },
  badgeHard: { backgroundColor: '#FFEBEE', color: '#C62828' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 18, color: '#999', fontWeight: '500' },
  emptySubtext: { fontSize: 14, color: '#bbb', marginTop: 8 },
});
