import React, { useEffect, useState } from 'react'
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useStore } from '../store/useStore'
import ItemCard from '../components/ItemCard'
import { colors, spacing, radius, fontSize, shadow } from '../theme'
import { RootStackParamList } from '../navigation/types'

type Nav = NativeStackNavigationProp<RootStackParamList>

const TYPE_TABS = [
  { value: 'all', label: '전체' },
  { value: 'book', label: '도서' },
  { value: 'movie', label: '영화' },
  { value: 'drama', label: '드라마' },
] as const

const STATUS_TABS = [
  { value: 'all', label: '전체' },
  { value: 'want', label: '볼 예정' },
  { value: 'doing', label: '보는 중' },
  { value: 'done', label: '완료' },
  { value: 'paused', label: '중단' },
] as const

export default function HomeScreen() {
  const navigation = useNavigation<Nav>()
  const { fetchAll, filteredItems, filterType, filterStatus, searchQuery,
    setFilterType, setFilterStatus, setSearchQuery, isLoading, items } = useStore()

  useEffect(() => { fetchAll() }, [])

  const data = filteredItems()

  const bookCount  = items.filter(i => i.item_type === 'book').length
  const movieCount = items.filter(i => i.item_type === 'movie').length
  const dramaCount = items.filter(i => i.item_type === 'drama').length

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>모아봄</Text>
          <Text style={styles.subtitle}>
            도서 {bookCount} · 영화 {movieCount} · 드라마 {dramaCount}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('AddItem', {})}
        >
          <Text style={styles.addBtnText}>+ 추가</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="제목, 저자 검색..."
          placeholderTextColor={colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Text style={styles.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Type tabs */}
      <View style={styles.tabRow}>
        {TYPE_TABS.map(tab => (
          <TouchableOpacity
            key={tab.value}
            style={[styles.tab, filterType === tab.value && styles.tabActive]}
            onPress={() => setFilterType(tab.value)}
          >
            <Text style={[styles.tabText, filterType === tab.value && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Status chips */}
      <View style={styles.chipRow}>
        {STATUS_TABS.map(tab => (
          <TouchableOpacity
            key={tab.value}
            style={[styles.chip, filterStatus === tab.value && styles.chipActive]}
            onPress={() => setFilterStatus(tab.value)}
          >
            <Text style={[styles.chipText, filterStatus === tab.value && styles.chipTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Count */}
      <Text style={styles.countText}>{data.length}개</Text>

      {/* List */}
      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : data.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📭</Text>
          <Text style={styles.emptyText}>아직 기록이 없어요</Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => navigation.navigate('AddItem', {})}
          >
            <Text style={styles.emptyBtnText}>첫 번째 기록 추가하기</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={item => String(item.id)}
          renderItem={({ item }) => (
            <ItemCard item={item} onPress={() => navigation.navigate('Detail', { itemId: item.id })} />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  appName: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  addBtn: {
    backgroundColor: colors.primary, paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, borderRadius: radius.full,
  },
  addBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    marginHorizontal: spacing.md, marginBottom: spacing.sm, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, ...shadow.sm,
  },
  searchIcon: { fontSize: 16, marginRight: spacing.sm },
  searchInput: {
    flex: 1, height: 44, fontSize: fontSize.md, color: colors.text,
  },
  clearBtn: { fontSize: 16, color: colors.textTertiary, padding: spacing.xs },
  tabRow: {
    flexDirection: 'row', paddingHorizontal: spacing.md, gap: spacing.xs, marginBottom: spacing.xs,
  },
  tab: {
    paddingHorizontal: spacing.md, paddingVertical: 7,
    borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1.5,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.white },
  chipRow: {
    flexDirection: 'row', paddingHorizontal: spacing.md, gap: spacing.xs,
    marginBottom: spacing.sm, flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primaryLight + '22', borderColor: colors.primaryLight },
  chipText: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '500' },
  chipTextActive: { color: colors.primary, fontWeight: '700' },
  countText: {
    fontSize: fontSize.sm, color: colors.textTertiary,
    paddingHorizontal: spacing.md, marginBottom: spacing.xs,
  },
  list: { paddingTop: spacing.xs, paddingBottom: 100 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyEmoji: { fontSize: 48 },
  emptyText: { fontSize: fontSize.lg, color: colors.textSecondary, fontWeight: '500' },
  emptyBtn: {
    backgroundColor: colors.primary, paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm, borderRadius: radius.full,
  },
  emptyBtnText: { color: colors.white, fontWeight: '700' },
})
