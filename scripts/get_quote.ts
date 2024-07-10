/**
 * ts-node --project=tsconfig.cdk.json scripts/get_quote.ts
 */
import axios, { AxiosResponse } from 'axios'
import dotenv from 'dotenv'
import { QuoteQueryParams } from '../lib/handlers/quote/schema/quote-schema'
import { QuoteResponse } from '../lib/handlers/schema'
dotenv.config()
  ; (async function () {
    const quotePost: QuoteQueryParams = {
      tokenInAddress: '0x4Bd692dbA81074BC2FA9abDcffE7324680d7A1c1',
      tokenInChainId: 919,
      tokenOutAddress: '0xF7ca2401709BC01Eba07d46c8d59e865C983e1AC',
      tokenOutChainId: 919,
      amount: '10000',
      type: 'exactIn',
    }

    const response: AxiosResponse<QuoteResponse> = await axios.post<QuoteResponse>(
      process.env.UNISWAP_ROUTING_API! + 'quote',
      quotePost
    )

    console.log({ response })
  })()
