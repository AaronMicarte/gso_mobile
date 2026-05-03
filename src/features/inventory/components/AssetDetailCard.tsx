import React from 'react';
import { Text, View, StyleSheet } from 'react-native';

interface AssetDetailCardProps {
  assetType: 'RPCPPE' | 'RPCSEP';
  title: string;
  subtitle?: string | null;
  code?: string | null;
  description?: string | null;
}

export function AssetDetailCard({
  assetType,
  title,
  subtitle,
  code,
  description,
}: AssetDetailCardProps): React.JSX.Element {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.assetType}>{assetType}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Asset Detail</Text>
        </View>
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {code ? <Text style={styles.code}>Code: {code}</Text> : null}
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, borderColor: '#263552', backgroundColor: '#0b1220', padding: 16 },
  header: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  assetType: { fontSize: 12, fontWeight: '700', letterSpacing: 1.6, color: '#93c5fd' },
  badge: { borderRadius: 999, backgroundColor: '#1e293b', paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: '#334463' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#c5d5ef' },
  title: { fontSize: 18, fontWeight: '700', color: '#f8fafc' },
  subtitle: { marginTop: 4, fontSize: 14, color: '#c5d5ef' },
  code: { marginTop: 12, fontSize: 14, fontWeight: '700', color: '#dbe7ff' },
  description: { marginTop: 4, fontSize: 13, color: '#9bb0d2' },
});
