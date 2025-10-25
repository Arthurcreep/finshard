import { AppKit } from '@reown/appkit';
import type { AppKitOptions } from '@reown/appkit';
import { type AdapterOptions } from '@reown/appkit-adapter-wagmi';
import type { Config } from '@wagmi/core';
export type WagmiAppKitOptions = Omit<AppKitOptions, 'adapters' | 'sdkType' | 'sdkVersion'> & AdapterOptions<Config>;
export declare function createAppKit(options: WagmiAppKitOptions): AppKit;
export { useAppKitTheme, useAppKit, useAppKitState, useAppKitEvents, useWalletInfo } from '@reown/appkit/library/vue';
