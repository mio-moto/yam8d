import { atom } from 'jotai'

// VJ Mode: which numpad key is currently active ('0'-'9', or null)
export const vjActiveKeyAtom = atom<string | null>(null)
