import { GasPrice, IGasPriceProvider } from 'sor5'
import { BigNumber } from 'ethers'

export class StaticGasPriceProvider implements IGasPriceProvider {
  constructor(private gasPriceWei: BigNumber) { }
  async getGasPrice(): Promise<GasPrice> {
    return { gasPriceWei: this.gasPriceWei }
  }
}
