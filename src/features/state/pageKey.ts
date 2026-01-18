import { useMinimapKey, useViewTitle } from './viewStore'

export const composePageKeyFrom = (title: string | null | undefined, minimapKey: string | null | undefined) => {
    const cleanedTitle = title?.includes('live') ? 'song' : title?.replace(/\./, '')
    const mapStr = (minimapKey || '').replace(/l/g, 's')
    return `${cleanedTitle ?? ''}${mapStr}`.toLowerCase()
}

export const useComposedPageKey = () => {
    const [title] = useViewTitle()
    const [minimapKey] = useMinimapKey()
    return composePageKeyFrom(title, minimapKey)
}
