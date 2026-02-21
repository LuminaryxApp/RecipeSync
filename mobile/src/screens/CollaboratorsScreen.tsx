import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import {
  getCollaborators,
  inviteCollaborator,
  removeCollaborator,
  updateCollaboratorRole,
  Collaborator,
} from '../api/collaborators';

type Props = NativeStackScreenProps<RootStackParamList, 'Collaborators'>;

export default function CollaboratorsScreen({ route, navigation }: Props) {
  const { recipeId } = route.params;
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');

  const { data: collaborators } = useQuery({
    queryKey: ['collaborators', recipeId],
    queryFn: () => getCollaborators(recipeId),
  });

  const inviteMutation = useMutation({
    mutationFn: (inviteEmail: string) =>
      inviteCollaborator(recipeId, inviteEmail),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['collaborators', recipeId],
      });
      setEmail('');
      Alert.alert('Success', 'Collaborator invited!');
    },
    onError: () =>
      Alert.alert(
        'Error',
        'Could not invite user. Make sure they have an account.'
      ),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeCollaborator(recipeId, userId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['collaborators', recipeId],
      }),
  });

  const toggleRole = useMutation({
    mutationFn: (collab: Collaborator) =>
      updateCollaboratorRole(
        recipeId,
        collab.user_id,
        collab.role === 'editor' ? 'viewer' : 'editor'
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['collaborators', recipeId],
      }),
  });

  const handleInvite = () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    inviteMutation.mutate(trimmed);
  };

  const handleRemove = (collab: Collaborator) => {
    Alert.alert(
      'Remove Collaborator',
      `Remove ${collab.display_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeMutation.mutate(collab.user_id),
        },
      ]
    );
  };

  const renderCollab = ({ item }: { item: Collaborator }) => (
    <View style={styles.collabRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {item.display_name.slice(0, 2).toUpperCase()}
        </Text>
      </View>
      <View style={styles.collabInfo}>
        <Text style={styles.collabName}>{item.display_name}</Text>
        <Text style={styles.collabEmail}>{item.email}</Text>
      </View>
      <TouchableOpacity
        style={styles.roleBadge}
        onPress={() => toggleRole.mutate(item)}
      >
        <Text style={styles.roleBadgeText}>{item.role}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => handleRemove(item)}
      >
        <Text style={styles.removeButtonText}>Remove</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Collaborators</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.inviteRow}>
        <TextInput
          style={styles.input}
          placeholder="Invite by email..."
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          onSubmitEditing={handleInvite}
          returnKeyType="send"
        />
        <TouchableOpacity
          style={[
            styles.inviteButton,
            !email.trim() && styles.inviteButtonDisabled,
          ]}
          onPress={handleInvite}
          disabled={!email.trim()}
        >
          <Text style={styles.inviteButtonText}>Invite</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={collaborators}
        keyExtractor={(item) => item.user_id}
        renderItem={renderCollab}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No collaborators yet</Text>
            <Text style={styles.emptySubtext}>
              Invite someone to cook together
            </Text>
          </View>
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
  back: { color: '#FF6B35', fontSize: 16, fontWeight: '500' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a' },
  inviteRow: {
    flexDirection: 'row',
    padding: 16,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 14,
    marginRight: 8,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  inviteButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  inviteButtonDisabled: { opacity: 0.4 },
  inviteButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  list: { padding: 16, paddingTop: 0 },
  collabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#fafafa',
    borderRadius: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  collabInfo: { flex: 1 },
  collabName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  collabEmail: { fontSize: 12, color: '#666', marginTop: 2 },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FFF3E0',
    marginRight: 8,
  },
  roleBadgeText: {
    fontSize: 12,
    color: '#FF6B35',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  removeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  removeButtonText: { fontSize: 12, color: '#F44336', fontWeight: '500' },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 16, color: '#999' },
  emptySubtext: { fontSize: 14, color: '#bbb', marginTop: 8 },
});
