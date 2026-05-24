import React, { useState, useEffect } from 'react'
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform, Alert,
} from 'react-native'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { useStore } from '../store/useStore'
import { ItemType, StatusType } from '../types'
import { colors, spacing, radius, fontSize, shadow } from '../theme'
import { RootStackParamList } from '../navigation/types'

type Route = RouteProp<RootStackParamList, 'AddItem'>

const TYPES: { value: ItemType; label: string; color: string; emoji: string }[] = [
  { value: 'book',  label: '도서',   color: colors.book,  emoji: '📚' },
  { value: 'movie', label: '영화',  color: colors.movie, emoji: '🎬' },
  { value: 'drama', label: '드라마', color: colors.drama, emoji: '📺' },
]
const STATUSES: { value: StatusType; label: string }[] = [
  { value: 'want',  label: '볼 예정' },
  { value: 'doing', label: '보는 중' },
  { value: 'done',  label: '완료' },
  { value: 'paused',label: '중단' },
]

export default function AddItemScreen() {
  const navigation = useNavigation()
  const route = useRoute<Route>()
  const { addItem, updateItem, items } = useStore()

  const editItem = route.params?.editItemId
    ? items.find(i => i.id === route.params?.editItemId)
    : undefined

  const [type, setType]     = useState<ItemType>(editItem?.item_type ?? 'book')
  const [status, setStatus] = useState<StatusType>(editItem?.status ?? 'want')
  const [title, setTitle]   = useState(editItem?.title ?? '')
  const [author, setAuthor] = useState(editItem?.author ?? '')
  const [genre, setGenre]   = useState(editItem?.genre ?? '')
  const [year, setYear]     = useState(editItem?.year ? String(editItem.year) : '')
  const [rating, setRating] = useState(editItem?.rating ? String(editItem.rating) : '')
  const [memo, setMemo]     = useState(editItem?.memo ?? '')
  const [saving, setSaving] = useState(false)

  const isEdit = !!editItem

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('제목을 입력해주세요'); return }
    setSaving(true)
    try {
      const data = {
        item_type: type, status, title: title.trim(),
        author: author.trim() || undefined,
        genre: genre.trim() || undefined,
        year: year ? parseInt(year) : undefined,
        rating: rating ? parseFloat(rating) : undefined,
        memo: memo.trim() || undefined,
      }
      if (isEdit && editItem) {
        await updateItem(editItem.id, data)
      } else {
        await addItem(data)
      }
      navigation.goBack()
    } catch (e) {
      Alert.alert('저장 실패', String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.cancel}>취소</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEdit ? '편집' : '새 기록'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            <Text style={[styles.save, saving && { opacity: 0.5 }]}>저장</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Type selector */}
          <Text style={styles.label}>유형</Text>
          <View style={styles.typeRow}>
            {TYPES.map(t => (
              <TouchableOpacity
                key={t.value}
                style={[styles.typeBtn, type === t.value && { backgroundColor: t.color, borderColor: t.color }]}
                onPress={() => setType(t.value)}
              >
                <Text style={styles.typeEmoji}>{t.emoji}</Text>
                <Text style={[styles.typeLabel, type === t.value && { color: colors.white }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Status selector */}
          <Text style={styles.label}>상태</Text>
          <View style={styles.statusRow}>
            {STATUSES.map(s => (
              <TouchableOpacity
                key={s.value}
                style={[styles.statusBtn, status === s.value && styles.statusBtnActive]}
                onPress={() => setStatus(s.value)}
              >
                <Text style={[styles.statusLabel, status === s.value && styles.statusLabelActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Fields */}
          <Field label="제목 *" value={title} onChange={setTitle} placeholder="제목을 입력하세요" />
          <Field
            label={type === 'book' ? '저자' : '감독 / 출연'}
            value={author} onChange={setAuthor}
            placeholder={type === 'book' ? '저자명' : '감독 또는 출연진'}
          />
          <Field label="장르" value={genre} onChange={setGenre} placeholder="예: 판타지, 로맨스" />
          <Field label="연도" value={year} onChange={setYear} placeholder="예: 2024" keyboardType="numeric" />

          {/* Rating */}
          <Text style={styles.label}>별점</Text>
          <View style={styles.starsRow}>
            {[1,2,3,4,5].map(s => (
              <TouchableOpacity
                key={s}
                onPress={() => setRating(rating === String(s) ? '' : String(s))}
              >
                <Text style={[styles.starBtn, parseFloat(rating) >= s && { color: colors.star }]}>★</Text>
              </TouchableOpacity>
            ))}
            {rating ? <Text style={styles.ratingVal}>{rating}</Text> : null}
          </View>

          <Field
            label="메모"
            value={memo} onChange={setMemo}
            placeholder="감상, 인상 깊은 점 등 자유롭게..."
            multiline numberOfLines={4}
          />

          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Field({
  label, value, onChange, placeholder, multiline, numberOfLines, keyboardType
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; multiline?: boolean; numberOfLines?: number; keyboardType?: any
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={fStyles.label}>{label}</Text>
      <TextInput
        style={[fStyles.input, multiline && { height: 100, textAlignVertical: 'top', paddingTop: spacing.sm }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        multiline={multiline}
        numberOfLines={numberOfLines}
        keyboardType={keyboardType ?? 'default'}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  cancel: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: '500' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  save: { fontSize: fontSize.md, color: colors.primary, fontWeight: '700' },
  scroll: { padding: spacing.md },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  typeBtn: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.sm,
    borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border,
    backgroundColor: colors.surface, gap: 4,
  },
  typeEmoji: { fontSize: 22 },
  typeLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  statusRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.lg, flexWrap: 'wrap' },
  statusBtn: {
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statusBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusLabel: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '500' },
  statusLabelActive: { color: colors.white, fontWeight: '700' },
  starsRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.lg,
  },
  starBtn: { fontSize: 32, color: colors.border },
  ratingVal: { fontSize: fontSize.md, fontWeight: '700', color: colors.star, marginLeft: 8 },
})

const fStyles = StyleSheet.create({
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1.5,
    borderColor: colors.border, paddingHorizontal: spacing.md, height: 48,
    fontSize: fontSize.md, color: colors.text, ...shadow.sm,
  },
})
