import { AppKit } from '@reown/appkit';
import type { AppKitOptions } from '@reown/appkit';
import { type AdapterOptions } from '@reown/appkit-adapter-wagmi';
import { type Config, type CreateConfigParameters } from 'wagmi';
export type WagmiAppKitOptions = Omit<AppKitOptions, 'adapters' | 'sdkType' | 'sdkVersion'> & AdapterOptions<Config> & {
    wagmiConfig?: CreateConfigParameters;
};
export declare function createAppKit(options: WagmiAppKitOptions): AppKit;
export { useAppKitTheme, useAppKit, useAppKitState, useAppKitEvents, useWalletInfo } from '@reown/appkit/library/react';
