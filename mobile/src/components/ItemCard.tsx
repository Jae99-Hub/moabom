import React from 'react'
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native'
import { Item } from '../types'
import { colors, spacing, radius, fontSize, shadow } from '../theme'

const STATUS_LABEL: Record<string, string> = {
  want: '볼 예정', doing: '보는 중', done: '시청 완료', paused: '중단'
}
const STATUS_COLOR: Record<string, string> = {
  want: colors.want, doing: colors.doing, done: colors.done, paused: colors.paused
}
const TYPE_COLOR: Record<string, string> = {
  book: colors.book, movie: colors.movie, drama: colors.drama
}

interface Props {
  item: Item
  onPress: () => void
}

export default function ItemCard({ item, onPress }: Props) {
  const typeColor = TYPE_COLOR[item.item_type]
  const statusColor = STATUS_COLOR[item.status]

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      {/* Cover */}
      <View style={[styles.cover, { backgroundColor: typeColor + '22' }]}>
        {item.cover_url ? (
          <Image source={{ uri: item.cover_url }} style={styles.coverImg} resizeMode="cover" />
        ) : (
          <Text style={[styles.coverEmoji]}>
            {item.item_type === 'book' ? '📚' : item.item_type === 'movie' ? '🎬' : '📺'}
          </Text>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.typeRow}>
          <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
          <Text style={[styles.typeLabel, { color: typeColor }]}>
            {item.item_type === 'book' ? '도서' : item.item_type === 'movie' ? '영화' : '드라마'}
          </Text>
        </View>

        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        {item.author && <Text style={styles.author} numberOfLines={1}>{item.author}</Text>}

        <View style={styles.bottomRow}>
          {item.rating ? (
            <View style={styles.ratingRow}>
              <Text style={styles.star}>★</Text>
              <Text style={styles.rating}>{item.rating.toFixed(1)}</Text>
            </View>
          ) : <View />}
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '1A', borderColor: statusColor + '55' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABEL[item.status]}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    ...shadow.sm,
  },
  cover: {
    width: 72,
    height: 96,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  coverImg: {
    width: '100%',
    height: '100%',
  },
  coverEmoji: {
    fontSize: 30,
  },
  info: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  typeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  typeLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 20,
    flex: 1,
  },
  author: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  star: {
    color: colors.star,
    fontSize: fontSize.sm,
  },
  rating: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
})
