import { V3Route } from 'sor5/build/main/routers'
import { Protocol } from 'router51'
import { MarshalledToken, TokenMarshaller } from './token-marshaller'
import { MarshalledPool, PoolMarshaller } from './pool-marshaller'
import { Pool } from 'v35/dist/entities/'

// export interface MarshalledV1Route {
//   protocol: Protocol
//   input: MarshalledToken
//   output: MarshalledToken
//   pairs: MarshalledPair[]
// }

export interface MarshalledV3Route {
  protocol: Protocol
  input: MarshalledToken
  output: MarshalledToken
  pools: MarshalledPool[]
}

// export interface MarshalledMixedRoute {
//   protocol: Protocol
//   input: MarshalledToken
//   output: MarshalledToken
//   pools: (MarshalledPool | MarshalledPair)[]
// }

export type MarshalledRoute = MarshalledV3Route

export class RouteMarshaller {
  public static marshal(route: V3Route): MarshalledRoute {
    switch (route.protocol) {
      // case Protocol.V1:
      //   return {
      //     protocol: Protocol.V1,
      //     input: TokenMarshaller.marshal(route.input),
      //     output: TokenMarshaller.marshal(route.output),
      //     pairs: route.pairs.map((pair) => PairMarshaller.marshal(pair)),
      //   }
      case Protocol.V3:
        return {
          protocol: Protocol.V3,
          input: TokenMarshaller.marshal(route.input),
          output: TokenMarshaller.marshal(route.output),
          pools: route.pools.map((pool: Pool) => PoolMarshaller.marshal(pool)),
        }

      default:
        throw new Error(`Unsupported protocol: ${route.protocol}`);
      // case Protocol.MIXED:
      //   return {
      //     protocol: Protocol.MIXED,
      //     input: TokenMarshaller.marshal(route.input),
      //     output: TokenMarshaller.marshal(route.output),
      //     pools: route.pools.map((tpool) => {
      //       if (tpool instanceof Pool) {
      //         return PoolMarshaller.marshal(tpool)
      //       } else {
      //         return PairMarshaller.marshal(tpool)
      //       }
      //     }),
      //   }
    }
  }

  public static unmarshal(marshalledRoute: MarshalledRoute): V3Route {
    switch (marshalledRoute.protocol) {
      // case Protocol.V1:
      //   const v1Route = marshalledRoute as MarshalledV1Route
      //   return new V1Route(
      //     v1Route.pairs.map((marshalledPair) => PairMarshaller.unmarshal(marshalledPair)),
      //     TokenMarshaller.unmarshal(v1Route.input),
      //     TokenMarshaller.unmarshal(v1Route.output)
      //   )
      case Protocol.V3:
        const v3Route = marshalledRoute as MarshalledV3Route
        return new V3Route(
          v3Route.pools.map((marshalledPool) => PoolMarshaller.unmarshal(marshalledPool)),
          TokenMarshaller.unmarshal(v3Route.input),
          TokenMarshaller.unmarshal(v3Route.output)
        )
      default:
        throw new Error(`Unsupported protocol: ${marshalledRoute.protocol}`);
      //   case Protocol.MIXED:
      //     const mixedRoute = marshalledRoute as MarshalledMixedRoute
      //     const tpools = mixedRoute.pools.map((tpool) => {
      //       if (tpool.protocol === Protocol.V1) {
      //         return PairMarshaller.unmarshal(tpool as MarshalledPair)
      //       } else {
      //         return PoolMarshaller.unmarshal(tpool as MarshalledPool)
      //       }
      //     })

      //     return new MixedRoute(
      //       tpools,
      //       TokenMarshaller.unmarshal(mixedRoute.input),
      //       TokenMarshaller.unmarshal(mixedRoute.output)
      //     )
      // }
    }
  }
}
