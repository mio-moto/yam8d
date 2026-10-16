import { audio } from './audio'
import { connection } from '../../../packages/m8-sdk/src/engine/connection'

export const device = () => {
    return {
        audio: audio(),
        connection: connection(),
    } as const
}
