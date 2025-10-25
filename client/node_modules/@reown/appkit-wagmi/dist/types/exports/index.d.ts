import { AppKit } from '@reown/appkit';
import type { AppKitOptions } from '@reown/appkit';
import { type AdapterOptions } from '@reown/appkit-adapter-wagmi';
import type { Config } from 'wagmi';
export type { AdapterOptions } from '@reown/appkit-adapter-wagmi';
export { authConnector } from '@reown/appkit-adapter-wagmi';
export type WagmiAppKitOptions = Omit<AppKitOptions, 'adapters' | 'sdkType' | 'sdkVersion'> & AdapterOptions<Config>;
export declare function createAppKit(options: WagmiAppKitOptions): AppKit;
