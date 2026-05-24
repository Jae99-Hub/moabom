export type RootStackParamList = {
  Home: undefined
  Detail: { itemId: number }
  AddItem: { editItemId?: number } | undefined
}
