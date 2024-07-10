import { Protocol } from 'router51'
import { ChainId } from 'core5'

export const S3_POOL_CACHE_KEY = (baseKey: string, chain: ChainId, protocol: Protocol) =>
  `${baseKey}-${chain}-${protocol}`
