import React, { useState } from 'react'
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Alert,
} from 'react-native'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useStore } from '../store/useStore'
import { colors, spacing, radius, fontSize, shadow } from '../theme'
import { RootStackParamList } from '../navigation/types'

type Nav = NativeStackNavigationProp<RootStackParamList>
type Route = RouteProp<RootStackParamList, 'Detail'>

const STATUS_LABEL: Record<string, string> = {
  want: '볼 예정', doing: '보는 중', done: '시청 완료', paused: '중단'
}
const STATUS_COLOR: Record<string, string> = {
  want: colors.want, doing: colors.doing, done: colors.done, paused: colors.paused
}
const TYPE_COLOR: Record<string, string> = {
  book: colors.book, movie: colors.movie, drama: colors.drama
}
const TYPE_LABEL: Record<string, string> = {
  book: '도서', movie: '영화', drama: '드라마'
}

export default function DetailScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const { items, deleteItem } = useStore()
  const item = items.find(i => i.id === route.params.itemId)

  if (!item) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={{ textAlign: 'center', marginTop: 40, color: colors.textSecondary }}>
          항목을 찾을 수 없습니다
        </Text>
      </SafeAreaView>
    )
  }

  const typeColor = TYPE_COLOR[item.item_type]
  const statusColor = STATUS_COLOR[item.status]

  const handleDelete = () => {
    Alert.alert('삭제', `"${item.title}"을(를) 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: async () => { await deleteItem(item.id); navigation.goBack() }
      },
    ])
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => navigation.navigate('AddItem', { editItemId: item.id })}
          >
            <Text style={styles.editBtnText}>편집</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
            <Text style={styles.deleteBtnText}>🗑</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Cover + title block */}
        <View style={styles.heroBlock}>
          <View style={[styles.cover, { backgroundColor: typeColor + '22' }]}>
            {item.cover_url ? (
              <Image source={{ uri: item.cover_url }} style={styles.coverImg} resizeMode="cover" />
            ) : (
              <Text style={styles.coverEmoji}>
                {item.item_type === 'book' ? '📚' : item.item_type === 'movie' ? '🎬' : '📺'}
              </Text>
            )}
          </View>

          <View style={styles.titleBlock}>
            <View style={[styles.typeBadge, { backgroundColor: typeColor + '1A', borderColor: typeColor + '55' }]}>
              <Text style={[styles.typeLabel, { color: typeColor }]}>{TYPE_LABEL[item.item_type]}</Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            {item.subtitle && <Text style={styles.subtitle}>{item.subtitle}</Text>}
            {item.author && <Text style={styles.author}>{item.author}</Text>}

            {/* Rating */}
            {item.rating !== undefined && (
              <View style={styles.ratingRow}>
                {[1,2,3,4,5].map(s => (
                  <Text key={s} style={[styles.starIcon, { color: s <= item.rating! ? colors.star : colors.border }]}>
                    ★
                  </Text>
                ))}
                <Text style={styles.ratingNum}>{item.rating.toFixed(1)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Status */}
        <View style={[styles.statusRow, { backgroundColor: statusColor + '15', borderColor: statusColor + '40' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABEL[item.status]}</Text>
        </View>

        {/* Meta info */}
        <View style={styles.metaCard}>
          {item.year && <MetaRow label="연도" value={String(item.year)} />}
          {item.genre && <MetaRow label="장르" value={item.genre} />}
        </View>

        {/* Description */}
        {item.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>소개</Text>
            <Text style={styles.description}>{item.description}</Text>
          </View>
        )}

        {/* Memo */}
        {item.memo && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>메모</Text>
            <View style={styles.memoBox}>
              <Text style={styles.memoText}>{item.memo}</Text>
            </View>
          </View>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  backBtn: { padding: spacing.xs },
  backText: { fontSize: fontSize.xl, color: colors.primary, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editBtn: {
    backgroundColor: colors.primary + '18', paddingHorizontal: spacing.md,
    paddingVertical: 6, borderRadius: radius.full,
  },
  editBtnText: { color: colors.primary, fontWeight: '700', fontSize: fontSize.sm },
  deleteBtn: { padding: spacing.xs },
  deleteBtnText: { fontSize: 20 },
  scroll: { paddingHorizontal: spacing.md },
  heroBlock: {
    flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md,
  },
  cover: {
    width: 110, height: 150, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    flexShrink: 0, ...shadow.md,
  },
  coverImg: { width: '100%', height: '100%' },
  coverEmoji: { fontSize: 40 },
  titleBlock: { flex: 1, justifyContent: 'flex-start', gap: 6 },
  typeBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radius.full, borderWidth: 1,
  },
  typeLabel: { fontSize: fontSize.xs, fontWeight: '700' },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text, lineHeight: 26 },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary },
  author: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: '500' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  starIcon: { fontSize: 20 },
  ratingNum: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginLeft: 4 },
  statusRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.lg, borderWidth: 1,
    marginBottom: spacing.md,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontWeight: '700', fontSize: fontSize.md },
  metaCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md, ...shadow.sm,
  },
  metaRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  metaLabel: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '500' },
  metaValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  section: { marginBottom: spacing.md },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  description: { fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 24 },
  memoBox: {
    backgroundColor: colors.primaryLight + '12', borderRadius: radius.lg,
    padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  memoText: { fontSize: fontSize.md, color: colors.text, lineHeight: 24 },
})
