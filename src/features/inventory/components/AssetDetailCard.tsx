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
  card: { borderRadius: 16, borderWidth: 1, borderColor: '#e6e7ea', backgroundColor: '#fff', padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  header: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  assetType: { fontSize: 12, fontWeight: '700', letterSpacing: 1.6, color: '#b45309' },
  badge: { borderRadius: 999, backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '500', color: '#475569' },
  title: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  subtitle: { marginTop: 4, fontSize: 14, color: '#475569' },
  code: { marginTop: 12, fontSize: 14, fontWeight: '600', color: '#3f3f46' },
  description: { marginTop: 4, fontSize: 14, color: '#71717a' },
});
