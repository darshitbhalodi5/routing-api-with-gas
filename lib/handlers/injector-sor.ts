import { Token, ChainId } from 'core5'
import {
  CachingGasStationProvider,
  CachingTokenListProvider,
  CachingTokenProviderWithFallback,
  CachingV3PoolProvider,
  EIP1559GasPriceProvider,
  FallbackTenderlySimulator,
  TenderlySimulator,
  EthEstimateGasSimulator,
  IGasPriceProvider,
  IMetric,
  Simulator,
  ITokenListProvider,
  ITokenPropertiesProvider,
  ITokenProvider,
  // IV2PoolProvider,
  // IV2SubgraphProvider,
  IV3PoolProvider,
  IV3SubgraphProvider,
  LegacyGasPriceProvider,
  NodeJSCache,
  OnChainGasPriceProvider,
  OnChainQuoteProvider,
  setGlobalLogger,
  // StaticV2SubgraphProvider,
  StaticV3SubgraphProvider,
  TokenPropertiesProvider,
  TokenProvider,
  TokenValidatorProvider, 
  UniswapMulticallProvider,
  // V2PoolProvider,
  // V2QuoteProvider,
  V3PoolProvider,
  IRouteCachingProvider,
} from 'sor5'
import { TokenList } from 'udonswap-token-lists'
import { default as bunyan, default as Logger } from 'bunyan'
import { ethers } from 'ethers'
import _ from 'lodash'
import NodeCache from 'node-cache'
import UNSUPPORTED_TOKEN_LIST from './../config/unsupported.tokenlist.json'
import { BaseRInj, Injector } from './handler'
import { V3AWSSubgraphProvider } from './router-entities/aws-subgraph-provider'
import { AWSTokenListProvider } from './router-entities/aws-token-list-provider'
import { DynamoRouteCachingProvider } from './router-entities/route-caching/dynamo-route-caching-provider'
import { OnChainTokenFeeFetcher } from 'sor5/build/main/providers/token-fee-fetcher'
import { PortionProvider } from 'sor5/build/main/providers/portion-provider'


export const SUPPORTED_CHAINS: ChainId[] = [ChainId.MODE]
const DEFAULT_TOKEN_LIST = 'https://udonswap-tokenlist.vercel.app/v3-tokens'

export interface RequestInjected<Router> extends BaseRInj {
  chainId: ChainId
  metric: IMetric
  v3PoolProvider: IV3PoolProvider
  // v2PoolProvider: IV2PoolProvider
  tokenProvider: ITokenProvider
  tokenListProvider: ITokenListProvider
  router: Router
}

export type ContainerDependencies = {
  provider: ethers.providers.JsonRpcProvider
  v3SubgraphProvider: IV3SubgraphProvider
  // v2SubgraphProvider: IV2SubgraphProvider
  tokenListProvider: ITokenListProvider
  gasPriceProvider: IGasPriceProvider
  tokenProviderFromTokenList: ITokenProvider
  blockedTokenListProvider: ITokenListProvider
  v3PoolProvider: IV3PoolProvider
  // v2PoolProvider: IV2PoolProvider
  tokenProvider: ITokenProvider
  multicallProvider: UniswapMulticallProvider
  onChainQuoteProvider?: OnChainQuoteProvider
  // v2QuoteProvider: V2QuoteProvider
  simulator: Simulator
  routeCachingProvider?: IRouteCachingProvider
  tokenValidatorProvider: TokenValidatorProvider
  tokenPropertiesProvider: ITokenPropertiesProvider 
}

export interface ContainerInjected {
  dependencies: {
    [chainId in ChainId]?: ContainerDependencies
  }
}

export abstract class InjectorSOR<Router, QueryParams> extends Injector<
  ContainerInjected,
  RequestInjected<Router>,
  void,
  QueryParams
> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    const log: Logger = bunyan.createLogger({
      name: this.injectorName,
      serializers: bunyan.stdSerializers,
      level: bunyan.INFO,
    })
    setGlobalLogger(log)

    const { POOL_CACHE_BUCKET_2, POOL_CACHE_KEY, TOKEN_LIST_CACHE_BUCKET, CACHED_ROUTES_TABLE_NAME } = process.env

    const dependenciesByChain: {
      [chainId in ChainId]?: ContainerDependencies
    } = {}

    const dependenciesByChainArray = await Promise.all(
      _.map(SUPPORTED_CHAINS, async (chainId: ChainId) => {
        const url = 'https://sepolia.mode.network'

        if (!url) {
          log.fatal({ chainId: chainId }, `Fatal: No Web3 RPC endpoint set for chain`)
          return { chainId, dependencies: {} as ContainerDependencies }
          // This router instance will not be able to route through any chain
          // for which RPC URL is not set
          // For now, if RPC URL is not set for a chain, a request to route
          // on the chain will return Err 500
        }

        let timeout: number
        switch (chainId) {
          // case ChainId.ARBITRUM_ONE:
          // case ChainId.ARBITRUM_RINKEBY:
          //   timeout = 8000
          //   break
          default:
            timeout = 5000
            break
        }

        const provider = new ethers.providers.JsonRpcProvider(
          {
            url: url,
            timeout,
          },
          chainId
        )

        const tokenListProvider = await AWSTokenListProvider.fromTokenListS3Bucket(
          chainId,
          TOKEN_LIST_CACHE_BUCKET!,
          DEFAULT_TOKEN_LIST
        )

        const tokenCache = new NodeJSCache<Token>(new NodeCache({ stdTTL: 3600, useClones: false }))
        const blockedTokenCache = new NodeJSCache<Token>(new NodeCache({ stdTTL: 3600, useClones: false }))

        const multicall2Provider = new UniswapMulticallProvider(chainId, provider, 375_000)
        const tokenProvider = new CachingTokenProviderWithFallback(
          chainId,
          tokenCache,
          tokenListProvider,
          new TokenProvider(chainId, multicall2Provider)
        )
        
        const tokenFeeFetcher = new OnChainTokenFeeFetcher(chainId, provider)
          const tokenValidatorProvider = new TokenValidatorProvider(
            chainId,
            multicall2Provider,
            new NodeJSCache(new NodeCache({ stdTTL: 30000, useClones: false }))
          )
          const tokenPropertiesProvider = new TokenPropertiesProvider(
            chainId,
            new NodeJSCache(new NodeCache({ stdTTL: 30000, useClones: false })),
            tokenFeeFetcher
          )
        // Some providers like Infura set a gas limit per call of 10x block gas which is approx 150m
        // 200*725k < 150m
        let quoteProvider: OnChainQuoteProvider | undefined = undefined
        switch (chainId) {
          // case ChainId.ROLLUX_TANENBAUM:
          case ChainId.MODE:
            quoteProvider = new OnChainQuoteProvider(
              chainId,
              provider,
              multicall2Provider,
              {
                retries: 2,
                minTimeout: 100,
                maxTimeout: 1000,
              },
              {
                multicallChunk: 110,
                gasLimitPerCall: 1_200_000,
                quoteMinSuccessRate: 0.1,
              },
              {
                gasLimitOverride: 3_000_000,
                multicallChunk: 45,
              },
              {
                gasLimitOverride: 3_000_000,
                multicallChunk: 45,
              },
              {
                baseBlockOffset: -25,
                rollback: {
                  enabled: true,
                  attemptsBeforeRollback: 1,
                  rollbackBlockOffset: -20,
                },
              }
            )
            break
          // case ChainId.ARBITRUM_ONE:
          // case ChainId.ARBITRUM_RINKEBY:
          //   quoteProvider = new OnChainQuoteProvider(
          //     chainId,
          //     provider,
          //     multicall2Provider,
          //     {
          //       retries: 2,
          //       minTimeout: 100,
          //       maxTimeout: 1000,
          //     },
          //     {
          //       multicallChunk: 15,
          //       gasLimitPerCall: 15_000_000,
          //       quoteMinSuccessRate: 0.15,
          //     },
          //     {
          //       gasLimitOverride: 30_000_000,
          //       multicallChunk: 8,
          //     },
          //     {
          //       gasLimitOverride: 30_000_000,
          //       multicallChunk: 8,
          //     },
          //     {
          //       baseBlockOffset: 0,
          //       rollback: {
          //         enabled: true,
          //         attemptsBeforeRollback: 1,
          //         rollbackBlockOffset: -10,
          //       },
          //     }
          //   )
          //   break
        }

        const v3PoolProvider = new CachingV3PoolProvider(
          chainId,
          new V3PoolProvider(chainId, multicall2Provider),
          new NodeJSCache(new NodeCache({ stdTTL: 180, useClones: false }))
        )

        // const v2PoolProvider = new V2PoolProvider(chainId, multicall2Provider)
        const portionProvider = new PortionProvider()
        const tenderlySimulator = new TenderlySimulator(
          chainId,
          'http://api.tenderly.co',
          process.env.TENDERLY_USER!,
          process.env.TENDERLY_PROJECT!,
          process.env.TENDERLY_ACCESS_KEY!,
          // v2PoolProvider,
          v3PoolProvider,
          provider,
          portionProvider,
          { [ChainId.MODE]: 2.5 }
        )

        const ethEstimateGasSimulator = new EthEstimateGasSimulator(chainId, provider, v3PoolProvider, portionProvider)

        const simulator = new FallbackTenderlySimulator(chainId, provider, portionProvider, tenderlySimulator, ethEstimateGasSimulator)

        const [v3SubgraphProvider] = await Promise.all([
          (async () => {
            try {
              const subgraphProvider = await V3AWSSubgraphProvider.EagerBuild(
                POOL_CACHE_BUCKET_2!,
                POOL_CACHE_KEY!,
                chainId
              )
              console.log('subgraph provider, bucket, key and chainid: ', {subgraphProvider,POOL_CACHE_BUCKET_2,
                POOL_CACHE_KEY,
                chainId})
              return subgraphProvider
            } catch (err) {
              log.error({ err }, 'AWS Subgraph Provider unavailable, defaulting to Static Subgraph Provider')
              return new StaticV3SubgraphProvider(chainId, v3PoolProvider)
            }
          })(),
          // (async () => {
          //   try {
          //     const subgraphProvider = await V2AWSSubgraphProvider.EagerBuild(
          //       POOL_CACHE_BUCKET_2!,
          //       POOL_CACHE_KEY!,
          //       chainId
          //     )
          //     return subgraphProvider
          //   } catch (err) {
          //     return new StaticV2SubgraphProvider(chainId)
          //   }
          // })(),
        ])

        let routeCachingProvider: IRouteCachingProvider | undefined = undefined
        if (CACHED_ROUTES_TABLE_NAME && CACHED_ROUTES_TABLE_NAME !== '') {
          routeCachingProvider = new DynamoRouteCachingProvider({ cachedRoutesTableName: CACHED_ROUTES_TABLE_NAME })
        }

        return {
          chainId,
          dependencies: {
            provider,
            tokenListProvider: await AWSTokenListProvider.fromTokenListS3Bucket(
              chainId,
              TOKEN_LIST_CACHE_BUCKET!,
              DEFAULT_TOKEN_LIST
            ),
            blockedTokenListProvider: await CachingTokenListProvider.fromTokenList(
              chainId,
              UNSUPPORTED_TOKEN_LIST as TokenList,
              blockedTokenCache
            ),
            multicallProvider: multicall2Provider,
            tokenProvider,
            tokenProviderFromTokenList: tokenListProvider,
            gasPriceProvider: new CachingGasStationProvider(
              chainId,
              new OnChainGasPriceProvider(
                chainId,
                new EIP1559GasPriceProvider(provider),
                new LegacyGasPriceProvider(provider)
              ),
              new NodeJSCache(new NodeCache({ stdTTL: 15, useClones: false }))
            ),
            v3SubgraphProvider,
            onChainQuoteProvider: quoteProvider,
            v3PoolProvider,
            // v2PoolProvider,
            // v2QuoteProvider: new V2QuoteProvider(),
            // v2SubgraphProvider,
            simulator,
            routeCachingProvider,
            tokenValidatorProvider,
            tokenPropertiesProvider,
          },
        }
      })
    )

    for (const { chainId, dependencies } of dependenciesByChainArray) {
      dependenciesByChain[chainId] = dependencies
    }

    return {
      dependencies: dependenciesByChain,
    }
  }
}
