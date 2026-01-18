import { audio } from './audio'
import { connection } from './connection'

export const device = () => {
    return {
        audio: audio(),
        connection: connection(),
    } as const
}
