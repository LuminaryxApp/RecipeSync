import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const COLORS = ['#FF6B35', '#4CAF50', '#2196F3', '#9C27B0', '#FF9800'];

interface Props {
  userIds: string[];
}

export default function PresenceBar({ userIds }: Props) {
  if (userIds.length === 0) return null;

  return (
    <View style={styles.container}>
      {userIds.map((id, i) => (
        <View
          key={id}
          style={[
            styles.avatar,
            { backgroundColor: COLORS[i % COLORS.length] },
          ]}
        >
          <Text style={styles.avatarText}>
            {id.slice(0, 2).toUpperCase()}
          </Text>
        </View>
      ))}
      <Text style={styles.label}>
        {userIds.length} {userIds.length === 1 ? 'person' : 'people'} editing
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  label: {
    marginLeft: 14,
    fontSize: 12,
    color: '#666',
  },
});
